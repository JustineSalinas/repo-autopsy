// Standalone runner — calls the same logic as the API route, prints JSON.
// Run with: node --experimental-strip-types scripts/run-analysis.ts <repoUrl>

import { runDriftDetection } from "../lib/driftDetector.ts";
import { runBlastRadius } from "../lib/blastRadius.ts";
import { computeTrustScore } from "../lib/trustScore.ts";
import { getReadme, getFileTree, getFileContent, getOpenIssues } from "../lib/github.ts";
import type { RepoContext, RepoFile } from "../lib/types.ts";
import type { SourceFile } from "../lib/blastRadius.ts";
import { readFileSync } from "fs";
import { join } from "path";

// Load .env.local manually
try {
  const envPath = join(process.cwd(), ".env.local");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env.local — that's fine */ }

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift", "cs",
  "sh", "bash", "zsh", "yaml", "yml", "toml",
]);
const MANIFEST_CANDIDATES = ["package.json", "requirements.txt", "go.mod", "Cargo.toml", "pyproject.toml", "Gemfile"];
const SOURCE_DIR_PREFIXES = ["app/", "lib/", "src/", "components/", "pages/", "utils/"];
const MAX_CODE_FILES = 40;

const repoUrl = process.argv[2] ?? "https://github.com/JustineSalinas/pharmatrack";
const u = new URL(repoUrl.trim());
const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
const owner = parts[0];
const repo  = parts[1];

console.error(`Analyzing ${owner}/${repo} …`);

const rawTree = await getFileTree(owner, repo);
const fileTree: RepoFile[] = rawTree.map((f) => ({ path: f.path, type: f.type }));
const blobPaths = rawTree.filter((f) => f.type === "blob").map((f) => f.path);

const manifestCandidate = MANIFEST_CANDIDATES.find((c) => blobPaths.includes(c)) ?? null;
const envExamplePath = blobPaths.find((p) => /\.env\.?example$/i.test(p)) ?? null;
const gitignorePath = blobPaths.includes(".gitignore") ? ".gitignore" : null;

const isSourceFile = (p: string) => CODE_EXTENSIONS.has(p.split(".").pop()?.toLowerCase() ?? "");
const prioritised = blobPaths.filter((p) => isSourceFile(p) && SOURCE_DIR_PREFIXES.some((pr) => p.startsWith(pr)));
const rest = blobPaths.filter((p) => isSourceFile(p) && !SOURCE_DIR_PREFIXES.some((pr) => p.startsWith(pr)));
const codeBlobs = [...prioritised, ...rest].slice(0, MAX_CODE_FILES);

const [readmeContent, manifestContent, envExampleContent, gitignoreContent, issues] = await Promise.all([
  getReadme(owner, repo),
  manifestCandidate ? getFileContent(owner, repo, manifestCandidate) : Promise.resolve(null),
  envExamplePath ? getFileContent(owner, repo, envExamplePath) : Promise.resolve(null),
  gitignorePath ? getFileContent(owner, repo, gitignorePath) : Promise.resolve(null),
  getOpenIssues(owner, repo, 20).catch(() => []),
]);

const sourceFiles: SourceFile[] = (
  await Promise.all(
    codeBlobs.map(async (p) => {
      const content = await getFileContent(owner, repo, p);
      return content !== null ? { path: p, content } : null;
    })
  )
).filter((x): x is SourceFile => x !== null);

const ctx: RepoContext = { owner, repo, readmeContent, fileTree, manifestContent, manifestFile: manifestCandidate, envExampleContent, gitignoreContent };
const codeContents = sourceFiles.map((f) => f.content);

const driftReport = runDriftDetection(ctx, codeContents);
const starterTasks = runBlastRadius(sourceFiles, issues);
const trustScore   = computeTrustScore(driftReport.driftFindings, starterTasks);

console.log(JSON.stringify({ ...driftReport, starterTasks, trustScore }, null, 2));
