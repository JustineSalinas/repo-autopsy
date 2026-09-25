import { describe, it, expect } from "vitest";
import { computeTrustScore } from "../trustScore";
import type { DriftFinding, StarterTask } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function finding(severity: DriftFinding["severity"]): DriftFinding {
  return { type: "unused_env_var", description: "x", severity };
}

function task(risk: StarterTask["risk"]): StarterTask {
  return {
    id: `t:${risk}`,
    source: "todo",
    title: "test task",
    file: "src/foo.ts",
    line: 1,
    dependents: 0,
    risk,
    reason: "test",
  };
}

// ── Perfect repo ─────────────────────────────────────────────────────────────

describe("computeTrustScore — perfect repo", () => {
  it("returns 100 with no findings and 2 safe tasks", () => {
    const result = computeTrustScore([], [task("safe"), task("safe")]);
    expect(result.score).toBe(100);
    expect(result.band).toBe("Ready");
    // The breakdown values are negative penalties; 0 penalty produces -0 in JS
    expect(Math.abs(result.breakdown.drift)).toBe(0);
    expect(Math.abs(result.breakdown.starterTasks)).toBe(0);
    expect(Math.abs(result.breakdown.riskLoad)).toBe(0);
    expect(result.topIssues).toHaveLength(0);
  });
});

// ── Drift bucket ─────────────────────────────────────────────────────────────

describe("computeTrustScore — drift bucket", () => {
  it("deducts 12 per high finding", () => {
    const result = computeTrustScore([finding("high"), finding("high")], [task("safe"), task("safe")]);
    expect(result.breakdown.drift).toBe(-24);
    expect(result.score).toBe(76);
    expect(result.band).toBe("Needs care");
  });

  it("deducts 6 per medium finding", () => {
    const result = computeTrustScore([finding("medium")], [task("safe"), task("safe")]);
    expect(result.breakdown.drift).toBe(-6);
    expect(result.score).toBe(94);
    expect(result.band).toBe("Ready");
  });

  it("deducts 2 per low finding", () => {
    const result = computeTrustScore([finding("low")], [task("safe"), task("safe")]);
    expect(result.breakdown.drift).toBe(-2);
    expect(result.score).toBe(98);
  });

  it("caps drift penalty at 40", () => {
    const many = Array.from({ length: 10 }, () => finding("high")); // 10 × 12 = 120
    const result = computeTrustScore(many, [task("safe"), task("safe")]);
    expect(result.breakdown.drift).toBe(-40);
    expect(result.score).toBe(60);
  });
});

// ── Starter-task bucket ──────────────────────────────────────────────────────

describe("computeTrustScore — starter-task bucket", () => {
  it("deducts 10 when there are no tasks at all", () => {
    const result = computeTrustScore([], []);
    expect(result.breakdown.starterTasks).toBe(-10);
    expect(result.score).toBe(90);
  });

  it("deducts 30 when tasks exist but none are safe", () => {
    // 2 risky tasks: starterPenalty=30, riskLoad=10 → score=60
    const result = computeTrustScore([], [task("risky"), task("risky")]);
    expect(result.breakdown.starterTasks).toBe(-30);
    expect(result.score).toBe(60);
  });

  it("deducts 15 when exactly 1 safe task exists", () => {
    // 1 safe + 1 risky: starterPenalty=15, riskLoad=5 → score=80
    const result = computeTrustScore([], [task("safe"), task("risky")]);
    expect(result.breakdown.starterTasks).toBe(-15);
    expect(result.score).toBe(80);
  });

  it("deducts 0 when 2+ safe tasks exist", () => {
    const result = computeTrustScore([], [task("safe"), task("safe"), task("risky")]);
    expect(Math.abs(result.breakdown.starterTasks)).toBe(0);
  });
});

// ── Risk-load bucket ─────────────────────────────────────────────────────────

describe("computeTrustScore — risk-load bucket", () => {
  it("deducts 5 per risky task", () => {
    const result = computeTrustScore([], [task("safe"), task("safe"), task("risky")]);
    expect(result.breakdown.riskLoad).toBe(-5);
    expect(result.score).toBe(95);
  });

  it("deducts 2 per unknown-risk task", () => {
    const result = computeTrustScore([], [task("safe"), task("safe"), task("unknown")]);
    expect(result.breakdown.riskLoad).toBe(-2);
    expect(result.score).toBe(98);
  });

  it("caps risk-load penalty at 30", () => {
    const manyRisky = Array.from({ length: 10 }, () => task("risky")); // 10 × 5 = 50
    const result = computeTrustScore([], [task("safe"), task("safe"), ...manyRisky]);
    expect(result.breakdown.riskLoad).toBe(-30);
  });
});

// ── Band assignment ──────────────────────────────────────────────────────────

describe("computeTrustScore — band assignment", () => {
  it("assigns 'Ready' at score >= 80", () => {
    expect(computeTrustScore([], [task("safe"), task("safe")]).band).toBe("Ready");
  });

  it("assigns 'Needs care' at score 50–79", () => {
    // 2 risky tasks: starterPenalty=30, riskLoad=10 → score=60
    const result = computeTrustScore([], [task("risky"), task("risky")]);
    expect(result.score).toBe(60);
    expect(result.band).toBe("Needs care");
  });

  it("assigns 'Risky onboarding' at score < 50", () => {
    // 40 drift (4×high) + 10 no-tasks = 50 deducted → score 50 → "Needs care"
    const manyHighFindings = Array.from({ length: 4 }, () => finding("high")); // capped 40
    const result = computeTrustScore(manyHighFindings, []);
    expect(result.score).toBe(50);
    expect(result.band).toBe("Needs care");

    // 4 high findings (capped 40) + 2 risky tasks (starterPenalty=30, riskLoad=10) → total 80 → score 20
    const twoRisky = [task("risky"), task("risky")];
    const result2 = computeTrustScore(manyHighFindings, twoRisky);
    expect(result2.score).toBe(20);
    expect(result2.band).toBe("Risky onboarding");
  });

  it("clamps score to 0", () => {
    const manyHigh = Array.from({ length: 10 }, () => finding("high"));
    const manyRisky = Array.from({ length: 20 }, () => task("risky"));
    const result = computeTrustScore(manyHigh, manyRisky);
    expect(result.score).toBe(0);
  });
});

// ── Top issues ───────────────────────────────────────────────────────────────

describe("computeTrustScore — topIssues", () => {
  it("returns at most 3 issues", () => {
    const manyHigh = Array.from({ length: 5 }, () => finding("high"));
    const manyRisky = Array.from({ length: 5 }, () => task("risky"));
    const result = computeTrustScore(manyHigh, manyRisky);
    expect(result.topIssues.length).toBeLessThanOrEqual(3);
  });

  it("includes drift message when drift penalty > 0", () => {
    const result = computeTrustScore([finding("high")], [task("safe"), task("safe")]);
    expect(result.topIssues.some((i) => i.includes("drift") || i.includes("Drift"))).toBe(true);
  });

  it("includes starter-task message when starter penalty > 0", () => {
    const result = computeTrustScore([], []);
    expect(result.topIssues.some((i) => i.includes("starter") || i.includes("task"))).toBe(true);
  });
});
