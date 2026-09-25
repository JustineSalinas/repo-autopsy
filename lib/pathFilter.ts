// ---------------------------------------------------------------------------
// Shared path-filter: keep vendored / generated files out of analysis
// ---------------------------------------------------------------------------

/** Directory segments that indicate vendored or generated code */
const IGNORED_DIR_SEGMENTS = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  ".next/",
  "out/",
  "coverage/",
  "bower_components/",
];

/** File suffixes that indicate minified / generated / declaration files */
const IGNORED_SUFFIXES = [
  ".min.js",
  ".min.css",
  ".map",
  ".d.ts",
];

/** Exact lockfile names to exclude */
const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

/**
 * Returns true if `filePath` should be excluded from analysis because it is
 * vendored, generated, or otherwise not meaningful first-party source code.
 *
 * Pass `gitignorePatterns` (from `parseGitignorePatterns` in driftDetector)
 * to also honour the target repo's own .gitignore.
 */
export function isIgnoredPath(
  filePath: string,
  gitignorePatterns?: Set<string>
): boolean {
  // Exact lockfile names (basename match)
  const basename = filePath.includes("/")
    ? filePath.slice(filePath.lastIndexOf("/") + 1)
    : filePath;
  if (LOCKFILES.has(basename)) return true;

  // Directory segment check (works even for paths like "a/node_modules/b")
  for (const seg of IGNORED_DIR_SEGMENTS) {
    if (filePath.includes(seg)) return true;
  }

  // Suffix check
  for (const suffix of IGNORED_SUFFIXES) {
    if (filePath.endsWith(suffix)) return true;
  }

  // Honour .gitignore patterns from the target repo when provided
  if (gitignorePatterns) {
    const f = filePath.toLowerCase();
    for (const pat of gitignorePatterns) {
      if (pat === f) return true;
      // *.ext  →  suffix glob
      if (pat.startsWith("*") && f.endsWith(pat.slice(1))) return true;
      // dir/*  →  files directly inside dir
      if (pat.endsWith("/*") && f.startsWith(pat.slice(0, -2))) return true;
      // dir/  →  everything inside that directory (trailing slash = dir marker)
      if (pat.endsWith("/") && f.startsWith(pat)) return true;
      // bare name (no slashes, no globs) →  matches as directory prefix
      if (!pat.includes("/") && !pat.includes("*") && f.startsWith(pat + "/")) return true;
    }
  }

  return false;
}

/**
 * Parse a .gitignore file into a set of normalised lowercase patterns
 * suitable for passing to `isIgnoredPath`.
 */
export function parseGitignorePatterns(content: string): Set<string> {
  const patterns = new Set<string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    patterns.add(line.replace(/^\//, "").toLowerCase());
  }
  return patterns;
}
