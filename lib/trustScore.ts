// ---------------------------------------------------------------------------
// Repo Autopsy — Stage 3: Onboarding Trust Score
// ---------------------------------------------------------------------------
// Starts at 100 and deducts points across three penalty buckets:
//   1. Drift penalty   (max −40)
//   2. Starter-task availability (max −30)
//   3. Risk load       (max −30)
// Result is clamped to 0–100 and labelled with a band.
// ---------------------------------------------------------------------------

import type { DriftFinding, StarterTask, TrustScoreResult } from "./types";

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function computeTrustScore(
  driftFindings: DriftFinding[],
  starterTasks: StarterTask[]
): TrustScoreResult {
  // ── Bucket 1: Drift penalty (max 40) ──────────────────────────────────────
  let driftPenalty = 0;
  for (const f of driftFindings) {
    if (f.severity === "high")   driftPenalty += 12;
    else if (f.severity === "medium") driftPenalty += 6;
    else if (f.severity === "low")    driftPenalty += 2;
  }
  driftPenalty = Math.min(driftPenalty, 40);

  // ── Bucket 2: Starter-task availability (max 30) ──────────────────────────
  let starterTasksPenalty = 0;
  const safeTasks = starterTasks.filter((t) => t.risk === "safe").length;

  if (starterTasks.length === 0) {
    // No tasks documented at all
    starterTasksPenalty = 10;
  } else if (safeTasks === 0) {
    // Tasks exist but none are safe
    starterTasksPenalty = 30;
  } else if (safeTasks === 1) {
    starterTasksPenalty = 15;
  }
  // 2+ safe tasks → 0 penalty

  // ── Bucket 3: Risk load (max 30) ──────────────────────────────────────────
  let riskLoadPenalty = 0;
  for (const t of starterTasks) {
    if (t.risk === "risky") riskLoadPenalty += 5;
    // "unknown" security tasks: treat issues labelled security or high-risk as unknown-security
    else if (t.risk === "unknown") riskLoadPenalty += 2;
  }
  riskLoadPenalty = Math.min(riskLoadPenalty, 30);

  // ── Final score ────────────────────────────────────────────────────────────
  const raw = 100 - driftPenalty - starterTasksPenalty - riskLoadPenalty;
  const score = Math.max(0, Math.min(100, raw));

  const band: TrustScoreResult["band"] =
    score >= 80 ? "Ready"
    : score >= 50 ? "Needs care"
    : "Risky onboarding";

  // ── Top issues (1–3 biggest losses, plain English) ────────────────────────
  const losses: Array<{ points: number; label: string }> = [];

  if (driftPenalty > 0) {
    const highCount   = driftFindings.filter((f) => f.severity === "high").length;
    const mediumCount = driftFindings.filter((f) => f.severity === "medium").length;
    const lowCount    = driftFindings.filter((f) => f.severity === "low").length;
    const parts: string[] = [];
    if (highCount)   parts.push(`${highCount} high`);
    if (mediumCount) parts.push(`${mediumCount} medium`);
    if (lowCount)    parts.push(`${lowCount} low`);
    losses.push({
      points: driftPenalty,
      label: `Documentation drift (${parts.join(", ")} finding${driftFindings.length !== 1 ? "s" : ""}) cost ${driftPenalty} points`,
    });
  }

  if (starterTasksPenalty > 0) {
    const msg =
      starterTasks.length === 0
        ? `No documented starter tasks cost ${starterTasksPenalty} points`
        : safeTasks === 0
        ? `No safe starter tasks (${starterTasks.length} total, none safe) cost ${starterTasksPenalty} points`
        : `Only ${safeTasks} safe starter task cost ${starterTasksPenalty} points`;
    losses.push({ points: starterTasksPenalty, label: msg });
  }

  if (riskLoadPenalty > 0) {
    const riskyCount   = starterTasks.filter((t) => t.risk === "risky").length;
    const unknownCount = starterTasks.filter((t) => t.risk === "unknown").length;
    const parts: string[] = [];
    if (riskyCount)   parts.push(`${riskyCount} risky task${riskyCount !== 1 ? "s" : ""}`);
    if (unknownCount) parts.push(`${unknownCount} unknown-risk task${unknownCount !== 1 ? "s" : ""}`);
    losses.push({
      points: riskLoadPenalty,
      label: `High risk load (${parts.join(", ")}) cost ${riskLoadPenalty} points`,
    });
  }

  // Sort by points descending, keep top 3
  losses.sort((a, b) => b.points - a.points);
  const topIssues = losses.slice(0, 3).map((l) => l.label);

  return {
    score,
    band,
    breakdown: {
      drift: -driftPenalty,
      starterTasks: -starterTasksPenalty,
      riskLoad: -riskLoadPenalty,
    },
    topIssues,
  };
}
