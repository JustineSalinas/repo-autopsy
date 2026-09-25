// ---------------------------------------------------------------------------
// Repo Autopsy — Stage 2: Blast-radius ranking of starter tasks
// ---------------------------------------------------------------------------
// Inputs:
//   - sourceFiles: { path, content }[] already fetched by the route
//   - issues:      GhIssue[] from the GitHub issues endpoint
//
// Outputs:
//   StarterTask[] sorted safest-first (ascending dependents, unknowns last)
// ---------------------------------------------------------------------------

import type { StarterTask, RiskLevel } from "./types";
import type { GhIssue } from "./github";
import { isIgnoredPath } from "./pathFilter";

export interface SourceFile {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// 1. TODO / FIXME / HACK extraction
// ---------------------------------------------------------------------------

interface TodoItem {
  file: string;
  line: number;   // 1-based
  text: string;   // the comment text after the keyword
  keyword: string;
}

const TODO_RE = /\/\/\s*(TODO|FIXME|HACK)[:\s]+(.*)/gi;

export function extractTodos(files: SourceFile[]): TodoItem[] {
  const results: TodoItem[] = [];
  for (const { path, content } of files) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      TODO_RE.lastIndex = 0;
      const m = TODO_RE.exec(lines[i]);
      if (m) {
        results.push({
          file: path,
          line: i + 1,
          keyword: m[1].toUpperCase(),
          text: m[2].trim(),
        });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 2. Import graph (JS/TS — relative paths → reverse + forward maps)
// ---------------------------------------------------------------------------

/** Maps  filePath  →  Set<filePath>  of files that IMPORT it (reverse deps) */
export type ReverseDepMap = Map<string, Set<string>>;
/** Maps  filePath  →  Set<filePath>  of files that it IMPORTS (forward deps) */
export type ForwardDepMap = Map<string, Set<string>>;

const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function resolveImport(
  specifier: string,
  fromFile: string,
  knownPaths: Set<string>
): string | null {
  if (!specifier.startsWith(".")) return null;

  const fromDir = fromFile.includes("/")
    ? fromFile.slice(0, fromFile.lastIndexOf("/"))
    : "";

  const joined = fromDir ? `${fromDir}/${specifier}` : specifier;
  const parts = joined.split("/");
  const normalised: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") { normalised.pop(); continue; }
    normalised.push(part);
  }
  const base = normalised.join("/");

  if (knownPaths.has(base)) return base;
  for (const ext of RESOLVE_EXTS) {
    const c = base + ext;
    if (knownPaths.has(c)) return c;
  }
  for (const ext of RESOLVE_EXTS) {
    const c = `${base}/index${ext}`;
    if (knownPaths.has(c)) return c;
  }
  return null;
}

/** Returns [relative specifier | null, bare package name | null] */
function classifySpecifier(spec: string): { relative: string | null; pkg: string | null } {
  if (spec.startsWith(".")) return { relative: spec, pkg: null };
  // bare specifier → extract package name (@scope/name or name)
  const pkg = spec.startsWith("@")
    ? spec.split("/").slice(0, 2).join("/")
    : spec.split("/")[0];
  return { relative: null, pkg: pkg || null };
}

function parseImports(content: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\b[^"'`]*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const re of patterns) {
    for (const m of content.matchAll(re)) specifiers.push(m[1]);
  }
  return specifiers;
}

export interface DepMaps {
  reverse: ReverseDepMap;
  forward: ForwardDepMap;
}

export function buildDepMaps(files: SourceFile[]): DepMaps {
  const knownPaths = new Set(files.map((f) => f.path));
  const reverse: ReverseDepMap = new Map();
  const forward: ForwardDepMap = new Map();

  for (const { path } of files) {
    reverse.set(path, new Set());
    forward.set(path, new Set());
  }

  for (const { path: fromFile, content } of files) {
    for (const spec of parseImports(content)) {
      const resolved = resolveImport(spec, fromFile, knownPaths);
      if (resolved) {
        reverse.get(resolved)?.add(fromFile) ?? reverse.set(resolved, new Set([fromFile]));
        forward.get(fromFile)?.add(resolved) ?? forward.set(fromFile, new Set([resolved]));
      }
    }
  }

  return { reverse, forward };
}

// ---------------------------------------------------------------------------
// 3. BFS helpers (reverse = dependents, forward = dependencies)
// ---------------------------------------------------------------------------

const BFS_MAX_DEPTH = 5;

function bfsCount(startFile: string, graph: Map<string, Set<string>>): number {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: startFile, depth: 0 }];
  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (depth >= BFS_MAX_DEPTH) continue;
    for (const neighbour of graph.get(file) ?? []) {
      if (!visited.has(neighbour) && neighbour !== startFile) {
        visited.add(neighbour);
        queue.push({ file: neighbour, depth: depth + 1 });
      }
    }
  }
  return visited.size;
}

