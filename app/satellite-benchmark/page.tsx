"use client";

import { useEffect, useMemo, useState } from "react";

import {
  runGeneratedCaseBenchmark,
  type GeneratedCaseBenchmarkMode,
} from "@/components/satellite/analysisActions";
import type { DamageVerdict, SatelliteAnalysisResult } from "@/lib/review/schema";
import type { GeneratedSatelliteCase } from "@/lib/satellite/types";

type BenchmarkRunState =
  | { status: "idle" }
  | { status: "loading"; message: string; completed: number; total: number }
  | { status: "done" }
  | { status: "error"; message: string };

type BenchmarkResult = {
  id: string;
  caseTitle: string;
  label: string;
  mode: GeneratedCaseBenchmarkMode;
  expected: string;
  passed: boolean;
  weakEvidence: boolean;
  visualChangeScore: number;
  changedPixelPercent: number;
  targetStatus?: SatelliteAnalysisResult["target_status"];
  verdict?: DamageVerdict;
  severity?: number;
  confidence?: number;
  reason: string;
  error?: string;
};

type MetricTone = "green" | "blue" | "yellow" | "red" | "neutral";

const MAX_CASES = 10;
const MIN_STRONG_VISUAL_CHANGE = 4;
const CONTROL_MAX_SEVERITY = 15;
const CONTROL_MAX_VISUAL_CHANGE = 1;

