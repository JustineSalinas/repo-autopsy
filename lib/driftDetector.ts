// ---------------------------------------------------------------------------
// Repo Autopsy — Stage 1: Documentation Drift Detector
// ---------------------------------------------------------------------------
// Each detector function receives the RepoContext assembled by the API route
// and returns zero or more DriftFinding objects.  Add more detectors here for
// Stage 2 / Stage 3 without touching the API route.
// ---------------------------------------------------------------------------

import type { DriftFinding, DriftReport, RepoContext } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract every ${VAR}, $VAR, or %VAR% token from a string */
function extractEnvVarRefs(text: string): Set<string> {
  const refs = new Set<string>();
  // ${FOO}, $FOO (shell style)
  for (const m of text.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)) {
    refs.add(m[1]);
  }
  // Windows %FOO%
  for (const m of text.matchAll(/%([A-Z_][A-Z0-9_]+)%/gi)) {
    refs.add(m[1].toUpperCase());
  }
  return refs;
}

/** Very cheap "does this text mention this token anywhere" check */
function mentionedInCode(codeFiles: string[], token: string): boolean {
  const needle = token.toLowerCase();
  return codeFiles.some((c) => c.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// Signal A: env vars referenced in README / .env.example but unused in code
// ---------------------------------------------------------------------------
function detectUnusedEnvVars(
  ctx: RepoContext,
  codeContents: string[]
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  const sources = [ctx.readmeContent ?? "", ctx.envExampleContent ?? ""].join(
    "\n"
  );
  if (!sources.trim()) return findings;

  const mentioned = extractEnvVarRefs(sources);

  // Skip very generic names (PATH, HOME, NODE_ENV, etc.) that are expected
  const ignore = new Set([
    "PATH",
    "HOME",
    "USER",
    "SHELL",
    "PWD",
    "NODE_ENV",
    "CI",
    "PORT",
    "HOST",
    "NODE",
    "NPM_TOKEN",
  ]);

  for (const varName of mentioned) {
    if (ignore.has(varName)) continue;
    if (!mentionedInCode(codeContents, varName)) {
      findings.push({
        type: "unused_env_var",
        description: `Environment variable "${varName}" is documented but not referenced in any source file.`,
        severity: "medium",
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Signal B: setup steps reference files / scripts that don't exist
// ---------------------------------------------------------------------------

/**
 * Parse a .gitignore file into a set of normalised lowercase patterns.
 * We only need simple literal matches (no glob engine) for the purpose of
 * deciding whether a file is intentionally absent from the repo.
 */
function parseGitignorePatterns(content: string): Set<string> {
  const patterns = new Set<string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // Strip leading slash so both "/dist" and "dist" normalise the same way
    patterns.add(line.replace(/^\//, "").toLowerCase());
  }
  return patterns;
}

/**
 * Returns true if `filename` (lowercased) is covered by any gitignore pattern.
 * Handles exact matches and simple prefix/suffix globs (e.g. "*.local").
 */
function isGitignored(filename: string, patterns: Set<string>): boolean {
  const f = filename.toLowerCase();
  for (const pat of patterns) {
    if (pat === f) return true;
    // Glob: *.ext  →  matches anything ending with .ext
    if (pat.startsWith("*") && f.endsWith(pat.slice(1))) return true;
    // Glob: prefix/*  →  matches anything starting with that directory
    if (pat.endsWith("/*") && f.startsWith(pat.slice(0, -2))) return true;
    // Plain directory name matches files inside it
    if (!pat.includes("/") && !pat.includes("*") && f.startsWith(pat + "/")) return true;
  }
  return false;
}

/**
 * Files that are intentionally absent from every repo and should never be
 * flagged as missing, regardless of what the README says.
 */
const ALWAYS_LOCAL_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".cache",
  "coverage",
]);

/**
 * Verb phrases in the README that indicate the user is expected to CREATE the
 * file themselves — not that it should already exist in the repo.
 * If a sentence containing the filename has one of these verbs, skip it.
 */
const CREATE_INTENT_VERBS = /\b(create|copy|duplicate|add|make|generate|initialise|initialize|rename|touch)\b/i;

function detectMissingSetupFiles(
  ctx: RepoContext,
  _codeContents: string[]
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  if (!ctx.readmeContent) return findings;

  const filePaths = new Set(ctx.fileTree.map((f) => f.path.toLowerCase()));
  const gitignorePatterns = ctx.gitignoreContent
    ? parseGitignorePatterns(ctx.gitignoreContent)
    : new Set<string>();

  /**
   * Returns true if flagging this filename as missing would be a false positive:
   * - it's always-local (should never be committed)
   * - it matches a .gitignore pattern in the target repo
   * - the README sentence that mentions it uses a "create/copy" verb
   */
  function shouldSkip(filename: string, sentence: string): boolean {
    const f = filename.toLowerCase();
    if (ALWAYS_LOCAL_FILES.has(f)) return true;
    if (isGitignored(f, gitignorePatterns)) return true;
    if (CREATE_INTENT_VERBS.test(sentence)) return true;
    return false;
  }

  // ── npm script references ──────────────────────────────────────────────
  if (ctx.manifestContent && ctx.manifestFile === "package.json") {
    try {
      const pkg = JSON.parse(ctx.manifestContent) as {
        scripts?: Record<string, string>;
      };
      const scripts = new Set(Object.keys(pkg.scripts ?? {}));
      const scriptPattern = /(?:npm run|yarn run|pnpm run)\s+([\w:.-]+)/gi;

      for (const m of ctx.readmeContent.matchAll(scriptPattern)) {
        const name = m[1].trim().toLowerCase();
        if (!scripts.has(name) && !filePaths.has(name)) {
          // Get surrounding sentence for intent check
          const sentence = m[0];
          if (!shouldSkip(name, sentence)) {
            findings.push({
              type: "missing_setup_file",
              description: `README references npm script "${name}" which is not defined in package.json.`,
              severity: "high",
            });
          }
        }
      }
    } catch {
      // malformed JSON — skip
    }
  }

  // ── Common setup files that should exist if mentioned ─────────────────
  // Only check files that are meaningful to have in-repo (not always-local).
  const checkableSetupFiles = [
    ".env.example",
    "makefile",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "setup.sh",
    "install.sh",
    "bootstrap.sh",
  ];

  const readme = ctx.readmeContent;
  for (const f of checkableSetupFiles) {
    if (!readme.toLowerCase().includes(f)) continue;
    if (filePaths.has(f)) continue;
    if (isGitignored(f, gitignorePatterns)) continue;

    // Find the sentence(s) mentioning this file to check for create-intent verbs
    const sentences = readme.split(/(?<=[.!?\n])/);
    const mentioningSentence = sentences.find((s) =>
      s.toLowerCase().includes(f)
    ) ?? "";

    if (CREATE_INTENT_VERBS.test(mentioningSentence)) continue;

    findings.push({
      type: "missing_setup_file",
      description: `README mentions "${f}" but the file does not exist in the repository.`,
      severity: "medium",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Signal C: features / endpoints described in README but not found in code
// ---------------------------------------------------------------------------
function detectStaleDescriptions(
  ctx: RepoContext,
  codeContents: string[]
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  if (!ctx.readmeContent) return findings;

  // We look for HTTP-verb + path pairs, or bare paths that look like API routes.
  // Strategy: find candidate matches, then discard anything that is part of a URL
  // (preceded by a scheme, hostname, or port number) — those are examples /
  // localhost references, not route definitions.
  const routePattern =
    /(?:(?:GET|POST|PUT|DELETE|PATCH)\s+)?(\/[\w/:{}-]{3,})/gi;

  // Build a de-duplicated list of genuine route candidates
  const seen = new Set<string>();
  const mentionedRoutes: string[] = [];

  for (const m of ctx.readmeContent.matchAll(routePattern)) {
    const route = m[1];
    const matchStart = m.index ?? 0;

    // Look at up to 30 characters before the match for URL context
    const before = ctx.readmeContent.slice(Math.max(0, matchStart - 30), matchStart);

    // Skip if the slash is immediately preceded by a hostname, scheme, or port
    // e.g. "http://localhost:3000/..." or "github.com/owner/..."
    if (/(?:https?:|localhost|[\w.-]+\.\w{2,}|:\d{2,5})\s*$/.test(before)) continue;

    // Skip generic single-segment paths like "/users", "/home" that aren't API-shaped
    // Only keep paths with at least 2 segments or an /api/ prefix
    const segments = route.split("/").filter(Boolean);
    if (segments.length < 2 && !segments[0]?.startsWith("api")) continue;

    if (!seen.has(route)) {
      seen.add(route);
      mentionedRoutes.push(route);
    }
  }

  const allCode = codeContents.join("\n").toLowerCase();

  for (const route of mentionedRoutes) {
    // Normalise: strip leading slash, drop path params
    const normalised = route
      .replace(/^\//, "")
      .replace(/:[^/]+/g, "")
      .replace(/\{[^}]+\}/g, "")
      .toLowerCase();

    if (normalised.length < 3) continue;

    // Check if any meaningful path segment appears in source files
    const segments = normalised.split(/[/\\-]/).filter((s) => s.length > 2);
    if (segments.length === 0) continue;

    const found = segments.some((seg) => allCode.includes(seg));

    if (!found) {
      findings.push({
        type: "stale_description",
        description: `README documents route/endpoint "${route}" but no matching implementation was found in the codebase.`,
        severity: "low",
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export function runDriftDetection(
  ctx: RepoContext,
  codeContents: string[]
): Omit<DriftReport, "starterTasks" | "trustScore"> {
  const findings: DriftFinding[] = [
    ...detectUnusedEnvVars(ctx, codeContents),
    ...detectMissingSetupFiles(ctx, codeContents),
    ...detectStaleDescriptions(ctx, codeContents),
  ];

  return {
    repo: `${ctx.owner}/${ctx.repo}`,
    driftFindings: findings,
    meta: {
      readmeFound: ctx.readmeContent !== null,
      filesScanned: ctx.fileTree.length,
    },
  };
}
