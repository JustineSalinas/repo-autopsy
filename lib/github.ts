// ---------------------------------------------------------------------------
// Repo Autopsy — GitHub data fetcher
// Routes all GitHub access through the GitHub REST API using GITHUB_TOKEN.
// The API route calls these helpers instead of raw fetch() scattered everywhere.
// ---------------------------------------------------------------------------

const BASE = "https://api.github.com";
const FETCH_TIMEOUT_MS = 8_000;

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function ghFetch(path: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: headers(),
      signal: ac.signal,
    });
    // Surface rate-limit / auth errors immediately so callers don't silently swallow them
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = res.headers.get("x-ratelimit-reset");
      const resetDate = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
      throw new Error(
        `GitHub API rate limit hit (HTTP ${res.status}). ` +
        `Remaining: ${remaining ?? "0"}, resets at ${resetDate}. ` +
        `Set GITHUB_TOKEN in .env.local to raise the limit to 5 000 req/hour.`
      );
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// File tree (recursive git tree)
// ---------------------------------------------------------------------------
export interface TreeItem {
  path: string;
  type: "blob" | "tree";
  sha?: string;
}

export async function getFileTree(
  owner: string,
  repo: string
): Promise<TreeItem[]> {
  // First resolve the default branch SHA
  const repoRes = await ghFetch(`/repos/${owner}/${repo}`);
  if (!repoRes.ok) return [];
  const repoData = (await repoRes.json()) as { default_branch: string };
  const branch = repoData.default_branch ?? "main";

  const treeRes = await ghFetch(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  if (!treeRes.ok) return [];
  const treeData = (await treeRes.json()) as { tree: TreeItem[] };
  return treeData.tree ?? [];
}

// ---------------------------------------------------------------------------
// File content (base64-decoded)
// ---------------------------------------------------------------------------
export async function getFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  const res = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return null;
  // Strip newlines GitHub adds to base64 payloads
  const clean = data.content.replace(/\n/g, "");
  return Buffer.from(clean, "base64").toString("utf-8");
}

// ---------------------------------------------------------------------------
// README (uses the dedicated /readme endpoint so we get the right file)
// ---------------------------------------------------------------------------
export async function getReadme(
  owner: string,
  repo: string
): Promise<string | null> {
  const res = await ghFetch(`/repos/${owner}/${repo}/readme`);
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return null;
  const clean = data.content.replace(/\n/g, "");
  return Buffer.from(clean, "base64").toString("utf-8");
}

// ---------------------------------------------------------------------------
// Open issues (capped at `limit`, default 20)
// ---------------------------------------------------------------------------
export interface GhIssue {
  number: number;
  title: string;
  labels: string[];
}

export async function getOpenIssues(
  owner: string,
  repo: string,
  limit = 20
): Promise<GhIssue[]> {
  const per_page = Math.min(limit, 100);
  const res = await ghFetch(
    `/repos/${owner}/${repo}/issues?state=open&per_page=${per_page}&page=1`
  );
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<{
    number: number;
    title: string;
    pull_request?: unknown;
    labels: Array<{ name?: string }>;
  }>;
  return raw
    .filter((i) => !i.pull_request)          // exclude PRs from the issues endpoint
    .slice(0, limit)
    .map((i) => ({
      number: i.number,
      title: i.title,
      labels: i.labels.map((l) => l.name ?? "").filter(Boolean),
    }));
}