export function countTransitiveDependents(startFile: string, reverse: ReverseDepMap): number {
  return bfsCount(startFile, reverse);
}

export function countTransitiveDependencies(startFile: string, forward: ForwardDepMap): number {
  return bfsCount(startFile, forward);
}

// ---------------------------------------------------------------------------
// 4. Entry-point detection
// ---------------------------------------------------------------------------

/**
 * Entry points have no importers in the graph but are runtime-exposed.
 * Score = forward deps (modules they pull in) + 5.
 */
function isEntryPoint(path: string): boolean {
  return (
    /^(src\/)?app\/.*\/(route|page)\.(ts|tsx|js|jsx)$/.test(path) ||
    /^(src\/)?pages\/api\//.test(path) ||
    /^(src\/)?middleware\.(ts|tsx|js|jsx)$/.test(path)
  );
}

// ---------------------------------------------------------------------------
// 5. Dependency-issue detection
// ---------------------------------------------------------------------------

/** Known dev-only package name prefixes/exact matches */
const DEV_PACKAGE_PATTERNS = [
  "vitest", "@vitest", "jest", "@jest",
  "eslint", "@eslint", "prettier",
  "postcss", "autoprefixer",
  "tailwindcss",
  "typescript", "ts-node", "tsx",
  "webpack", "vite", "@vitejs",
  "rollup", "esbuild", "swc",
  "husky", "lint-staged",
  "nodemon", "concurrently",
  "baseline-browser-mapping",  // build-time only
  "@playwright", "cypress",
];

function isDevPackage(pkgName: string): boolean {
  const n = pkgName.toLowerCase();
  return DEV_PACKAGE_PATTERNS.some((p) => n === p || n.startsWith(p + "/") || n.startsWith(p + "-"));
}

/**
 * Try to extract a bare package name from an issue title.
 * Looks for: backtick-quoted names, bracket-enclosed names, or standalone
 * words that look like npm packages (contain a hyphen or @ scope).
 */
function extractPackageFromTitle(title: string): string | null {
  // Backtick: `pkg-name` or `@scope/pkg`
  const backtick = title.match(/`(@?[\w][\w./-]+)`/);
  if (backtick) return backtick[1].split("/").slice(0, backtick[1].startsWith("@") ? 2 : 1).join("/");

  // Square-bracket hint: [Dependency][...] pkg-name — first word after the brackets
  const afterBrackets = title.match(/\]\s+([^\s[]+)/);
  if (afterBrackets) {
    const word = afterBrackets[1].replace(/[^\w@/-]/g, "");
    if (word.includes("-") || word.startsWith("@")) return word;
  }

  // Last fallback: any @scope/pkg pattern in the title
  const scopedPkg = title.match(/@[\w-]+\/[\w-]+/);
  if (scopedPkg) return scopedPkg[0];

  return null;
}

/** Return true if the issue looks like a dependency/package issue */
function isDependencyIssue(issue: GhIssue): boolean {
  const titleLower = issue.title.toLowerCase();
  const hasDepLabel = issue.labels.some((l) =>
    /depend(ency|encie|encies)?/i.test(l)
  );
  const hasTitleMarker = /\[depend|\bdependency\b|\bpackage\b|\bbump\b|\bupgrade\b/i.test(titleLower);
  return hasDepLabel || hasTitleMarker;
}

/**
 * Count how many source files import the given bare package name.
 */
function countPackageImporters(pkgName: string, files: SourceFile[]): number {
  // Match import from 'pkg', import from 'pkg/subpath', require('pkg'), require('pkg/...')
  const escapedPkg = pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`["'\`]${escapedPkg}(?:/[^"'\`]*)?["'\`]`);
  return files.filter((f) => re.test(f.content)).length;
}

