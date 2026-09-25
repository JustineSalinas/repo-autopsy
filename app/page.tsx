"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_REPOS = [
  { label: "JustineSalinas/pharmatrack", url: "https://github.com/JustineSalinas/pharmatrack" },
  { label: "JustineSalinas/Tuon", url: "https://github.com/JustineSalinas/Tuon" },
];

function parseRepoPath(input: string): { owner: string; repo: string } | null {
  try {
    const trimmed = input.trim().replace(/\.git$/, "");
    // Full URL
    if (trimmed.startsWith("http")) {
      const u = new URL(trimmed);
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
      return null;
    }
    // owner/repo shorthand
    const parts = trimmed.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function navigate(value: string) {
    const parsed = parseRepoPath(value);
    if (!parsed) {
      setError("Enter a GitHub URL or owner/repo (e.g. owner/repo).");
      return;
    }
    setError(null);
    router.push(`/report/${parsed.owner}/${parsed.repo}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(input);
  }

  return (
    <main
      style={{ background: "var(--paper)", color: "var(--ink)" }}
      className="flex flex-col min-h-dvh"
    >
      {/* Top rule */}
      <div style={{ borderBottom: "1px solid var(--hairline)", padding: "0 24px" }}>
        <div
          style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", height: 48 }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}
          >
            Repo Autopsy
          </span>
        </div>
      </div>

      {/* Hero */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 24px",
        }}
      >
        <div style={{ maxWidth: 520, width: "100%" }}>
          {/* Label */}
          <p
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 16,
            }}
          >
            Code health audit
          </p>

          {/* Headline */}
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 600,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              marginBottom: 12,
              color: "var(--ink)",
            }}
          >
            Know what&rsquo;s safe to touch
            <br />before you touch it.
          </h1>

          <p
            style={{
              fontSize: 15,
              color: "var(--muted)",
              marginBottom: 40,
              lineHeight: 1.6,
            }}
          >
            Paste a public GitHub repo. Get a ranked onboarding path, drift
            findings, and a trust score — in seconds.
          </p>

          {/* Input form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(null); }}
                placeholder="https://github.com/owner/repo"
                aria-label="GitHub repository URL"
                style={{
                  flex: 1,
                  border: "1px solid var(--hairline)",
                  borderRadius: 4,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: "var(--paper)",
                  color: "var(--ink)",
                  outline: "none",
                  minWidth: 0,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--hairline)")}
              />
              <button
                type="submit"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontFamily: "inherit",
                }}
              >
                Analyze
              </button>
            </div>

            {error && (
              <p
                role="alert"
                style={{ marginTop: 8, fontSize: 13, color: "var(--risk-risky)" }}
              >
                {error}
              </p>
            )}
          </form>

          {/* Example chips */}
          <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
              Examples:
            </span>
            {EXAMPLE_REPOS.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => navigate(ex.url)}
                className="font-mono"
                style={{
                  fontSize: 12,
                  border: "1px solid var(--hairline)",
                  borderRadius: 4,
                  padding: "4px 10px",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid var(--hairline)",
          padding: "16px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Only scans public repositories &mdash; no data is stored.
        </p>
      </div>
    </main>
  );
}
