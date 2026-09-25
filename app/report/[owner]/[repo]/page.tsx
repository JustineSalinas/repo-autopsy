"use client";

import Link from "next/link";
import { useEffect, useState, useReducer } from "react";
import type { DriftReport, StarterTask, DriftFinding, RiskLevel, TrustBand } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "reading" | "tracing" | "scoring" | "done" | "error";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "reading", label: "Reading documentation" },
  { phase: "tracing", label: "Tracing dependencies" },
  { phase: "scoring", label: "Scoring" },
];

// ── Helpers ───────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  safe: "var(--risk-safe)",
  moderate: "var(--risk-moderate)",
  risky: "var(--risk-risky)",
  unknown: "var(--risk-unknown)",
};

const SEVERITY_COLOR: Record<string, string> = {
  high: "var(--risk-risky)",
  medium: "var(--risk-moderate)",
  low: "var(--risk-safe)",
};

const DRIFT_TYPE_LABEL: Record<string, string> = {
  unused_env_var: "Unused env var",
  missing_setup_file: "Missing setup file",
  stale_description: "Stale description",
};

const BAND_COLOR: Record<TrustBand, string> = {
  Ready: "var(--risk-safe)",
  "Needs care": "var(--risk-moderate)",
  "Risky onboarding": "var(--risk-risky)",
};

function riskOrder(r: RiskLevel): number {
  return { safe: 0, moderate: 1, risky: 2, unknown: 3 }[r] ?? 4;
}

function RiskPill({ risk }: { risk: RiskLevel }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-plex-mono), monospace",
        fontVariantNumeric: "tabular-nums",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: RISK_COLORS[risk],
        border: `1px solid ${RISK_COLORS[risk]}`,
        borderRadius: 3,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {risk}
    </span>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-plex-mono), monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: SEVERITY_COLOR[severity] ?? "var(--muted)",
        border: `1px solid ${SEVERITY_COLOR[severity] ?? "var(--hairline)"}`,
        borderRadius: 3,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {severity}
    </span>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 48 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          borderBottom: "1px solid var(--hairline)",
          paddingBottom: 8,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-plex-mono), monospace",
            fontSize: 11,
            color: "var(--muted)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.06em",
          }}
        >
          {number}
        </span>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ── Skeleton Layout ──────────────────────────────────────────────────────

function SkeletonLayout({ phase }: { phase: Phase }) {
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <div>
      {/* Step indicator */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 40,
          border: "1px solid var(--hairline)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {STEPS.map((step, i) => {
          const isActive = i === stepIndex;
          const isDone = stepIndex > i;
          return (
            <div
              key={step.phase}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRight: i < STEPS.length - 1 ? "1px solid var(--hairline)" : undefined,
                background: isActive
                  ? "var(--surface)"
                  : isDone
                  ? "transparent"
                  : "transparent",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: isActive
                    ? "var(--accent)"
                    : isDone
                    ? "var(--risk-safe)"
                    : "var(--muted)",
                  marginBottom: 4,
                }}
              >
                {isDone ? "Done" : isActive ? "Running" : "Pending"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--ink)" : "var(--muted)",
                }}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skeleton blocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── Trust Score Section ───────────────────────────────────────────────────

