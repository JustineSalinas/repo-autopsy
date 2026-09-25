import { describe, it, expect } from "vitest";
import {
  extractTodos,
  buildDepMaps,
  countTransitiveDependents,
  countTransitiveDependencies,
  runBlastRadius,
  type SourceFile,
} from "../blastRadius";
import type { GhIssue } from "../github";

// ── extractTodos ─────────────────────────────────────────────────────────────

describe("extractTodos", () => {
  it("extracts a TODO comment", () => {
    const files: SourceFile[] = [
      { path: "src/a.ts", content: "// TODO: fix the thing\n" },
    ];
    const todos = extractTodos(files);
    expect(todos).toHaveLength(1);
    expect(todos[0].keyword).toBe("TODO");
    expect(todos[0].text).toBe("fix the thing");
    expect(todos[0].file).toBe("src/a.ts");
    expect(todos[0].line).toBe(1);
  });

  it("extracts FIXME and HACK comments", () => {
    const files: SourceFile[] = [
      { path: "src/b.ts", content: "// FIXME: broken\n// HACK: workaround\n" },
    ];
    const todos = extractTodos(files);
    expect(todos).toHaveLength(2);
    expect(todos[0].keyword).toBe("FIXME");
    expect(todos[1].keyword).toBe("HACK");
  });

  it("returns empty for files with no TODO comments", () => {
    const files: SourceFile[] = [
      { path: "src/c.ts", content: "const x = 1;\n" },
    ];
    expect(extractTodos(files)).toHaveLength(0);
  });

  it("reports correct 1-based line numbers", () => {
    const files: SourceFile[] = [
      { path: "src/d.ts", content: "import x from 'y';\n\n// TODO: third line\n" },
    ];
    const todos = extractTodos(files);
    expect(todos[0].line).toBe(3);
  });

  it("handles multiple files", () => {
    const files: SourceFile[] = [
      { path: "src/a.ts", content: "// TODO: a\n" },
      { path: "src/b.ts", content: "// TODO: b\n// TODO: c\n" },
    ];
    expect(extractTodos(files)).toHaveLength(3);
  });
});

// ── buildDepMaps ─────────────────────────────────────────────────────────────

describe("buildDepMaps", () => {
  it("builds reverse and forward maps for a simple chain", () => {
    const files: SourceFile[] = [
      { path: "lib/utils.ts", content: "" },
      { path: "lib/feature.ts", content: "import { x } from './utils';\n" },
      { path: "app/page.tsx", content: "import { y } from '../lib/feature';\n" },
    ];
    const { reverse, forward } = buildDepMaps(files);

    // feature.ts imports utils.ts → utils.ts reverse-dep = feature.ts
    expect(reverse.get("lib/utils.ts")?.has("lib/feature.ts")).toBe(true);
    // page.tsx imports feature.ts
    expect(reverse.get("lib/feature.ts")?.has("app/page.tsx")).toBe(true);
    // forward
    expect(forward.get("lib/feature.ts")?.has("lib/utils.ts")).toBe(true);
    expect(forward.get("app/page.tsx")?.has("lib/feature.ts")).toBe(true);
  });

  it("ignores external package imports", () => {
    const files: SourceFile[] = [
      { path: "src/a.ts", content: "import React from 'react';\n" },
    ];
    const { reverse, forward } = buildDepMaps(files);
    expect(reverse.has("react")).toBe(false);
    expect(forward.get("src/a.ts")?.size).toBe(0);
  });
});

// ── countTransitiveDependents / Dependencies ──────────────────────────────────

describe("countTransitiveDependents", () => {
  it("counts files that transitively depend on a file", () => {
    const files: SourceFile[] = [
      { path: "lib/utils.ts", content: "" },
      { path: "lib/feature.ts", content: "import './utils';\n" },
      { path: "app/page.tsx", content: "import '../lib/feature';\n" },
    ];
    const { reverse } = buildDepMaps(files);
    expect(countTransitiveDependents("lib/utils.ts", reverse)).toBe(2);
    expect(countTransitiveDependents("lib/feature.ts", reverse)).toBe(1);
    expect(countTransitiveDependents("app/page.tsx", reverse)).toBe(0);
  });
});