// ---------------------------------------------------------------------------
// 6. Security/High label bumping
// ---------------------------------------------------------------------------

function isSecurityHighIssue(issue: GhIssue): boolean {
  const combined = [issue.title, ...issue.labels].join(" ").toLowerCase();
  return /\b(security|high|critical|cve)\b/.test(combined);
}

function bumpRisk(risk: RiskLevel): RiskLevel {
  if (risk === "safe") return "moderate";
  if (risk === "moderate") return "risky";
  return risk; // risky and unknown don't bump further
}

// ---------------------------------------------------------------------------
// 7. Risk classification & reason builders
// ---------------------------------------------------------------------------

function classifyRisk(dependents: number): RiskLevel {
  if (dependents <= 2) return "safe";
  if (dependents <= 7) return "moderate";
  return "risky";
}

function reasonForTodo(risk: RiskLevel, dependents: number, isEntry: boolean, forwardDeps: number): string {
  if (isEntry) {
    return `Public entry point (route/page/middleware); touches ${forwardDeps} module${forwardDeps === 1 ? "" : "s"} transitively.`;
  }
  const depClause =
    dependents === 0
      ? "No other files import this file"
      : dependents === 1
      ? "1 file imports this"
      : `${dependents} files transitively depend on this`;
  const riskSuffix =
    risk === "safe" ? "isolated change." :
    risk === "moderate" ? "moderate ripple risk." :
    "high ripple risk — review dependents before changing.";
  return `${depClause}; ${riskSuffix}`;
}

function reasonForDepIssue(pkgName: string, importerCount: number, isDev: boolean, bumped: boolean): string {
  if (isDev) return `Dev tooling only; bump version and run tests.`;
  const base =
    importerCount === 0
      ? `Package "${pkgName}" not found in scanned sources`
      : importerCount === 1
      ? `Package "${pkgName}" used in 1 file`
      : `Package "${pkgName}" used in ${importerCount} files`;
  const suffix = bumped ? "; security/severity label raised risk one level." : ".";
  return `${base}${suffix}`;
}

function reasonForIssue(
  risk: RiskLevel,
  dependents: number | null,
  bumped: boolean
): string {
  if (dependents === null) {
    return bumped
      ? "No matching files found; security/severity label raised risk to moderate."
      : "No source files matched keywords; blast radius could not be estimated.";
  }
  const depClause =
    dependents === 0
      ? "No source files directly matched"
      : dependents === 1
      ? "1 matched file has no dependents"
      : `Matched files touch ${dependents} modules transitively`;
  const riskSuffix =
    risk === "safe" ? "safe to attempt." :
    risk === "moderate" ? "moderate ripple risk." :
    "high ripple risk — review carefully.";
  const bump = bumped ? " Security/severity label raised risk one level." : "";
  return `${depClause}; ${riskSuffix}${bump}`;
}

// ---------------------------------------------------------------------------
// 8. Public entry point
// ---------------------------------------------------------------------------