export default function SatelliteBenchmarkPage() {
  const [cases, setCases] = useState<GeneratedSatelliteCase[]>([]);
  const [caseLimit, setCaseLimit] = useState(5);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [runState, setRunState] = useState<BenchmarkRunState>({ status: "idle" });

  useEffect(() => {
    void loadCases();
  }, []);

  async function loadCases() {
    const response = await fetch("/api/satellite/cases");
    const payload = (await response.json()) as { cases: GeneratedSatelliteCase[] };
    setCases(payload.cases);
  }

  async function runBenchmark() {
    const selectedCases = cases.slice(0, Math.max(1, Math.min(caseLimit, MAX_CASES)));
    const total = selectedCases.length * 2;
    const nextResults: BenchmarkResult[] = [];

    setResults([]);
    setRunState({
      status: "loading",
      message: "Starting benchmark...",
      completed: 0,
      total,
    });

    let completed = 0;

    for (const item of selectedCases) {
      for (const mode of ["no_change_control", "real_change"] as const) {
        setRunState({
          status: "loading",
          message:
            mode === "no_change_control"
              ? `${item.title} — hallucination control`
              : `${item.title} — real before/after`,
          completed,
          total,
        });

        try {
          const output = await runGeneratedCaseBenchmark(item, mode);
          nextResults.push(scoreBenchmarkResult(item, mode, output));
        } catch (error) {
          nextResults.push({
            id: `${item.id}-${mode}`,
            caseTitle: item.title,
            label: item.label,
            mode,
            expected: mode === "no_change_control" ? "No visible damage" : "Damage should be detected",
            passed: false,
            weakEvidence: false,
            visualChangeScore: 0,
            changedPixelPercent: 0,
            reason: "Analysis request failed.",
            error: error instanceof Error ? error.message : "Benchmark analysis failed.",
          });
        }

        completed += 1;
        setResults([...nextResults]);
      }
    }

    setRunState({ status: "done" });
  }

  const summary = useMemo(() => summarizeResults(results), [results]);

  return (
    <main className="min-h-dvh bg-[#080a0d] px-4 py-6 font-mono text-[var(--text-primary)] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Satellite AI reliability test
            </p>
            <h1 className="mt-2 text-[28px] font-black tracking-tight sm:text-[42px]">
              AI Difference Benchmark
            </h1>
            <p className="mt-4 max-w-[760px] text-[13px] leading-6 text-[var(--text-secondary)]">
              Runs real before/after tests and no-change controls. The control uses the same
              image as before and after, so any damage call there counts as hallucination.
            </p>
          </div>
          <a
            className="rounded-[9px] border border-white/15 px-4 py-2 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
            href="/satellite-generator"
          >
            Generator
          </a>
        </div>

        <section className="mt-8 rounded-[12px] border border-white/15 bg-[#191b20] p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="grid gap-2 text-[11px] font-black uppercase text-[var(--text-muted)]">
              Cases to test
              <input
                className="h-10 w-24 rounded-[8px] border border-white/15 bg-white/5 px-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-white/35"
                max={MAX_CASES}
                min={1}
                type="number"
                value={caseLimit}
                onChange={(event) =>
                  setCaseLimit(Math.max(1, Math.min(MAX_CASES, Number(event.target.value))))
                }
              />
            </label>
            <button
              className="h-10 rounded-[8px] bg-white px-5 text-[12px] font-black uppercase text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={cases.length === 0 || runState.status === "loading"}
              type="button"
              onClick={() => void runBenchmark()}
            >
              {runState.status === "loading" ? "Running..." : "Run benchmark"}
            </button>
            <p className="text-[11px] text-[var(--text-muted)]">
              {cases.length} generated cases available · {Math.min(caseLimit, cases.length)} selected
            </p>
          </div>

          {runState.status === "loading" && (
            <div className="mt-5 rounded-[9px] border border-[#3b82f6]/30 bg-[#3b82f6]/10 p-4">
              <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--text-secondary)]">
                <span>{runState.message}</span>
                <span>
                  {runState.completed}/{runState.total}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#3b82f6]"
                  style={{ width: `${(runState.completed / runState.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {cases.length === 0 && (
            <p className="mt-5 rounded-[9px] border border-white/10 bg-white/5 p-4 text-[12px] text-[var(--text-muted)]">
              No generated cases found. Generate before/after pairs first.
            </p>
          )}
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Reliability" value={summary.reliability} tone={summary.reliabilityTone} />
          <Metric label="No hallucination" value={summary.noHallucination} tone="green" />
          <Metric label="Damage detection" value={summary.damageDetection} tone="blue" />
          <Metric label="Strong evidence" value={summary.strongEvidence} tone="yellow" />
        </section>

        <section className="mt-5 grid gap-3">
          {results.length === 0 ? (
            <p className="rounded-[12px] border border-white/15 bg-[#191b20] p-5 text-[12px] text-[var(--text-muted)]">
              Results will appear here after the benchmark run.
            </p>
          ) : (
            results.map((result) => <ResultRow key={result.id} result={result} />)
          )}
        </section>
      </div>
    </main>
  );
}

function scoreBenchmarkResult(
  item: GeneratedSatelliteCase,
  mode: GeneratedCaseBenchmarkMode,
  output: {
    analysis: SatelliteAnalysisResult;
    visualChangeScore: number;
    changedPixelPercent: number;
  },
): BenchmarkResult {
  const { analysis, visualChangeScore, changedPixelPercent } = output;
  const severity = analysis.damage_assessment.damage_severity_score;
  const confidence = analysis.damage_assessment.confidence_score;
  const verdict = analysis.damage_assessment.overall_verdict;

  if (mode === "no_change_control") {
    const noDamageVerdict = verdict === "NO_CHANGE" || verdict === "INSUFFICIENT_EVIDENCE";
    const noDamageStatus = analysis.target_status === "active" || analysis.target_status === "unknown";
    const passed =
      visualChangeScore <= CONTROL_MAX_VISUAL_CHANGE &&
      noDamageVerdict &&
      noDamageStatus &&
      severity <= CONTROL_MAX_SEVERITY;

    return {
      id: `${item.id}-${mode}`,
      caseTitle: item.title,
      label: item.label,
      mode,
      expected: "No damage: same image used as before and after",
      passed,
      weakEvidence: false,
      visualChangeScore,
      changedPixelPercent,
      targetStatus: analysis.target_status,
      verdict,
      severity,
      confidence,
      reason: passed
        ? "AI did not invent damage on the no-change control."
        : "AI reported damage or high severity even though before and after were identical.",
    };
  }

  const weakEvidence = visualChangeScore < MIN_STRONG_VISUAL_CHANGE;
  const reportsChange =
    verdict === "MINOR_DAMAGE" ||
    verdict === "MODERATE_DAMAGE" ||
    verdict === "SIGNIFICANT_DAMAGE" ||
    analysis.target_status === "destroyed" ||
    analysis.target_status === "partially_active" ||
    severity >= expectedSeverityFloor(item.label);

  return {
    id: `${item.id}-${mode}`,
    caseTitle: item.title,
    label: item.label,
    mode,
    expected: `${item.label}: AI should detect target change when visual evidence is strong`,
    passed: !weakEvidence && reportsChange,
    weakEvidence,
    visualChangeScore,
    changedPixelPercent,
    targetStatus: analysis.target_status,
    verdict,
    severity,
    confidence,
    reason: weakEvidence
      ? "Image pair has weak measured visual change, so this is evidence-limited."
      : reportsChange
        ? "AI detected target-level change on a visually changed pair."
        : "AI missed target-level change on a visually changed pair.",
  };
}

function expectedSeverityFloor(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("destroyed")) return 45;
  if (normalized.includes("severely")) return 35;
  if (normalized.includes("moderate")) return 20;
  return 10;
}

function summarizeResults(results: BenchmarkResult[]) {
  const controls = results.filter((result) => result.mode === "no_change_control" && !result.error);
  const realStrong = results.filter(
    (result) => result.mode === "real_change" && !result.error && !result.weakEvidence,
  );
  const realAll = results.filter((result) => result.mode === "real_change" && !result.error);
  const controlScore = percentage(controls.filter((result) => result.passed).length, controls.length);
  const damageScore = percentage(realStrong.filter((result) => result.passed).length, realStrong.length);
  const evidenceScore = percentage(realStrong.length, realAll.length);
  const reliability =
    controls.length === 0
      ? null
      : Math.round(
          controlScore * 0.6 +
            (realStrong.length > 0 ? damageScore * 0.3 : 0) +
            evidenceScore * 0.1,
        );
  const reliabilityTone: MetricTone =
    reliability === null ? "neutral" : reliability >= 75 ? "green" : reliability >= 50 ? "yellow" : "red";

  return {
    reliability: formatPercent(reliability),
    reliabilityTone,
    noHallucination: formatRatio(controls.filter((result) => result.passed).length, controls.length),
    damageDetection: formatRatio(realStrong.filter((result) => result.passed).length, realStrong.length),
    strongEvidence: formatRatio(realStrong.length, realAll.length),
  };
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function formatRatio(value: number, total: number) {
  return total === 0 ? "N/A" : `${percentage(value, total)}%`;
}

function formatPercent(value: number | null) {
  return value === null ? "N/A" : `${value}%`;
}

function Metric({
  label,
  tone,
  value,
}: {
  label: string;
  value: string;
  tone: MetricTone;
}) {
  const color =
    tone === "green"
      ? "#22c55e"
      : tone === "blue"
        ? "#3b82f6"
        : tone === "yellow"
          ? "#eab308"
          : tone === "red"
            ? "#ef4444"
            : "var(--text-primary)";

  return (
    <div className="rounded-[12px] border border-white/15 bg-[#191b20] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-[34px] font-black" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function ResultRow({ result }: { result: BenchmarkResult }) {
  const badgeColor = result.error
    ? "#ef4444"
    : result.weakEvidence
      ? "#eab308"
      : result.passed
        ? "#22c55e"
        : "#ef4444";

  return (
    <div className="rounded-[12px] border border-white/15 bg-[#191b20] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {result.mode === "no_change_control" ? "Hallucination control" : "Real before/after"}
          </p>
          <h2 className="mt-1 text-[16px] font-black">{result.caseTitle}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{result.expected}</p>
        </div>
        <span
          className="rounded-[7px] px-3 py-1.5 text-[11px] font-black uppercase text-black"
          style={{ background: badgeColor }}
        >
          {result.error ? "Error" : result.weakEvidence ? "Weak evidence" : result.passed ? "Pass" : "Fail"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        <SmallMetric label="AI status" value={result.targetStatus ?? "-"} />
        <SmallMetric label="Verdict" value={result.verdict ?? "-"} />
        <SmallMetric label="Severity" value={result.severity === undefined ? "-" : String(result.severity)} />
        <SmallMetric label="Confidence" value={result.confidence === undefined ? "-" : String(result.confidence)} />
        <SmallMetric label="Visual diff" value={`${result.visualChangeScore}/100`} />
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
        {result.error ?? result.reason}
      </p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 truncate text-[12px] font-black text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