function TrustScoreSection({ report }: { report: DriftReport }) {
  const { trustScore } = report;
  const gaugeWidth = Math.max(0, Math.min(100, trustScore.score));
  const gaugeColor = BAND_COLOR[trustScore.band];

  return (
    <Section number="01" title="Onboarding trust score">
      {/* Score + band */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
        <span
          style={{
            fontFamily: "var(--font-plex-mono), monospace",
            fontVariantNumeric: "tabular-nums",
            fontSize: 64,
            lineHeight: 1,
            fontWeight: 600,
            color: gaugeColor,
          }}
        >
          {trustScore.score}
        </span>
        <div style={{ paddingBottom: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: gaugeColor,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {trustScore.band}
          </span>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>out of 100</div>
        </div>
      </div>

      {/* Gauge */}
      <div className="gauge-track" style={{ marginBottom: 24, maxWidth: 480 }}>
        <div
          className="gauge-fill"
          style={{ width: `${gaugeWidth}%`, background: gaugeColor }}
        />
      </div>

      {/* Breakdown table */}
      <div style={{ marginBottom: 24 }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 13,
            width: "100%",
            maxWidth: 480,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  padding: "0 0 8px 0",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                Bucket
              </th>
              <th
                style={{
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  padding: "0 0 8px 16px",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                Deduction
              </th>
              <th
                style={{
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  padding: "0 0 8px 16px",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                Cap
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Documentation drift", trustScore.breakdown.drift, -40],
                ["Starter task availability", trustScore.breakdown.starterTasks, -30],
                ["Risk load", trustScore.breakdown.riskLoad, -30],
              ] as [string, number, number][]
            ).map(([bucket, deduction, cap]) => (
              <tr key={bucket} style={{ borderBottom: "1px solid var(--hairline)" }}>
                <td style={{ padding: "8px 0", color: "var(--ink)" }}>{bucket}</td>
                <td
                  style={{
                    padding: "8px 0 8px 16px",
                    textAlign: "right",
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontVariantNumeric: "tabular-nums",
                    color: deduction < 0 ? "var(--risk-risky)" : "var(--muted)",
                  }}
                >
                  {deduction < 0 ? deduction : "0"}
                </td>
                <td
                  style={{
                    padding: "8px 0 8px 16px",
                    textAlign: "right",
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--muted)",
                  }}
                >
                  {cap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top issues */}
      {trustScore.topIssues.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {trustScore.topIssues.map((issue, i) => (
            <li
              key={i}
              style={{
                fontSize: 13,
                color: "var(--muted)",
                paddingLeft: 16,
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  fontFamily: "var(--font-plex-mono), monospace",
                  color: "var(--risk-risky)",
                }}
              >
                &mdash;
              </span>
              {issue}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Starter Tasks Section ─────────────────────────────────────────────────

const RISK_ORDER: RiskLevel[] = ["safe", "moderate", "risky", "unknown"];

function StarterTasksSection({ tasks, owner, repo }: { tasks: StarterTask[]; owner: string; repo: string }) {
  const grouped = RISK_ORDER.reduce((acc, risk) => {
    acc[risk] = tasks.filter((t) => t.risk === risk);
    return acc;
  }, {} as Record<RiskLevel, StarterTask[]>);

  const [collapsed, setCollapsed] = useState<Record<RiskLevel, boolean>>({
    safe: false,
    moderate: true,
    risky: true,
    unknown: true,
  });

  function toggle(risk: RiskLevel) {
    setCollapsed((prev) => ({ ...prev, [risk]: !prev[risk] }));
  }

  if (tasks.length === 0) {
    return (
      <Section number="02" title="Where to start">
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No starter tasks found. Add TODO/FIXME comments or open GitHub issues to guide new contributors.
        </p>
      </Section>
    );
  }

  return (
    <Section number="02" title="Where a new contributor should start">
      <div className="stack-table" style={{ overflowX: "auto" }}>
        {RISK_ORDER.map((risk) => {
          const group = grouped[risk];
          if (group.length === 0) return null;
          const isCollapsed = collapsed[risk];

          return (
            <div
              key={risk}
              style={{
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                marginBottom: 8,
                overflow: "hidden",
              }}
            >
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggle(risk)}
                aria-expanded={!isCollapsed}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  background: "var(--surface)",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <RiskPill risk={risk} />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {group.length} task{group.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace",
                    fontSize: 12,
                    color: "var(--muted)",
                    transform: isCollapsed ? "none" : "rotate(90deg)",
                    display: "inline-block",
                    transition: "transform 0.15s ease",
                  }}
                >
                  ›
                </span>
              </button>

              {/* Table */}
              {!isCollapsed && (
                <div className="stack-table" style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      fontSize: 13,
                      width: "100%",
                      minWidth: 560,
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
                        {["Risk", "Task", "Source", "Dependents", "Reason"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: 11,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--muted)",
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((task) => (
                        <tr
                          key={task.id}
                          style={{ borderBottom: "1px solid var(--hairline)" }}
                        >
                          <td data-label="Risk" style={{ padding: "10px 12px", verticalAlign: "top" }}>
                            <RiskPill risk={task.risk} />
                          </td>
                          <td
                            data-label="Task"
                            style={{
                              padding: "10px 12px",
                              verticalAlign: "top",
                              maxWidth: 260,
                            }}
                          >
                            {task.issueNumber ? (
                              <a
                                href={`https://github.com/${owner}/${repo}/issues/${task.issueNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "var(--accent)", textDecoration: "none" }}
                              >
                                {task.title}
                              </a>
                            ) : (
                              <span style={{ color: "var(--ink)" }}>{task.title}</span>
                            )}
                            {task.file && (
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  marginTop: 2,
                                }}
                              >
                                {task.file}
                                {task.line ? `:${task.line}` : ""}
                              </div>
                            )}
                          </td>
                          <td
                            data-label="Source"
                            style={{
                              padding: "10px 12px",
                              verticalAlign: "top",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-plex-mono), monospace",
                                fontSize: 11,
                                background: "var(--surface)",
                                border: "1px solid var(--hairline)",
                                borderRadius: 3,
                                padding: "2px 6px",
                                color: "var(--muted)",
                              }}
                            >
                              {task.source}
                            </span>
                            {task.labels && task.labels.length > 0 && (
                              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {task.labels.map((l) => (
                                  <span
                                    key={l}
                                    style={{
                                      fontSize: 10,
                                      border: "1px solid var(--hairline)",
                                      borderRadius: 3,
                                      padding: "1px 5px",
                                      color: "var(--muted)",
                                    }}
                                  >
                                    {l}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td
                            data-label="Dependents"
                            style={{
                              padding: "10px 12px",
                              verticalAlign: "top",
                              textAlign: "center",
                              fontFamily: "var(--font-plex-mono), monospace",
                              fontVariantNumeric: "tabular-nums",
                              fontSize: 13,
                              color: task.dependents === null ? "var(--muted)" : "var(--ink)",
                            }}
                          >
                            {task.dependents === null ? "—" : task.dependents}
                          </td>
                          <td
                            data-label="Reason"
                            style={{
                              padding: "10px 12px",
                              verticalAlign: "top",
                              color: "var(--muted)",
                              maxWidth: 300,
                            }}
                          >
                            {task.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Drift Section ─────────────────────────────────────────────────────────

function DriftSection({ findings }: { findings: DriftFinding[] }) {
  if (findings.length === 0) {
    return (
      <Section number="03" title="Documentation drift">
        <p style={{ fontSize: 13, color: "var(--risk-safe)" }}>
          No documentation drift detected.
        </p>
      </Section>
    );
  }

  return (
    <Section number="03" title="Documentation drift">
      <div className="stack-table" style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 13,
            width: "100%",
            minWidth: 460,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
              {["Severity", "Type", "Detail"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    padding: "8px 12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...findings]
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
              })
              .map((f, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <td data-label="Severity" style={{ padding: "10px 12px", verticalAlign: "top" }}>
                    <SeverityPill severity={f.severity} />
                  </td>
                  <td data-label="Type" style={{ padding: "10px 12px", verticalAlign: "top", whiteSpace: "nowrap", color: "var(--muted)" }}>
                    {DRIFT_TYPE_LABEL[f.type] ?? f.type}
                  </td>
                  <td data-label="Detail" style={{ padding: "10px 12px", verticalAlign: "top", color: "var(--ink)" }}>
                    {f.description}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── Export Markdown ───────────────────────────────────────────────────────

function buildMarkdown(owner: string, repo: string, report: DriftReport): string {
  const { trustScore, driftFindings, starterTasks, meta } = report;
  const scanDate = new Date().toUTCString();
  const lines: string[] = [];

  lines.push(`# Autopsy Report — ${owner}/${repo}`);
  lines.push(`\n> Scanned ${scanDate} · ${meta.filesScanned} files · Partial scan`);
  lines.push(`\n---\n`);

  // Trust score
  lines.push(`## 01 Onboarding Trust Score\n`);
  lines.push(`**Score:** \`${trustScore.score}/100\` — **${trustScore.band}**\n`);
  lines.push(`| Bucket | Deduction | Cap |`);
  lines.push(`|--------|----------:|----:|`);
  lines.push(`| Documentation drift | ${trustScore.breakdown.drift} | −40 |`);
  lines.push(`| Starter task availability | ${trustScore.breakdown.starterTasks} | −30 |`);
  lines.push(`| Risk load | ${trustScore.breakdown.riskLoad} | −30 |`);
  if (trustScore.topIssues.length > 0) {
    lines.push(`\n**Top issues:**\n`);
    trustScore.topIssues.forEach((issue) => lines.push(`- ${issue}`));
  }

  // Starter tasks
  lines.push(`\n---\n\n## 02 Where a New Contributor Should Start\n`);
  if (starterTasks.length === 0) {
    lines.push("_No starter tasks found._");
  } else {
    lines.push(`| Risk | Task | Source | Dependents | Reason |`);
    lines.push(`|------|------|--------|:----------:|--------|`);
    const sorted = [...starterTasks].sort((a, b) => riskOrder(a.risk) - riskOrder(b.risk));
    sorted.forEach((t) => {
      const taskCell = t.file ? `${t.title} \`${t.file}${t.line ? `:${t.line}` : ""}\`` : t.title;
      lines.push(`| ${t.risk} | ${taskCell} | ${t.source} | ${t.dependents ?? "—"} | ${t.reason} |`);
    });
  }

  // Drift
  lines.push(`\n---\n\n## 03 Documentation Drift\n`);
  if (driftFindings.length === 0) {
    lines.push("_No documentation drift detected._");
  } else {
    lines.push(`| Severity | Type | Detail |`);
    lines.push(`|----------|------|--------|`);
    driftFindings.forEach((f) => {
      lines.push(`| ${f.severity} | ${DRIFT_TYPE_LABEL[f.type] ?? f.type} | ${f.description} |`);
    });
  }

  lines.push(`\n---\n\n_Generated by Repo Autopsy_`);
  return lines.join("\n");
}

// ── Reducer for analysis state ────────────────────────────────────────────

type AnalysisState = {
  phase: Phase;
  report: DriftReport | null;
  errorMsg: string | null;
  scanTime: Date | null;
};

type AnalysisAction =
  | { type: "START" }
  | { type: "STEP"; phase: Phase }
  | { type: "SUCCESS"; report: DriftReport; scanTime: Date }
  | { type: "ERROR"; msg: string };

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case "START":
      return { phase: "reading", report: null, errorMsg: null, scanTime: null };
    case "STEP":
      return { ...state, phase: action.phase };
    case "SUCCESS":
      return { phase: "done", report: action.report, errorMsg: null, scanTime: action.scanTime };
    case "ERROR":
      return { ...state, phase: "error", errorMsg: action.msg };
    default:
      return state;
  }
}

// ── Main Report Page ──────────────────────────────────────────────────────

export default function ReportPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const [owner, setOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [analysisState, dispatch] = useReducer(analysisReducer, {
    phase: "idle",
    report: null,
    errorMsg: null,
    scanTime: null,
  });
  const { phase, report, errorMsg, scanTime } = analysisState;
  const [copied, setCopied] = useState(false);

  // retryKey increments to re-trigger the analysis effect
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    params.then(({ owner: o, repo: r }) => {
      setOwner(o);
      setRepoName(r);
    });
  }, [params]);

  function runAnalysis() {
    setRetryKey((k) => k + 1);
  }

  useEffect(() => {
    if (!owner || !repoName) return;

    let cancelled = false;

    dispatch({ type: "START" });

    const t1 = setTimeout(() => { if (!cancelled) dispatch({ type: "STEP", phase: "tracing" }); }, 800);
    const t2 = setTimeout(() => { if (!cancelled) dispatch({ type: "STEP", phase: "scoring" }); }, 2000);

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repoName}` }),
    })
      .then(async (res) => {
        clearTimeout(t1);
        clearTimeout(t2);
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          if (!cancelled) dispatch({ type: "ERROR", msg: data.error ?? `Analysis failed (HTTP ${res.status}).` });
          return;
        }
        const result = await res.json() as DriftReport;
        if (!cancelled) dispatch({ type: "SUCCESS", report: result, scanTime: new Date() });
      })
      .catch(() => {
        clearTimeout(t1);
        clearTimeout(t2);
        if (!cancelled) dispatch({ type: "ERROR", msg: "Network error — check your connection and retry." });
      });

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [owner, repoName, retryKey, dispatch]);

  async function handleExportMarkdown() {
    if (!report) return;
    const md = buildMarkdown(owner, repoName, report);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: open in new window
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      window.open(url);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      // brief feedback via button text handled inline
    } catch {
      /* ignore */
    }
  }

  const isLoading = phase === "reading" || phase === "tracing" || phase === "scoring";

  return (
    <div
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top nav */}
      <nav
        style={{
          borderBottom: "1px solid var(--hairline)",
          padding: "0 24px",
          position: "sticky",
          top: 0,
          background: "var(--paper)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            className="font-mono"
            style={{
              fontSize: 12,
              letterSpacing: "0.08em",
              color: "var(--muted)",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            Repo Autopsy
          </Link>

          {phase === "done" && report && (
            <div
              className="no-print"
              style={{ display: "flex", gap: 8 }}
            >
              <button
                type="button"
                onClick={handleCopyLink}
                style={ghostBtnStyle}
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={handleExportMarkdown}
                style={ghostBtnStyle}
              >
                {copied ? "Copied" : "Export Markdown"}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main */}
      <main
        style={{
          flex: 1,
          padding: "40px 24px 80px",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Report header */}
          <header style={{ marginBottom: 40 }}>
            <p
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 8,
              }}
            >
              Autopsy Report
            </p>
            <h1
              style={{
                fontSize: "clamp(22px, 4vw, 32px)",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                marginBottom: 12,
                lineHeight: 1.2,
              }}
            >
              {owner}/{repoName || "…"}
            </h1>

            {phase === "done" && report && scanTime && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                <span>
                  Scanned{" "}
                  <span className="font-mono">
                    {scanTime.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
                <span>
                  <span className="font-mono tabular-nums">{report.meta.filesScanned}</span> files scanned
                </span>
                <span style={{ color: "var(--risk-moderate)" }}>Partial scan</span>
              </div>
            )}
          </header>

          {/* Loading */}
          {isLoading && <SkeletonLayout phase={phase} />}

          {/* Error */}
          {phase === "error" && (
            <div
              role="alert"
              style={{
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                padding: "24px",
                maxWidth: 560,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "var(--ink)",
                  marginBottom: 16,
                }}
              >
                {errorMsg}
              </p>
              <button
                type="button"
                onClick={runAnalysis}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Report */}
          {phase === "done" && report && (
            <>
              <TrustScoreSection report={report} />
              <StarterTasksSection tasks={report.starterTasks} owner={owner} repo={repoName} />
              <DriftSection findings={report.driftFindings} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────

const ghostBtnStyle: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  borderRadius: 4,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 500,
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
  fontFamily: "inherit",
};