export function runBlastRadius(
  files: SourceFile[],
  issues: GhIssue[],
  gitignorePatterns?: Set<string>
): StarterTask[] {
  const filteredFiles = files.filter((f) => !isIgnoredPath(f.path, gitignorePatterns));
  const { reverse, forward } = buildDepMaps(filteredFiles);
  const tasks: StarterTask[] = [];

  // ── TODOs ────────────────────────────────────────────────────────────────
  const todos = extractTodos(filteredFiles);
  for (const todo of todos) {
    const entry = isEntryPoint(todo.file);
    let dependents: number;
    let risk: RiskLevel;

    if (entry) {
      const forwardDeps = countTransitiveDependencies(todo.file, forward);
      dependents = forwardDeps + 5;
      risk = classifyRisk(dependents);
      tasks.push({
        id: `todo:${todo.file}:${todo.line}`,
        source: "todo",
        title: `${todo.keyword}: ${todo.text}`,
        file: todo.file,
        line: todo.line,
        dependents,
        risk,
        reason: reasonForTodo(risk, dependents, true, forwardDeps),
      });
    } else {
      dependents = countTransitiveDependents(todo.file, reverse);
      risk = classifyRisk(dependents);
      tasks.push({
        id: `todo:${todo.file}:${todo.line}`,
        source: "todo",
        title: `${todo.keyword}: ${todo.text}`,
        file: todo.file,
        line: todo.line,
        dependents,
        risk,
        reason: reasonForTodo(risk, dependents, false, 0),
      });
    }
  }

  // ── Issues ───────────────────────────────────────────────────────────────
  for (const issue of issues) {
    const secHigh = isSecurityHighIssue(issue);

    // ── Dependency issues ─────────────────────────────────────────────────
    if (isDependencyIssue(issue)) {
      const pkgName = extractPackageFromTitle(issue.title);

      if (pkgName && isDevPackage(pkgName)) {
        // Dev tooling: always safe regardless of security label
        tasks.push({
          id: `issue:${issue.number}`,
          source: "issue",
          title: issue.title,
          issueNumber: issue.number,
          labels: issue.labels,
          dependents: 0,
          risk: "safe",
          reason: reasonForDepIssue(pkgName, 0, true, false),
        });
        continue;
      }

      if (pkgName) {
        const importerCount = countPackageImporters(pkgName, files);
        let risk = classifyRisk(importerCount);
        const bumped = secHigh && risk !== "risky";
        if (bumped) risk = bumpRisk(risk);
        tasks.push({
          id: `issue:${issue.number}`,
          source: "issue",
          title: issue.title,
          issueNumber: issue.number,
          labels: issue.labels,
          dependents: importerCount,
          risk,
          reason: reasonForDepIssue(pkgName, importerCount, false, bumped),
        });
        continue;
      }
    }

    // ── General issues — match to file paths ──────────────────────────────
    const keywords = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    const matchedPaths = filteredFiles
      .map((f) => f.path)
      .filter((p) => keywords.some((kw) => p.toLowerCase().includes(kw)));

    if (matchedPaths.length === 0) {
      // No file match, no package match → unknown
      let risk: RiskLevel = "unknown";
      let dependents: number | null = null;
      let bumped = false;
      if (secHigh) {
        risk = "moderate";  // security bump even without a file match
        bumped = true;
      }
      tasks.push({
        id: `issue:${issue.number}`,
        source: "issue",
        title: issue.title,
        issueNumber: issue.number,
        labels: issue.labels,
        dependents,
        risk,
        reason: reasonForIssue(risk, dependents, bumped),
      });
      continue;
    }

    // Matched files: use max of (reverse deps from matched file, entry-point score)
    const scores = matchedPaths.map((p) => {
      if (isEntryPoint(p)) return countTransitiveDependencies(p, forward) + 5;
      return countTransitiveDependents(p, reverse);
    });
    const maxDependents = Math.max(...scores);
    let risk = classifyRisk(maxDependents);
    const bumped = secHigh && risk !== "risky";
    if (bumped) risk = bumpRisk(risk);

    tasks.push({
      id: `issue:${issue.number}`,
      source: "issue",
      title: issue.title,
      issueNumber: issue.number,
      labels: issue.labels,
      dependents: maxDependents,
      risk,
      reason: reasonForIssue(risk, maxDependents, bumped),
    });
  }

  // ── Sort: safe < moderate < risky < unknown, then by dependents asc ──────
  const riskOrder: Record<RiskLevel, number> = {
    safe: 0, moderate: 1, risky: 2, unknown: 3,
  };

  tasks.sort((a, b) => {
    const rDiff = riskOrder[a.risk] - riskOrder[b.risk];
    if (rDiff !== 0) return rDiff;
    // null dependents sort last within their risk group
    if (a.dependents === null && b.dependents === null) return 0;
    if (a.dependents === null) return 1;
    if (b.dependents === null) return -1;
    return a.dependents - b.dependents;
  });

  return tasks;
}

// ---------------------------------------------------------------------------
// Internal: stop words for keyword extraction
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "add", "fix", "bug",
  "not", "use", "get", "set", "new", "all", "any", "can", "from",
  "via", "doesn", "doesn't", "invalid", "input",
]);
