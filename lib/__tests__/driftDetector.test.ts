import { describe, it, expect } from "vitest";
import { runDriftDetection } from "../driftDetector";
import type { RepoContext } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<RepoContext> = {}): RepoContext {
  return {
    owner: "acme",
    repo: "myapp",
    readmeContent: null,
    fileTree: [],
    manifestContent: null,
    manifestFile: null,
    envExampleContent: null,
    gitignoreContent: null,
    ...overrides,
  };
}

// ── runDriftDetection — basic ─────────────────────────────────────────────────

describe("runDriftDetection — no content", () => {
  it("returns zero findings when there is no README and no env example", () => {
    const result = runDriftDetection(makeCtx(), []);
    expect(result.driftFindings).toHaveLength(0);
    expect(result.meta.readmeFound).toBe(false);
  });
});

// ── Unused env-var detection ──────────────────────────────────────────────────

describe("runDriftDetection — unused env vars", () => {
  it("flags an env var mentioned in README but absent from code", () => {
    const ctx = makeCtx({
      readmeContent: "Set $STRIPE_SECRET_KEY before running.",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    const f = result.driftFindings.find((f) =>
      f.description.includes("STRIPE_SECRET_KEY")
    );
    expect(f).toBeDefined();
    expect(f!.type).toBe("unused_env_var");
    expect(f!.severity).toBe("medium");
  });

  it("does not flag an env var that appears in code", () => {
    const ctx = makeCtx({
      readmeContent: "Set $STRIPE_SECRET_KEY before running.",
      fileTree: [],
    });
    const codeContents = [`const key = process.env.STRIPE_SECRET_KEY;`];
    const result = runDriftDetection(ctx, codeContents);
    const f = result.driftFindings.find((f) =>
      f.description.includes("STRIPE_SECRET_KEY")
    );
    expect(f).toBeUndefined();
  });

  it("skips generic env vars (NODE_ENV, PATH, etc.)", () => {
    const ctx = makeCtx({
      readmeContent: "Uses $NODE_ENV, $PATH, $HOME",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    expect(
      result.driftFindings.filter((f) => f.type === "unused_env_var")
    ).toHaveLength(0);
  });
});

// ── .gitignore exclusion ─────────────────────────────────────────────────────

describe("runDriftDetection — gitignore/ALWAYS_LOCAL exclusion", () => {
  it("does not flag .env.local as missing even if README mentions it", () => {
    const ctx = makeCtx({
      readmeContent: "Copy .env.local from a teammate.",
      fileTree: [],
      gitignoreContent: "",
    });
    const result = runDriftDetection(ctx, []);
    // .env.local is in ALWAYS_LOCAL_FILES — must never be flagged
    expect(
      result.driftFindings.some((f) => f.description.includes(".env.local"))
    ).toBe(false);
  });

  it("does not flag a file that is gitignored", () => {
    const ctx = makeCtx({
      readmeContent: "Run npm start after building dist/",
      fileTree: [],
      gitignoreContent: "dist/\n",
    });
    const result = runDriftDetection(ctx, []);
    expect(
      result.driftFindings.some((f) => f.description.includes("dist"))
    ).toBe(false);
  });

  it("does not flag node_modules as missing", () => {
    const ctx = makeCtx({
      readmeContent: "Install node_modules with npm install.",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    expect(
      result.driftFindings.some((f) => f.description.includes("node_modules"))
    ).toBe(false);
  });
});

// ── URL-not-route guard ───────────────────────────────────────────────────────

describe("runDriftDetection — URL-not-route guard", () => {
  it("does not flag localhost URLs as missing routes", () => {
    const ctx = makeCtx({
      readmeContent:
        "Open http://localhost:3000/dashboard/settings in your browser.",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    const stale = result.driftFindings.filter(
      (f) => f.type === "stale_description"
    );
    expect(stale).toHaveLength(0);
  });

  it("does not flag github.com URLs as missing routes", () => {
    const ctx = makeCtx({
      readmeContent:
        "See github.com/owner/repo/tree/main/app/api/analyze for the source.",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    const stale = result.driftFindings.filter(
      (f) => f.type === "stale_description"
    );
    expect(stale).toHaveLength(0);
  });

  it("flags a multi-segment API route not found in code", () => {
    const ctx = makeCtx({
      readmeContent: "POST /api/widgets/create to add a widget.",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    const stale = result.driftFindings.filter(
      (f) => f.type === "stale_description"
    );
    // The route /api/widgets/create mentions 'widgets' and 'create';
    // if neither keyword is in codeContents the finding must be present
    expect(stale.length).toBeGreaterThan(0);
  });

  it("skips single-segment paths that are not API-shaped", () => {
    const ctx = makeCtx({
      readmeContent: "Visit /home to get started.",
      fileTree: [],
    });
    const result = runDriftDetection(ctx, []);
    const stale = result.driftFindings.filter(
      (f) => f.type === "stale_description"
    );
    expect(stale).toHaveLength(0);
  });
});

// ── Missing setup files ───────────────────────────────────────────────────────

describe("runDriftDetection — missing setup files", () => {
  it("flags a README-mentioned npm script that is absent from package.json", () => {
    const ctx = makeCtx({
      readmeContent: "Run npm run setup to bootstrap.",
      fileTree: [],
      manifestContent: JSON.stringify({ scripts: { dev: "next dev" } }),
      manifestFile: "package.json",
    });
    const result = runDriftDetection(ctx, []);
    const f = result.driftFindings.find(
      (f) => f.description.includes("setup") && f.type === "missing_setup_file"
    );
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
  });

  it("does not flag an npm script that is present in package.json", () => {
    const ctx = makeCtx({
      readmeContent: "Run npm run dev to start the server.",
      fileTree: [],
      manifestContent: JSON.stringify({ scripts: { dev: "next dev" } }),
      manifestFile: "package.json",
    });
    const result = runDriftDetection(ctx, []);
    const f = result.driftFindings.find(
      (f) => f.description.includes("dev") && f.type === "missing_setup_file"
    );
    expect(f).toBeUndefined();
  });
});