describe("countTransitiveDependencies", () => {
  it("counts files that a file transitively imports", () => {
    const files: SourceFile[] = [
      { path: "lib/utils.ts", content: "" },
      { path: "lib/feature.ts", content: "import './utils';\n" },
      { path: "app/page.tsx", content: "import '../lib/feature';\n" },
    ];
    const { forward } = buildDepMaps(files);
    expect(countTransitiveDependencies("app/page.tsx", forward)).toBe(2);
    expect(countTransitiveDependencies("lib/feature.ts", forward)).toBe(1);
    expect(countTransitiveDependencies("lib/utils.ts", forward)).toBe(0);
  });
});

// ── Risk classification (via runBlastRadius) ──────────────────────────────────

describe("runBlastRadius — risk classification", () => {
  it("classifies a widely-imported file as risky (8+ dependents)", () => {
    const importers: SourceFile[] = Array.from({ length: 9 }, (_, i) => ({
      path: `src/importer${i}.ts`,
      content: "import './utils';\n",
    }));
    const files: SourceFile[] = [
      { path: "src/utils.ts", content: "// TODO: refactor this\n" },
      ...importers,
    ];
    const tasks = runBlastRadius(files, []);
    const utilsTask = tasks.find((t) => t.file === "src/utils.ts");
    expect(utilsTask).toBeDefined();
    expect(utilsTask!.risk).toBe("risky");
  });

  it("classifies a file with 0 dependents as safe", () => {
    const files: SourceFile[] = [
      { path: "src/isolated.ts", content: "// TODO: improve\n" },
    ];
    const tasks = runBlastRadius(files, []);
    expect(tasks[0].risk).toBe("safe");
  });

  it("classifies a file with 3–7 dependents as moderate", () => {
    const importers: SourceFile[] = Array.from({ length: 4 }, (_, i) => ({
      path: `src/importer${i}.ts`,
      content: "import './mid';\n",
    }));
    const files: SourceFile[] = [
      { path: "src/mid.ts", content: "// TODO: clean up\n" },
      ...importers,
    ];
    const tasks = runBlastRadius(files, []);
    const midTask = tasks.find((t) => t.file === "src/mid.ts");
    expect(midTask!.risk).toBe("moderate");
  });
});

// ── Sorting: safe < moderate < risky < unknown ────────────────────────────────

describe("runBlastRadius — sorting", () => {
  it("returns tasks sorted safe → moderate → risky → unknown", () => {
    const files: SourceFile[] = [];
    const issues: GhIssue[] = [
      { number: 1, title: "Update `eslint` dependency", labels: [] },
      { number: 2, title: "zzz totally vague unknown filing here", labels: [] },
    ];
    const tasks = runBlastRadius(files, issues);
    const riskOrder = ["safe", "moderate", "risky", "unknown"];
    for (let i = 0; i < tasks.length - 1; i++) {
      expect(riskOrder.indexOf(tasks[i].risk)).toBeLessThanOrEqual(
        riskOrder.indexOf(tasks[i + 1].risk)
      );
    }
  });
});

// ── Security label bump ───────────────────────────────────────────────────────

describe("runBlastRadius — security label bump", () => {
  it("bumps risk one level when issue has a security label", () => {
    const files: SourceFile[] = [
      { path: "src/auth.ts", content: "" },
    ];
    const issues: GhIssue[] = [
      { number: 42, title: "auth security vulnerability", labels: ["security"] },
    ];
    const tasks = runBlastRadius(files, issues);
    const authTask = tasks.find((t) => t.issueNumber === 42);
    expect(authTask).toBeDefined();
    // Bumped from safe (0 importers) → moderate
    expect(["moderate", "risky"]).toContain(authTask!.risk);
  });
});

// ── Dev-package issues always safe ───────────────────────────────────────────

describe("runBlastRadius — dev-dependency rule", () => {
  it("marks vitest dependency issues as safe", () => {
    const files: SourceFile[] = [];
    const issues: GhIssue[] = [
      { number: 1, title: "Update `vitest` to latest", labels: ["dependencies"] },
    ];
    const tasks = runBlastRadius(files, issues);
    expect(tasks[0].risk).toBe("safe");
  });

  it("marks eslint dependency issues as safe", () => {
    const files: SourceFile[] = [];
    const issues: GhIssue[] = [
      { number: 2, title: "Bump `eslint` from 8 to 9", labels: ["dependencies"] },
    ];
    const tasks = runBlastRadius(files, issues);
    expect(tasks[0].risk).toBe("safe");
  });
});
