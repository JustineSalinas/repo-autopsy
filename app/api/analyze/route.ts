import { NextRequest, NextResponse } from "next/server";
import { runDriftDetection } from "@/lib/driftDetector";
import { runBlastRadius } from "@/lib/blastRadius";
import { computeTrustScore } from "@/lib/trustScore";
import { getReadme, getFileTree, getFileContent, getOpenIssues } from "@/lib/github";
import type { RepoContext, RepoFile, AnalyzeRequest } from "@/lib/types";
import type { SourceFile } from "@/lib/blastRadius";

// ---------------------------------------------------------------------------
// POST /api/analyze
// Body: { "repoUrl": "https://github.com/owner/repo" }
// ---------------------------------------------------------------------------

/** Extensions worth fetching for code scanning */
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift", "cs",
  "sh", "bash", "zsh",
  "yaml", "yml", "toml",
]);

/** Manifest filenames we probe in order (first match wins) */
const MANIFEST_CANDIDATES = [
  "package.json",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "Gemfile",
];

/**
 * Source directories we prioritise for code scanning.
 * Files under these prefixes are fetched before anything else.
 */
const SOURCE_DIR_PREFIXES = ["app/", "lib/", "src/", "components/", "pages/", "utils/"];

/** Hard cap on code file fetches — keeps us well inside rate limits */
const MAX_CODE_FILES = 40;

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

/** Fetch up to `limit` paths in parallel, returning {path, content} pairs */
async function fetchBatch(
  owner: string,
  repo: string,
  paths: string[],
  limit: number
): Promise<SourceFile[]> {
  const slice = paths.slice(0, limit);
  const results = await Promise.all(
    slice.map(async (p) => {
      const content = await getFileContent(owner, repo, p);
      return content !== null ? { path: p, content } : null;
    })
  );
  return results.filter((r): r is SourceFile => r !== null);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseRepoUrl(body.repoUrl ?? "");
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not parse a GitHub repo URL from the request." },
      { status: 400 }
    );
  }

  const { owner, repo } = parsed;

  // ── 1. Fetch file tree ──────────────────────────────────────────────────
  let rawTree: Awaited<ReturnType<typeof getFileTree>>;
  try {
    rawTree = await getFileTree(owner, repo);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  if (rawTree.length === 0) {
    return NextResponse.json(
      { error: `Repository ${owner}/${repo} not found or is empty.` },
      { status: 404 }
    );
  }

  const fileTree: RepoFile[] = rawTree.map((f) => ({ path: f.path, type: f.type }));
  const blobPaths = rawTree.filter((f) => f.type === "blob").map((f) => f.path);

  // ── 2. Identify special files ───────────────────────────────────────────
  const manifestCandidate = MANIFEST_CANDIDATES.find((c) => blobPaths.includes(c)) ?? null;
  const envExamplePath = blobPaths.find((p) => /\.env\.?example$/i.test(p)) ?? null;
  const gitignorePath = blobPaths.includes(".gitignore") ? ".gitignore" : null;

  // ── 3. Prioritise source blobs ──────────────────────────────────────────
  const isSourceFile = (p: string) => {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    return CODE_EXTENSIONS.has(ext);
  };

  const prioritised = blobPaths.filter(
    (p) => isSourceFile(p) && SOURCE_DIR_PREFIXES.some((prefix) => p.startsWith(prefix))
  );
  const rest = blobPaths.filter(
    (p) => isSourceFile(p) && !SOURCE_DIR_PREFIXES.some((prefix) => p.startsWith(prefix))
  );
  // Prioritised files first, then fill remaining slots from the rest
  const codeBlobs = [...prioritised, ...rest].slice(0, MAX_CODE_FILES);

  // ── 4. Fetch everything in parallel ─────────────────────────────────────
  // README, manifest, .env.example, gitignore, code files, open issues —
  // all in one round-trip.
  let readmeContent: string | null;
  let manifestContent: string | null;
  let envExampleContent: string | null;
  let gitignoreContent: string | null;
  let sourceFiles: SourceFile[];
  let issues: Awaited<ReturnType<typeof getOpenIssues>>;

  try {
    [readmeContent, manifestContent, envExampleContent, gitignoreContent, sourceFiles, issues] =
      await Promise.all([
        getReadme(owner, repo),
        manifestCandidate ? getFileContent(owner, repo, manifestCandidate) : Promise.resolve(null),
        envExamplePath ? getFileContent(owner, repo, envExamplePath) : Promise.resolve(null),
        gitignorePath ? getFileContent(owner, repo, gitignorePath) : Promise.resolve(null),
        fetchBatch(owner, repo, codeBlobs, MAX_CODE_FILES),
        getOpenIssues(owner, repo, 20).catch(() => []),  // issues are best-effort
      ]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  // ── 5. Build context & run Stage 1 (drift) + Stage 2 (blast radius) ─────
  const ctx: RepoContext = {
    owner,
    repo,
    readmeContent,
    fileTree,
    manifestContent,
    manifestFile: manifestCandidate,
    envExampleContent,
    gitignoreContent,
  };

  // Stage 1 detectors still use plain string content
  const codeContents = sourceFiles.map((f) => f.content);

  const driftReport = runDriftDetection(ctx, codeContents);
  const starterTasks = runBlastRadius(sourceFiles, issues);
  const trustScore = computeTrustScore(driftReport.driftFindings, starterTasks);

  return NextResponse.json({ ...driftReport, starterTasks, trustScore });
}
