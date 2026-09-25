"use client";

import { useState } from "react";
import type { DriftReport, DriftFinding } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-50 border-red-300 text-red-800",
  medium: "bg-yellow-50 border-yellow-300 text-yellow-800",
  low: "bg-blue-50 border-blue-300 text-blue-700",
};

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
};

const TYPE_LABEL: Record<string, string> = {
  unused_env_var: "Unused Env Var",
  missing_setup_file: "Missing Setup File",
  stale_description: "Stale Description",
};

function FindingCard({ finding }: { finding: DriftFinding }) {
  return (
    <div
      className={`border rounded-lg px-4 py-3 text-sm ${SEVERITY_STYLES[finding.severity]}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[finding.severity]}`}
        >
          {finding.severity.toUpperCase()}
        </span>
        <span className="font-medium">{TYPE_LABEL[finding.type] ?? finding.type}</span>
      </div>
      <p>{finding.description}</p>
    </div>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DriftReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setReport(null);
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Analysis failed.");
      } else {
        setReport(data as DriftReport);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const counts = report
    ? {
        high: report.driftFindings.filter((f) => f.severity === "high").length,
        medium: report.driftFindings.filter((f) => f.severity === "medium").length,
        low: report.driftFindings.filter((f) => f.severity === "low").length,
      }
    : null;

  return (
    <main className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            🔬 Repo Autopsy
          </h1>
          <p className="mt-3 text-gray-500 text-base">
            Analyze public GitHub repositories for documentation drift and
            generate a safety-ranked onboarding path.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAnalyze} className="flex gap-2">
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {report && (
          <div className="mt-8 space-y-6">
            {/* Meta bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                  Repository
                </p>
                <p className="text-sm font-mono font-semibold text-gray-800">
                  {report.repo}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                  Files scanned
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  {report.meta.filesScanned}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                  README
                </p>
                <p
                  className={`text-sm font-semibold ${
                    report.meta.readmeFound ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {report.meta.readmeFound ? "Found" : "Missing"}
                </p>
              </div>
            </div>

            {/* Severity summary */}
            {counts && (
              <div className="grid grid-cols-3 gap-3 text-center">
                {(["high", "medium", "low"] as const).map((s) => (
                  <div
                    key={s}
                    className={`rounded-lg border px-3 py-3 ${SEVERITY_STYLES[s]}`}
                  >
                    <p className="text-2xl font-bold">{counts[s]}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      {s}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Findings list */}
            {report.driftFindings.length === 0 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-6 text-center text-sm text-green-700">
                ✅ No drift signals detected — documentation looks healthy!
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Drift Findings ({report.driftFindings.length})
                </h2>
                {report.driftFindings.map((f, i) => (
                  <FindingCard key={i} finding={f} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
