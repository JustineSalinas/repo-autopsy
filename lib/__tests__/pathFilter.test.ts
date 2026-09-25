import { describe, it, expect } from "vitest";
import { isIgnoredPath, parseGitignorePatterns } from "../pathFilter";

describe("isIgnoredPath", () => {
  it("ignores files inside node_modules/", () => {
    expect(isIgnoredPath("node_modules/lodash/index.js")).toBe(true);
    expect(isIgnoredPath("packages/foo/node_modules/bar/index.ts")).toBe(true);
  });

  it("ignores generated file suffixes (.min.js, .d.ts, .map, .min.css)", () => {
    expect(isIgnoredPath("dist/bundle.min.js")).toBe(true);
    expect(isIgnoredPath("types/index.d.ts")).toBe(true);
    expect(isIgnoredPath("public/app.js.map")).toBe(true);
    expect(isIgnoredPath("styles/main.min.css")).toBe(true);
  });

  it("ignores lockfiles and honours .gitignore patterns", () => {
    // Lockfiles
    expect(isIgnoredPath("package-lock.json")).toBe(true);
    expect(isIgnoredPath("yarn.lock")).toBe(true);
    expect(isIgnoredPath("pnpm-lock.yaml")).toBe(true);

    // .gitignore patterns
    const patterns = parseGitignorePatterns("secrets/\n*.local\n");
    expect(isIgnoredPath("secrets/api_key.txt", patterns)).toBe(true);
    expect(isIgnoredPath(".env.local", patterns)).toBe(true);
  });

  it("does NOT ignore ordinary first-party source files", () => {
    expect(isIgnoredPath("lib/utils.ts")).toBe(false);
    expect(isIgnoredPath("app/page.tsx")).toBe(false);
    expect(isIgnoredPath("src/index.js")).toBe(false);
    expect(isIgnoredPath("components/Button.tsx")).toBe(false);
  });
});
