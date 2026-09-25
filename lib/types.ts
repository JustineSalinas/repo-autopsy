// ---------------------------------------------------------------------------
// Repo Autopsy — shared TypeScript types
// ---------------------------------------------------------------------------

export type DriftType =
  | "unused_env_var"
  | "missing_setup_file"
  | "stale_description";

export type Severity = "low" | "medium" | "high";

export interface DriftFinding {
  type: DriftType;
  description: string;
  severity: Severity;
}

export interface DriftMeta {
  readmeFound: boolean;
  filesScanned: number;
}

// ---------------------------------------------------------------------------
// Stage 2: Blast-radius starter tasks
// ---------------------------------------------------------------------------

export type TaskSource = "todo" | "issue";
export type RiskLevel = "safe" | "moderate" | "risky" | "unknown";

export interface StarterTask {
  /** Unique stable identifier: "todo:<path>:<line>" or "issue:<number>" */
  id: string;
  source: TaskSource;
  title: string;
  /** Repo-relative path of the file containing the TODO (undefined for issues) */
  file?: string;
  /** 1-based line number of the TODO comment (undefined for issues) */
  line?: number;
  /** GitHub issue number (undefined for TODOs) */
  issueNumber?: number;
  /** Labels on the GitHub issue (empty for TODOs) */
  labels?: string[];
  /** Number of files that transitively depend on this task's file/package.
   *  null means the relationship could not be estimated. */
  dependents: number | null;
  risk: RiskLevel;
  /** One plain-English sentence explaining the risk classification */
  reason: string;
}

// ---------------------------------------------------------------------------
// Stage 3: Onboarding Trust Score
// ---------------------------------------------------------------------------

export type TrustBand = "Ready" | "Needs care" | "Risky onboarding";

export interface TrustScoreBreakdown {
  /** Negative value: points deducted for drift findings (capped at −40) */
  drift: number;
  /** Negative value: points deducted for lack of safe starter tasks (capped at −30) */
  starterTasks: number;
  /** Negative value: points deducted for risky/unknown tasks (capped at −30) */
  riskLoad: number;
}

export interface TrustScoreResult {
  /** Final clamped score 0–100 */
  score: number;
  band: TrustBand;
  breakdown: TrustScoreBreakdown;
  /** 1–3 plain-English descriptions of the biggest point losses */
  topIssues: string[];
}

export interface DriftReport {
  repo: string;            // "owner/repo"
  driftFindings: DriftFinding[];
  starterTasks: StarterTask[];
  trustScore: TrustScoreResult;
  meta: DriftMeta;
}

// ---------------------------------------------------------------------------
// Internal helper shapes (not returned to the client)
// ---------------------------------------------------------------------------

export interface RepoFile {
  path: string;
  type: "blob" | "tree";
}

export interface RepoContext {
  owner: string;
  repo: string;
  readmeContent: string | null;
  fileTree: RepoFile[];
  /** Raw content of package.json / requirements.txt / go.mod, keyed by filename */
  manifestContent: string | null;
  manifestFile: string | null;
  envExampleContent: string | null;
  /** Raw content of .gitignore if present, used to filter false-positive missing-file findings */
  gitignoreContent: string | null;
}

export interface AnalyzeRequest {
  repoUrl: string;
}
