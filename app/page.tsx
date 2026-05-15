"use client";

import { useRef, useState, type ChangeEvent } from "react";

import type { SatelliteAnalysisResult, DamageZone } from "@/lib/review/schema";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: SatelliteAnalysisResult }
  | { status: "error"; message: string };

type ImageSlot = { file: File; preview: string } | null;

const VERDICT_META: Record<
  SatelliteAnalysisResult["damage_assessment"]["overall_verdict"],
  { label: string; color: string; bg: string }
> = {
  SIGNIFICANT_DAMAGE: { label: "Significant Damage", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  MODERATE_DAMAGE: { label: "Moderate Damage", color: "#f97316", bg: "rgba(249,115,22,0.1)" },
  MINOR_DAMAGE: { label: "Minor Damage", color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  NO_CHANGE: { label: "No Change", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient Evidence",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.1)",
  },
};

const SEVERITY_COLOR: Record<DamageZone["severity"], string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f97316",
  LOW: "#eab308",
};

const DAMAGE_TYPE_LABEL: Record<DamageZone["damage_type"], string> = {
  structural_destruction: "Structural",
  fire_damage: "Fire",
  flooding: "Flood",
  debris: "Debris",
  infrastructure_damage: "Infrastructure",
  vegetation_loss: "Vegetation",
  crater: "Crater",
  other: "Other",
};

export default function Home() {
  const [before, setBefore] = useState<ImageSlot>(null);
  const [after, setAfter] = useState<ImageSlot>(null);
  const [locationHint, setLocationHint] = useState("");
  const [eventTypeHint, setEventTypeHint] = useState("");
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  function handleImage(slot: "before" | "after") {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) {
        return;
      }

      const preview = URL.createObjectURL(file);

      if (slot === "before") {
        setBefore({ file, preview });
      } else {
        setAfter({ file, preview });
      }
    };
  }

  async function analyze() {
    if (!before || !after) {
      return;
    }

    setState({ status: "loading" });

    try {
      const formData = new FormData();
      formData.append("before", before.file);
      formData.append("after", after.file);

      if (locationHint.trim()) {
        formData.append("locationHint", locationHint.trim());
      }

      if (eventTypeHint.trim()) {
        formData.append("eventTypeHint", eventTypeHint.trim());
      }

      const response = await fetch("/api/review", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as SatelliteAnalysisResult | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Analysis failed.");
      }

      setState({ status: "done", result: payload as SatelliteAnalysisResult });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Analysis failed.",
      });
    }
  }

  function exportReport(result: SatelliteAnalysisResult) {
    const lines = [
      "SATELLITE DAMAGE ASSESSMENT REPORT",
      "===================================",
      `Timestamp: ${result.analysis_timestamp}`,
      `Event type: ${result.event_type}`,
      "",
      "DAMAGE ASSESSMENT",
      "-----------------",
      `Verdict: ${result.damage_assessment.overall_verdict}`,
      `Severity score: ${result.damage_assessment.damage_severity_score}/100`,
      `Confidence: ${result.damage_assessment.confidence}`,
      `Confidence reason: ${result.damage_assessment.confidence_reason}`,
      `Estimated affected area: ${result.damage_assessment.estimated_affected_area ?? "N/A"}`,
      "",
      "SUMMARY",
      "-------",
      result.user_visible.summary,
      "",
      "KEY FINDINGS",
      "------------",
      ...result.user_visible.key_findings.map((f) => `• ${f}`),
      "",
      "DAMAGE ZONES",
      "------------",
      ...result.damage_zones.map(
        (z) =>
          `[${z.severity}] ${DAMAGE_TYPE_LABEL[z.damage_type]} — ${z.location_hint}\n  ${z.description}${z.estimated_area ? `\n  Area: ${z.estimated_area}` : ""}`,
      ),
      "",
      "CHANGE INDICATORS",
      "-----------------",
      "Structural:",
      ...result.change_indicators.structural_changes.map((c) => `  • ${c}`),
      "Vegetation:",
      ...result.change_indicators.vegetation_changes.map((c) => `  • ${c}`),
      "Water:",
      ...result.change_indicators.water_changes.map((c) => `  • ${c}`),
      "Other:",
      ...result.change_indicators.other_changes.map((c) => `  • ${c}`),
      "",
      "UNCERTAINTY NOTES",
      "-----------------",
      ...result.user_visible.uncertainty_notes.map((n) => `• ${n}`),
      "",
      "IMAGE QUALITY",
      "-------------",
      `Before image usable: ${result.image_quality.before_image.usable ? "Yes" : "No"}`,
      `After image usable: ${result.image_quality.after_image.usable ? "Yes" : "No"}`,
      `Alignment quality: ${result.image_quality.alignment_quality}`,
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `damage-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const result = state.status === "done" ? state.result : null;
  const verdictMeta = result ? VERDICT_META[result.damage_assessment.overall_verdict] : null;
  const canAnalyze = !!before && !!after && state.status !== "loading";

  return (
    <main className="flex flex-1 flex-col bg-[var(--background)] font-mono text-[var(--text-primary)]">
      <section className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Post-event analysis
          </p>
          <h1 className="mt-2 text-[36px] font-black leading-tight tracking-tight text-[var(--text-primary)] sm:text-[48px]">
            Satellite Change Detection
          </h1>
          <p className="mx-auto mt-3 max-w-[540px] text-[14px] leading-6 text-[var(--text-secondary)]">
            Upload a before and after satellite or aerial image to detect infrastructure damage,
            estimate affected area, and generate a confidence-scored assessment report.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Upload panel */}
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <p className="mb-4 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Input images
            </p>

            <div className="grid grid-cols-2 gap-3">
              <ImageUploadSlot
                label="Before"
                slot={before}
                inputRef={beforeRef}
                onChange={handleImage("before")}
              />
              <ImageUploadSlot
                label="After"
                slot={after}
                inputRef={afterRef}
                onChange={handleImage("after")}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-black uppercase text-[var(--text-muted)]">
                  Location hint
                </span>
                <input
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                  placeholder="e.g. Mariupol, Ukraine"
                  value={locationHint}
                  onChange={(e) => setLocationHint(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-black uppercase text-[var(--text-muted)]">
                  Event type hint
                </span>
                <input
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                  placeholder="e.g. explosion, flood"
                  value={eventTypeHint}
                  onChange={(e) => setEventTypeHint(e.target.value)}
                />
              </label>
            </div>

            <button
              className="mt-4 inline-flex h-[48px] w-full items-center justify-center rounded-[10px] bg-[var(--button)] text-[14px] font-black text-[var(--button-text)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canAnalyze}
              onClick={() => void analyze()}
            >
              {state.status === "loading" ? "Analyzing..." : "Analyze"}
            </button>

            {state.status === "error" && (
              <p className="mt-3 text-center text-[12px] text-[#ef4444]">{state.message}</p>
            )}
          </div>

          {/* Results panel */}
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            {!result && (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                <div className="text-[32px] opacity-20">&#9650;</div>
                <p className="mt-4 text-[13px] text-[var(--text-muted)]">
                  Upload both images and click Analyze to see the damage assessment.
                </p>
              </div>
            )}

            {result && verdictMeta && (
              <div className="grid gap-4">
                {/* Verdict header */}
                <div
                  className="rounded-[12px] p-4 text-center"
                  style={{ background: verdictMeta.bg, border: `1px solid ${verdictMeta.color}30` }}
                >
                  <p
                    className="text-[22px] font-black uppercase"
                    style={{ color: verdictMeta.color }}
                  >
                    {verdictMeta.label}
                  </p>
                  <p className="mt-1 text-[12px] font-bold uppercase text-[var(--text-muted)]">
                    {result.event_type}
                  </p>

                  <div className="mt-3 flex flex-wrap justify-center gap-3 text-[12px] font-black">
                    <span
                      className="rounded-full px-3 py-1"
                      style={{ background: verdictMeta.bg, color: verdictMeta.color }}
                    >
                      Score {result.damage_assessment.damage_severity_score}/100
                    </span>
                    <ConfidenceBadge confidence={result.damage_assessment.confidence} />
                    {result.damage_assessment.estimated_affected_area && (
                      <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-[var(--text-secondary)]">
                        {result.damage_assessment.estimated_affected_area}
                      </span>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <p className="text-[13px] leading-6 text-[var(--text-secondary)]">
                  {result.user_visible.summary}
                </p>

                {/* Damage zones */}
                {result.damage_zones.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase text-[var(--text-muted)]">
                      Damage zones
                    </p>
                    <div className="grid gap-2">
                      {result.damage_zones.map((zone) => (
                        <div
                          key={zone.zone_id}
                          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-black text-white"
                              style={{ background: SEVERITY_COLOR[zone.severity] }}
                            >
                              {zone.severity}
                            </span>
                            <span className="text-[12px] font-black text-[var(--text-primary)]">
                              {DAMAGE_TYPE_LABEL[zone.damage_type]}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)]">
                              — {zone.location_hint}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                            {zone.description}
                          </p>
                          {zone.estimated_area && (
                            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                              Area: {zone.estimated_area}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key findings */}
                {result.user_visible.key_findings.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase text-[var(--text-muted)]">
                      Key findings
                    </p>
                    <ul className="grid gap-1">
                      {result.user_visible.key_findings.map((finding, i) => (
                        <li
                          key={i}
                          className="text-[12px] leading-5 text-[var(--text-secondary)] before:mr-2 before:content-['•']"
                        >
                          {finding}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Uncertainty notes */}
                {result.user_visible.uncertainty_notes.length > 0 && (
                  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                    <p className="mb-1 text-[11px] font-black uppercase text-[var(--text-muted)]">
                      Uncertainty
                    </p>
                    <ul className="grid gap-1">
                      {result.user_visible.uncertainty_notes.map((note, i) => (
                        <li key={i} className="text-[11px] leading-5 text-[var(--text-muted)]">
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Image quality */}
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>
                    Before:{" "}
                    <b>{result.image_quality.before_image.usable ? "usable" : "unusable"}</b>
                  </span>
                  <span>·</span>
                  <span>
                    After:{" "}
                    <b>{result.image_quality.after_image.usable ? "usable" : "unusable"}</b>
                  </span>
                  <span>·</span>
                  <span>
                    Alignment: <b>{result.image_quality.alignment_quality}</b>
                  </span>
                </div>

                <button
                  className="inline-flex h-[42px] w-full items-center justify-center rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] text-[13px] font-black text-[var(--text-primary)] transition hover:bg-[var(--surface-strong)]"
                  onClick={() => exportReport(result)}
                >
                  Export Report
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function ImageUploadSlot({
  label,
  slot,
  inputRef,
  onChange,
}: {
  label: string;
  slot: ImageSlot;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-black uppercase text-[var(--text-muted)]">{label}</p>
      <button
        className="relative flex h-[160px] w-full flex-col items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-strong)] transition hover:border-[var(--text-muted)]"
        onClick={() => inputRef.current?.click()}
      >
        {slot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={label}
            className="h-full w-full object-cover"
            src={slot.preview}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--text-muted)]">
            <span className="text-[24px] opacity-40">+</span>
            <span className="text-[11px] font-black uppercase">Upload</span>
          </div>
        )}
        {slot && (
          <div className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-2 py-1 text-[10px] text-white">
            {slot.file.name}
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        accept="image/png,image/jpeg,image/webp,image/tiff"
        className="hidden"
        type="file"
        onChange={onChange}
      />
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: SatelliteAnalysisResult["damage_assessment"]["confidence"];
}) {
  const colors = {
    HIGH: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
    MEDIUM: { color: "#eab308", bg: "rgba(234,179,8,0.12)" },
    LOW: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  };
  const c = colors[confidence];

  return (
    <span
      className="rounded-full px-3 py-1"
      style={{ color: c.color, background: c.bg }}
    >
      {confidence} confidence
    </span>
  );
}
