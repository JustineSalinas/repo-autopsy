import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology — Repo Autopsy",
  description:
    "How Repo Autopsy computes trust scores, blast radius, and documentation drift.",
};

// ── Shared style constants ────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums",
};

const LABEL: React.CSSProperties = {
  ...MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--muted)",
};

const H2: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase" as const,
  color: "var(--ink)",
  margin: "0 0 4px 0",
};

const SECTION_RULE: React.CSSProperties = {
  borderBottom: "1px solid var(--hairline)",
  paddingBottom: 8,
  marginBottom: 24,
  display: "flex",
  alignItems: "baseline",
  gap: 12,
};

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
    <section style={{ marginBottom: 52 }}>
      <div style={SECTION_RULE}>
        <span style={{ ...MONO, fontSize: 11, color: "var(--muted)" }}>
          {number}
        </span>
        <h2 style={H2}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FormulaBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...MONO,
        fontSize: 13,
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 4,
        padding: "16px 20px",
        margin: "16px 0",
        lineHeight: 2,
        overflowX: "auto",
      }}
    >
      {children}
    </div>
  );
}

function DefRow({
  term,
  desc,
}: {
  term: string;
  desc: React.ReactNode;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
      <td
        style={{
          ...MONO,
          fontSize: 12,
          padding: "8px 16px 8px 0",
          verticalAlign: "top",
          whiteSpace: "nowrap",
          color: "var(--accent)",
        }}
      >
        {term}
      </td>
      <td
        style={{
          fontSize: 13,
          padding: "8px 0",
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
      >
        {desc}
      </td>
    </tr>
  );
}

function BandRow({
  range,
  label,
  color,
  desc,
}: {
  range: string;
  label: string;
  color: string;
  desc: string;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
      <td
        style={{
          ...MONO,
          fontSize: 12,
          padding: "8px 16px 8px 0",
          whiteSpace: "nowrap",
          color: "var(--muted)",
          verticalAlign: "top",
        }}
      >
        {range}
      </td>
      <td style={{ padding: "8px 16px 8px 0", verticalAlign: "top" }}>
        <span
          style={{
            ...MONO,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color,
            border: `1px solid ${color}`,
            borderRadius: 3,
            padding: "2px 6px",
          }}
        >
          {label}
        </span>
      </td>
      <td
        style={{
          fontSize: 13,
          color: "var(--muted)",
          padding: "8px 0",
          lineHeight: 1.6,
        }}
      >
        {desc}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 24px 80px",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid var(--hairline)",
          paddingBottom: 20,
          marginBottom: 40,
        }}
      >
        <Link
          href="/"
          style={{
            ...MONO,
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          ← Repo Autopsy
        </Link>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.01em",
            margin: "12px 0 4px",
            color: "var(--ink)",
          }}
        >
          Methodology
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
          How the analysis works, what the numbers mean, and where it falls short.
        </p>
      </div>

      {/* ── Stage overview ──────────────────────────────────────────────── */}
      <Section number="01" title="Three stages">
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--muted)", marginTop: 0 }}>
          Every analysis runs three sequential stages. Each stage feeds data into the next.
        </p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <tbody>
            <DefRow
              term="Stage 1 — Drift"
              desc={
                <>
                  The GitHub API fetches the README, <code>.env.example</code>, file tree,
                  and up to 40 source files. Three detectors compare what the documentation
                  says against what the code actually contains: unused env-var references,
                  missing setup files, and stale route descriptions.
                </>
              }
            />
            <DefRow
              term="Stage 2 — Blast radius"
              desc={
                <>
                  An import graph is built from JS/TS <code>import</code> and{" "}
                  <code>require</code> statements. For each TODO/FIXME/HACK comment and each
                  open GitHub issue, BFS up to depth&nbsp;5 counts how many modules would be
                  affected by a change. Entry points (routes, pages, middleware) and security
                  labels receive a risk bump.
                </>
              }
            />
            <DefRow
              term="Stage 3 — Trust score"
              desc={
                <>
                  Three penalty buckets (drift, starter-task availability, risk load) are
                  subtracted from a starting score of 100. The result is clamped to 0–100
                  and assigned a band: <strong>Ready</strong>,{" "}
                  <strong>Needs care</strong>, or <strong>Risky onboarding</strong>.
                </>
              }
            />
          </tbody>
        </table>
      </Section>

      {/* ── Trust score formula ─────────────────────────────────────────── */}
      <Section number="02" title="Trust score formula">
        <FormulaBox>
          <div>score = 100 − drift_penalty − starter_penalty − risk_penalty</div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>
            clamped to [0, 100]
          </div>
        </FormulaBox>

        <p style={{ ...LABEL, marginBottom: 8 }}>Bucket 1 — Drift penalty (max −40)</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 20 }}>
          <tbody>
            <DefRow term="high finding" desc="−12 points each" />
            <DefRow term="medium finding" desc="−6 points each" />
            <DefRow term="low finding" desc="−2 points each" />
            <DefRow term="cap" desc="Maximum total deduction: 40 points" />
          </tbody>
        </table>

        <p style={{ ...LABEL, marginBottom: 8 }}>Bucket 2 — Starter-task availability (max −30)</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 20 }}>
          <tbody>
            <DefRow term="no tasks at all" desc="−10 points (the repo documents nothing for newcomers)" />
            <DefRow term="tasks exist, none safe" desc="−30 points (every task carries change risk)" />
            <DefRow term="exactly 1 safe task" desc="−15 points" />
            <DefRow term="2 or more safe tasks" desc="0 points" />
          </tbody>
        </table>

        <p style={{ ...LABEL, marginBottom: 8 }}>Bucket 3 — Risk load (max −30)</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 24 }}>
          <tbody>
            <DefRow term="risky task" desc="−5 points each (high blast-radius change)" />
            <DefRow term="unknown-risk task" desc="−2 points each (blast radius could not be estimated)" />
            <DefRow term="cap" desc="Maximum total deduction: 30 points" />
          </tbody>
        </table>

        <p style={{ ...LABEL, marginBottom: 8 }}>Score bands</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <tbody>
            <BandRow
              range="80 – 100"
              label="Ready"
              color="var(--risk-safe)"
              desc="Low drift, at least two safe starter tasks, manageable risk load. Good to onboard."
            />
            <BandRow
              range="50 – 79"
              label="Needs care"
              color="var(--risk-moderate)"
              desc="Some drift or limited safe entry points. Review issues before assigning work."
            />
            <BandRow
              range="0 – 49"
              label="Risky onboarding"
              color="var(--risk-risky)"
              desc="Heavy drift, no safe tasks, or very high risk load. Significant ramp-up cost expected."
            />
          </tbody>
        </table>
      </Section>

      {/* ── Blast radius ────────────────────────────────────────────────── */}
      <Section number="03" title="Blast radius computation">
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--muted)", marginTop: 0 }}>
          Each candidate task (TODO comment or GitHub issue) gets a blast-radius estimate
          that answers: "if I change this file, how many other modules break?"
        </p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <tbody>
            <DefRow
              term="Import graph"
              desc={
                <>
                  Static analysis of <code>import</code> / <code>require</code> statements
                  builds a forward dependency map (what a file imports) and a reverse map
                  (what imports a file). Only JS and TS files are analysed; other languages
                  are ignored.
                </>
              }
            />
            <DefRow
              term="BFS depth 5"
              desc="Breadth-first search walks the reverse graph up to 5 hops from the changed file, counting all unique reachable modules. This is the reported 'dependents' number."
            />
            <DefRow
              term="Risk classification"
              desc={
                <>
                  0–2 dependents → <strong>safe</strong>. 3–7 dependents →{" "}
                  <strong>moderate</strong>. 8+ dependents → <strong>risky</strong>.
                  Tasks whose blast radius cannot be estimated are labelled{" "}
                  <strong>unknown</strong>.
                </>
              }
            />
            <DefRow
              term="Entry-point rule"
              desc={
                <>
                  Files matching <code>app/**/page.tsx</code>, <code>app/**/route.ts</code>,{" "}
                  <code>pages/api/**</code>, or <code>middleware.ts</code> are treated as
                  public entry points. Their forward dependency count (modules they pull in)
                  is used as the blast-radius proxy, and the risk level is set to at least
                  <strong> moderate</strong>.
                </>
              }
            />
            <DefRow
              term="Dev-dependency rule"
              desc="Issues that reference known dev-only packages (vitest, eslint, postcss, tailwindcss, typescript, etc.) are classified as safe regardless of importer count."
            />
            <DefRow
              term="Security label bump"
              desc='If a GitHub issue carries a label containing "security", "vulnerability", "cve", "critical", or "high", the computed risk level is bumped one step up (safe → moderate, moderate → risky).'
            />
          </tbody>
        </table>
      </Section>

      {/* ── Known limitations ───────────────────────────────────────────── */}
      <Section number="04" title="Known limitations">
        <ul
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "var(--muted)",
            paddingLeft: 20,
            margin: 0,
          }}
        >
          <li>
            <strong style={{ color: "var(--ink)" }}>Partial scan.</strong> The GitHub
            Contents API is called for up to 40 files. Large repos are analysed on a
            best-effort basis; deeply nested modules may be missed entirely.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>JS/TS imports only.</strong> The
            import graph is built from JavaScript and TypeScript source files. Python,
            Go, Rust, and other languages are not parsed; their dependencies are invisible
            to the blast-radius calculation.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Keyword matching for issues.</strong>{" "}
            The tool does not run the code or understand semantics. Issue-to-file mapping
            relies on tokenising the issue title and matching keywords against file names.
            Vague issue titles ("fix bug", "update docs") produce unknown risk ratings.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Heuristic drift checks.</strong> Drift
            detection uses regex patterns — env-var token extraction, route-shape matching,
            and file-name presence checks — not semantic diff or AST analysis. False
            positives (especially for stale-description findings) are possible.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>No execution context.</strong> Dynamic
            imports, conditional requires, and runtime-generated module paths are not
            tracked. The import graph reflects only statically analysable relationships.
          </li>
        </ul>
      </Section>
    </main>
  );
}
