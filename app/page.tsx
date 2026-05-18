"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useSearchParams } from "next/navigation";

import type { AffectedObject, DamageZone, SatelliteAnalysisResult, TargetStatus } from "@/lib/review/schema";
import { BeforeAfterSlider } from "@/components/satellite/BeforeAfterSlider";
import { createFullImagePairHeatmapPreview } from "@/components/satellite/analysisActions";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: SatelliteAnalysisResult }
  | { status: "error"; message: string };

type ImageSlot = { file: File; preview: string } | null;
type ActiveView = "map" | "analytics" | "commander";
type MarkerStatus = TargetStatus;
type CommanderDecision = "validated" | "hold";

type MapMarker = {
  id: string;
  label: string;
  locationInput: string;
  lat: number;
  lon: number;
  status: MarkerStatus;
  eventType?: string;
  recommendedAction?: string;
  confidenceScore: number;
  severityScore: number;
  summary: string;
  createdAt: string;
  beforePreview?: string;
  afterPreview?: string;
  beforeDate?: string;
  afterDate?: string;
};

type CommanderReview = {
  id: string;
  marker: MapMarker;
  decision: CommanderDecision;
  decidedAt: string;
};

type ResolvedLocation = {
  label: string;
  lat: number;
  lon: number;
};

const MARKERS_STORAGE_KEY = "after-map-markers-v1";
const COMMANDER_REVIEWS_STORAGE_KEY = "after-map-commander-reviews-v1";

const UKRAINE_BOUNDS = {
  minLat: 44.0,
  maxLat: 52.6,
  minLon: 22.1,
  maxLon: 40.3,
};

const KNOWN_UKRAINE_LOCATIONS: Record<string, ResolvedLocation> = {
  avdiivka: { label: "Avdiivka", lat: 48.1399, lon: 37.7426 },
  bakhmut: { label: "Bakhmut", lat: 48.5944, lon: 38.0009 },
  "chasiv yar": { label: "Chasiv Yar", lat: 48.5935, lon: 37.8572 },
  dnipro: { label: "Dnipro", lat: 48.4647, lon: 35.0462 },
  izyum: { label: "Izium", lat: 49.2125, lon: 37.2569 },
  kakhovka: { label: "Kakhovka", lat: 46.8137, lon: 33.4869 },
  kharkiv: { label: "Kharkiv", lat: 49.9935, lon: 36.2304 },
  kherson: { label: "Kherson", lat: 46.6354, lon: 32.6169 },
  kupiansk: { label: "Kupiansk", lat: 49.7106, lon: 37.6152 },
  kyiv: { label: "Kyiv", lat: 50.4501, lon: 30.5234 },
  lyman: { label: "Lyman", lat: 48.9884, lon: 37.8022 },
  mariupol: { label: "Mariupol", lat: 47.0971, lon: 37.5434 },
  "nova kakhovka": { label: "Nova Kakhovka", lat: 46.7545, lon: 33.3486 },
  pokrovsk: { label: "Pokrovsk", lat: 48.282, lon: 37.1758 },
  robotyne: { label: "Robotyne", lat: 47.4479, lon: 35.8426 },
  toretsk: { label: "Toretsk", lat: 48.3977, lon: 37.8479 },
  vovchansk: { label: "Vovchansk", lat: 50.2908, lon: 36.9411 },
  zaporizhzhia: { label: "Zaporizhzhia", lat: 47.8388, lon: 35.1396 },
};

const TARGET_STATUS_META: Record<
  TargetStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  destroyed: {
    label: "DESTROYED",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.35)",
  },
  partially_active: {
    label: "PARTIALLY ACTIVE",
    color: "#eab308",
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.35)",
  },
  active: {
    label: "ACTIVE — NOT NEUTRALIZED",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.35)",
  },
  unknown: {
    label: "STATUS UNCONFIRMED",
    color: "#eab308",
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.35)",
  },
};

const VERDICT_META: Record<
  SatelliteAnalysisResult["damage_assessment"]["overall_verdict"],
  { label: string; color: string; bg: string }
> = {
  SIGNIFICANT_DAMAGE: { label: "Significant Damage", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  MODERATE_DAMAGE: { label: "Moderate Damage", color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  MINOR_DAMAGE: { label: "Minor Damage", color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  NO_CHANGE: { label: "No Change", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient Evidence",
    color: "#eab308",
    bg: "rgba(234,179,8,0.1)",
  },
};

const SEVERITY_COLOR: Record<DamageZone["severity"], string> = {
  HIGH: "#ef4444",
  MEDIUM: "#eab308",
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
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [commanderReviews, setCommanderReviews] = useState<CommanderReview[]>([]);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [before, setBefore] = useState<ImageSlot>(null);
  const [after, setAfter] = useState<ImageSlot>(null);
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [eventTypeHint, setEventTypeHint] = useState("");
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const markersLoadedRef = useRef(false);
  const reviewsLoadedRef = useRef(false);

  useEffect(() => {
    void fetch("/api/markers")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setMarkers((data as MapMarker[]).filter(isValidMarker));
        } else {
          const stored = window.localStorage.getItem(MARKERS_STORAGE_KEY);
          if (stored) {
            try { setMarkers((JSON.parse(stored) as MapMarker[]).filter(isValidMarker)); } catch { /* ignore */ }
          }
        }
      })
      .catch(() => {
        const stored = window.localStorage.getItem(MARKERS_STORAGE_KEY);
        if (stored) {
          try { setMarkers((JSON.parse(stored) as MapMarker[]).filter(isValidMarker)); } catch { /* ignore */ }
        }
      })
      .finally(() => { markersLoadedRef.current = true; });
  }, []);

  useEffect(() => {
    if (!markersLoadedRef.current) return;
    window.localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
    void fetch("/api/markers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(markers),
    }).catch(() => { /* silent fail */ });
  }, [markers]);

  useEffect(() => {
    void fetch("/api/reviews")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setCommanderReviews((data as CommanderReview[]).filter(isValidCommanderReview));
        } else {
          const stored = window.localStorage.getItem(COMMANDER_REVIEWS_STORAGE_KEY);
          if (stored) {
            try { setCommanderReviews((JSON.parse(stored) as CommanderReview[]).filter(isValidCommanderReview)); } catch { /* ignore */ }
          }
        }
      })
      .catch(() => {
        const stored = window.localStorage.getItem(COMMANDER_REVIEWS_STORAGE_KEY);
        if (stored) {
          try { setCommanderReviews((JSON.parse(stored) as CommanderReview[]).filter(isValidCommanderReview)); } catch { /* ignore */ }
        }
      })
      .finally(() => { reviewsLoadedRef.current = true; });
  }, []);

  useEffect(() => {
    if (!reviewsLoadedRef.current) return;
    window.localStorage.setItem(COMMANDER_REVIEWS_STORAGE_KEY, JSON.stringify(commanderReviews));
    void fetch("/api/reviews", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(commanderReviews),
    }).catch(() => { /* silent fail */ });
  }, [commanderReviews]);

  useEffect(() => {
    if (searchParams.get("view") === "commander") {
      setActiveView("commander");
    }
  }, [searchParams]);

  const resolvedLocation = useMemo(
    () => resolveUkraineLocation(locationHint),
    [locationHint],
  );

  function handleImage(slot: "before" | "after") {
    return async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) {
        return;
      }

      const preview = await readFileAsDataUrl(file);

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

      if (beforeDate) formData.append("beforeDate", beforeDate);
      if (afterDate) formData.append("afterDate", afterDate);

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

      const result = payload as SatelliteAnalysisResult;
      setState({ status: "done", result });
      addMarkerFromAnalysis(result);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Analysis failed.",
      });
    }
  }

  function addMarkerFromAnalysis(result: SatelliteAnalysisResult) {
    const location = resolveUkraineLocation(locationHint);

    if (!location) {
      setMapNotice(
        "No map marker was added. Enter coordinates like 46.81, 33.49 or a known Ukrainian place name.",
      );
      return;
    }

    const marker: MapMarker = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: location.label,
      locationInput: locationHint.trim(),
      lat: location.lat,
      lon: location.lon,
      status: result.target_status,
      eventType: result.event_type,
      recommendedAction: result.recommended_action,
      confidenceScore: result.damage_assessment.confidence_score,
      severityScore: result.damage_assessment.damage_severity_score,
      summary: result.user_visible.summary,
      createdAt: result.analysis_timestamp,
      beforePreview: before?.preview,
      afterPreview: after?.preview,
      beforeDate,
      afterDate,
    };

    setMarkers((current) => [marker, ...current].slice(0, 40));
    setMapNotice(`${location.label} added to the Ukraine map.`);
    setActiveView("map");
  }

  function clearMarkers() {
    setMarkers([]);
    setMapNotice("Map markers cleared.");
  }

  function updateMarker(id: string, patch: Partial<Pick<MapMarker, "lat" | "lon">>) {
    setMarkers((current) =>
      current.map((marker) => (marker.id === id ? { ...marker, ...patch } : marker)),
    );
  }

  function deleteMarker(id: string) {
    const marker = markers.find((item) => item.id === id);
    setMarkers((current) => current.filter((item) => item.id !== id));
    setCommanderReviews((current) => current.filter((review) => review.marker.id !== id));
    setMapNotice(marker ? `${marker.label} deleted from Commander queue.` : "Marker deleted.");
  }

  function deleteCommanderReview(id: string) {
    setCommanderReviews((current) => current.filter((review) => review.id !== id));
  }

  function reviewCommanderMarker(marker: MapMarker, decision: CommanderDecision) {
    const review: CommanderReview = {
      id: `${marker.id}-${decision}-${Date.now()}`,
      marker,
      decision,
      decidedAt: new Date().toISOString(),
    };

    setCommanderReviews((current) => [
      review,
      ...current.filter((item) => item.marker.id !== marker.id),
    ]);
    setMapNotice(
      decision === "validated"
        ? `${marker.label} moved to Commander / Validated.`
        : `${marker.label} moved to Commander / Hold review.`,
    );
  }

  function exportReport(result: SatelliteAnalysisResult) {
    const lines = [
      "SATELLITE DAMAGE ASSESSMENT REPORT",
      "===================================",
      `Timestamp: ${result.analysis_timestamp}`,
      `Event type: ${result.event_type}`,
      "",
      "TARGET STATUS (BDA)",
      "-------------------",
      `Status: ${result.target_status.toUpperCase()}`,
      `Recommended action: ${result.recommended_action}`,
      "",
      "DAMAGE ASSESSMENT",
      "-----------------",
      `Verdict: ${result.damage_assessment.overall_verdict}`,
      `Severity score: ${result.damage_assessment.damage_severity_score}/100`,
      `Confidence: ${result.damage_assessment.confidence} (${result.damage_assessment.confidence_score}%)`,
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
    <main className="relative h-dvh overflow-hidden bg-[#080a0d] font-mono text-[var(--text-primary)]">
      <UkraineMapPanel
        markers={markers}
        notice={mapNotice}
        onClearMarkers={clearMarkers}
        onDeleteMarker={deleteMarker}
        onOpenAnalytics={() => setActiveView("analytics")}
        onOpenCommander={() => setActiveView("commander")}
        onUpdateMarker={updateMarker}
      />

      {activeView === "analytics" && (
        <div className="absolute inset-x-3 bottom-3 top-3 z-30 overflow-hidden rounded-[14px] border border-white/15 bg-[#121317]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur md:inset-x-auto md:left-auto md:right-4 md:w-[min(860px,calc(100vw-32px))]">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  Post-event analysis
                </p>
                <h1 className="text-[18px] font-black tracking-tight text-[var(--text-primary)]">
                  Satellite Change Detection
                </h1>
              </div>
              <button
                className="h-9 rounded-[8px] border border-white/15 px-3 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
                type="button"
                onClick={() => setActiveView("map")}
              >
                Map
              </button>
            </div>

            <div className="grid flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[0.95fr_1.05fr]">
          {/* Upload panel */}
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
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
                  Before date{" "}
                  <span className="font-normal normal-case opacity-50">(optional)</span>
                </span>
                <input
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                  type="date"
                  value={beforeDate}
                  onChange={(e) => setBeforeDate(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-black uppercase text-[var(--text-muted)]">
                  After date{" "}
                  <span className="font-normal normal-case opacity-50">(optional)</span>
                </span>
                <input
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                  type="date"
                  value={afterDate}
                  onChange={(e) => setAfterDate(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-black uppercase text-[var(--text-muted)]">
                  Location{" "}
                  <span className="font-normal normal-case opacity-50">(optional)</span>
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
                  Event type{" "}
                  <span className="font-normal normal-case opacity-50">(optional)</span>
                </span>
                <input
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                  placeholder="e.g. explosion, flood"
                  value={eventTypeHint}
                  onChange={(e) => setEventTypeHint(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-3 min-h-[40px] rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Map position
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                {resolvedLocation
                  ? `${resolvedLocation.label}: ${resolvedLocation.lat.toFixed(4)}, ${resolvedLocation.lon.toFixed(4)}`
                  : "Use coordinates like 46.8137, 33.4869 or a known place such as Kakhovka, Bakhmut, Avdiivka, Kherson."}
              </p>
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
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            {!result && (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                <div className="text-[32px] opacity-20">&#9650;</div>
                <p className="mt-4 text-[13px] text-[var(--text-muted)]">
                  Upload both images and click Analyze to see the damage assessment.
                </p>
              </div>
            )}
            {result && (
              <ResultsPanel result={result} onExport={() => exportReport(result)} />
            )}
          </div>
        </div>
          </div>
        </div>
      )}

      {activeView === "commander" && (
        <CommanderPanel
          markers={markers}
          reviews={commanderReviews}
          onClose={() => setActiveView("map")}
          onDeleteMarker={deleteMarker}
          onDeleteReview={deleteCommanderReview}
          onReview={reviewCommanderMarker}
        />
      )}
    </main>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────

const OBJECT_STATUS_META: Record<
  AffectedObject["status"],
  { label: string; color: string }
> = {
  destroyed:         { label: "DESTROYED", color: "#ef4444" },
  heavily_damaged:   { label: "HEAVY",     color: "#ef4444" },
  partially_damaged: { label: "PARTIAL",   color: "#eab308" },
  intact:            { label: "INTACT",    color: "#22c55e" },
  unknown:           { label: "UNKNOWN",   color: "#eab308" },
};

function damageBarColor(pct: number) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 65) return "#ef4444";
  if (pct >= 25) return "#eab308";
  return "#22c55e";
}

function ResultsPanel({ result, onExport }: { result: SatelliteAnalysisResult; onExport: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const verdictMeta = VERDICT_META[result.damage_assessment.overall_verdict];
  const statusMeta = TARGET_STATUS_META[result.target_status];
  const confidenceColor =
    result.damage_assessment.confidence === "HIGH" ? "#22c55e"
    : result.damage_assessment.confidence === "MEDIUM" ? "#eab308"
    : "#ef4444";

  return (
    <div className="grid gap-3">
      {/* 1. Target status */}
      <div className="rounded-[12px] p-4" style={{ background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Target Status</p>
        <p className="mt-0.5 text-[20px] font-black leading-tight" style={{ color: statusMeta.color }}>
          {statusMeta.label}
        </p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--text-primary)]">{result.recommended_action}</p>
      </div>

      {/* 2. Stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[10px] bg-[var(--surface-strong)] px-2 py-3 text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Severity</p>
          <p className="mt-1 text-[20px] font-black leading-none" style={{ color: verdictMeta.color }}>
            {result.damage_assessment.damage_severity_score}<span className="text-[11px]">/100</span>
          </p>
        </div>
        <div className="rounded-[10px] bg-[var(--surface-strong)] px-2 py-3 text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Confidence</p>
          <p className="mt-1 text-[20px] font-black leading-none" style={{ color: confidenceColor }}>
            {result.damage_assessment.confidence_score}<span className="text-[11px]">%</span>
          </p>
        </div>
        <div className="rounded-[10px] bg-[var(--surface-strong)] px-2 py-3 text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Area</p>
          <p className="mt-1 text-[13px] font-black leading-tight text-[var(--text-primary)]">
            {result.damage_assessment.estimated_affected_area ?? "—"}
          </p>
        </div>
      </div>

      {/* 3. Affected objects */}
      {result.affected_objects.length > 0 && (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-strong)] p-3">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Affected Objects</p>
          <div className="grid gap-3">
            {result.affected_objects.map((obj, i) => {
              const barColor = damageBarColor(obj.damage_percent);
              const sm = OBJECT_STATUS_META[obj.status];
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-black text-[var(--text-primary)]">{obj.name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black" style={{ background: `${sm.color}22`, color: sm.color }}>
                        {sm.label}
                      </span>
                      <span className="w-[36px] text-right text-[13px] font-black" style={{ color: barColor }}>
                        {obj.damage_percent}%
                      </span>
                    </div>
                  </div>
                  <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--border)]">
                    <div className="h-full rounded-full" style={{ width: `${obj.damage_percent}%`, background: barColor }} />
                  </div>
                  {obj.notes && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{obj.notes}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Key findings */}
      {result.user_visible.key_findings.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Key Findings</p>
          <ul className="grid gap-1.5">
            {result.user_visible.key_findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-5 text-[var(--text-primary)]">
                <span className="mt-0.5 shrink-0 text-[var(--text-muted)]">▸</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Toggle */}
      <button
        className="flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-[var(--surface-strong)] py-2 text-[11px] font-black uppercase tracking-wider text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        onClick={() => setShowDetails((v) => !v)}
      >
        {showDetails ? "▲ Hide details" : "▼ Show details"}
      </button>

      {/* 6. Details */}
      {showDetails && (
        <div className="grid gap-3 border-t border-[var(--border)] pt-3">
          <p className="text-[11px] uppercase text-[var(--text-muted)]">{result.event_type} · {verdictMeta.label}</p>

          {result.damage_zones.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Damage Zones</p>
              <div className="grid gap-2">
                {result.damage_zones.map((zone) => (
                  <div key={zone.zone_id} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full px-2 py-0.5 text-[9px] font-black text-white" style={{ background: SEVERITY_COLOR[zone.severity] }}>
                        {zone.severity}
                      </span>
                      <span className="text-[11px] font-black text-[var(--text-primary)]">{DAMAGE_TYPE_LABEL[zone.damage_type]}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">— {zone.location_hint}</span>
                      {zone.estimated_area && <span className="ml-auto text-[10px] text-[var(--text-muted)]">{zone.estimated_area}</span>}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">{zone.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.user_visible.uncertainty_notes.length > 0 && (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Uncertainty</p>
              <ul className="grid gap-1">
                {result.user_visible.uncertainty_notes.map((n, i) => (
                  <li key={i} className="text-[11px] leading-4 text-[var(--text-muted)]">{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
            <span>Before: <b>{result.image_quality.before_image.usable ? "OK" : "unusable"}</b></span>
            <span>After: <b>{result.image_quality.after_image.usable ? "OK" : "unusable"}</b></span>
            <span>Alignment: <b>{result.image_quality.alignment_quality}</b></span>
          </div>
        </div>
      )}

      {/* 7. Export */}
      <button
        className="inline-flex h-[42px] w-full items-center justify-center rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] text-[12px] font-black uppercase tracking-wider text-[var(--text-primary)] transition hover:bg-[var(--surface-strong)]"
        onClick={onExport}
      >
        Export Report
      </button>
    </div>
  );
}

function CommanderPanel({
  markers,
  reviews,
  onClose,
  onDeleteMarker,
  onDeleteReview,
  onReview,
}: {
  markers: MapMarker[];
  reviews: CommanderReview[];
  onClose: () => void;
  onDeleteMarker: (id: string) => void;
  onDeleteReview: (id: string) => void;
  onReview: (marker: MapMarker, decision: CommanderDecision) => void;
}) {
  const [detailMarker, setDetailMarker] = useState<MapMarker | null>(null);
  const validated = reviews.filter((review) => review.decision === "validated");
  const held = reviews.filter((review) => review.decision === "hold");
  const reviewedMarkerIds = new Set(reviews.map((review) => review.marker.id));
  const pendingMarkers = markers.filter((marker) => !reviewedMarkerIds.has(marker.id));

  return (
    <div className="absolute inset-x-3 bottom-3 top-3 z-30 overflow-hidden rounded-[14px] border border-white/15 bg-[#121317]/96 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Commander
            </p>
            <h1 className="text-[20px] font-black tracking-tight text-[var(--text-primary)]">
              AI Assessment Validation
            </h1>
          </div>
          <button
            className="h-9 rounded-[8px] border border-white/15 px-3 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
            type="button"
            onClick={onClose}
          >
            Map
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-auto p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Pending AI briefs
              </p>
              <span className="rounded-[8px] border border-white/15 px-2 py-1 text-[12px] font-black text-[var(--text-primary)]">
                {pendingMarkers.length}
              </span>
            </div>

            <div className="grid max-w-[1180px] gap-4 lg:grid-cols-[repeat(2,minmax(0,560px))]">
              {pendingMarkers.length === 0 ? (
                <p className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-4 text-[13px] text-[var(--text-muted)]">
                  No AI briefs are available yet.
                </p>
              ) : (
                pendingMarkers.map((marker) => (
                  <CommanderMarkerCard
                    key={marker.id}
                    marker={marker}
                    onDelete={() => onDeleteMarker(marker.id)}
                    onHold={() => onReview(marker, "hold")}
                    onOpenDetails={() => setDetailMarker(marker)}
                    onValidate={() => onReview(marker, "validated")}
                  />
                ))
              )}
            </div>
          </section>

          <aside className="grid content-start gap-4">
            <CommanderFolder
              decision="validated"
              onDeleteReview={onDeleteReview}
              reviews={validated}
              title="Validated folder"
            />
            <CommanderFolder
              decision="hold"
              onDeleteReview={onDeleteReview}
              reviews={held}
              title="Hold folder"
            />
          </aside>
        </div>
      </div>
      {detailMarker && (
        <MarkerDetailsDialog
          marker={detailMarker}
          onClose={() => setDetailMarker(null)}
          onDelete={() => {
            onDeleteMarker(detailMarker.id);
            setDetailMarker(null);
          }}
        />
      )}
    </div>
  );
}

function CommanderMarkerCard({
  marker,
  onDelete,
  onHold,
  onOpenDetails,
  onValidate,
}: {
  marker: MapMarker;
  onDelete: () => void;
  onHold: () => void;
  onOpenDetails: () => void;
  onValidate: () => void;
}) {
  const meta = TARGET_STATUS_META[marker.status];
  const [showHeatmap, setShowHeatmap] = useState(false);
  const hasImagery = Boolean(marker.beforePreview && marker.afterPreview);
  const openDetailsOnKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetails();
    }
  };

  return (
    <article className="w-full rounded-[12px] border border-white/12 bg-[#191b20] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            AI brief
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-[20px] font-black text-[var(--text-primary)]">
              {marker.label}
            </h2>
            {hasImagery && (
              <button
                aria-pressed={showHeatmap}
                className={`h-7 shrink-0 rounded-[7px] border px-2 text-[10px] font-black uppercase transition ${
                  showHeatmap
                    ? "border-[#ef4444]/70 bg-[#ef4444]/15 text-[#f97316]"
                    : "border-white/15 bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
                }`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowHeatmap((current) => !current);
                }}
              >
                {showHeatmap ? "Compare" : "Heatmap"}
              </button>
            )}
          </div>
        </div>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-[8px] border border-white/15 px-2 py-1 text-[11px] font-black uppercase" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="mt-3">
        {marker.beforePreview && marker.afterPreview ? (
          showHeatmap ? (
            <CommanderHeatmapView marker={marker} />
          ) : (
            <BeforeAfterSlider
              afterImage={marker.afterPreview}
              beforeImage={marker.beforePreview}
              title={marker.label}
            />
          )
        ) : (
          <div className="grid h-[180px] place-items-center rounded-[10px] border border-white/10 bg-white/5 text-[12px] text-[var(--text-muted)]">
            No imagery available
          </div>
        )}
      </div>

      <div
        className="mt-3 grid cursor-pointer grid-cols-3 gap-2 rounded-[10px] transition hover:bg-white/[0.03]"
        role="button"
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={openDetailsOnKey}
      >
        <MarkerMetric label="Severity" marker={marker} value={`${marker.severityScore}/100`} />
        <MarkerMetric label="Confidence" marker={marker} value={`${marker.confidenceScore}%`} />
        <MarkerMetric label="Coords" marker={marker} value={`${marker.lat.toFixed(3)}, ${marker.lon.toFixed(3)}`} />
      </div>

      <div
        className="mt-3 cursor-pointer rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 transition hover:border-white/25 hover:bg-white/10"
        role="button"
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={openDetailsOnKey}
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          AI says
        </p>
        <p className="mt-1 line-clamp-4 text-[12px] leading-5 text-[var(--text-secondary)]">
          {marker.summary}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <button
          className="h-10 rounded-[8px] bg-[#22c55e] text-[12px] font-black uppercase text-black transition hover:brightness-110"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onValidate();
          }}
        >
          Validate
        </button>
        <button
          className="h-10 rounded-[8px] bg-[#eab308] text-[12px] font-black uppercase text-black transition hover:brightness-110"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onHold();
          }}
        >
          Hold
        </button>
        <button
          className="h-10 rounded-[8px] border border-white/15 bg-white/5 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            exportMarkerBrief(marker);
          }}
        >
          Export
        </button>
        <button
          className="h-10 rounded-[8px] border border-[#ef4444]/60 bg-[#ef4444]/10 text-[12px] font-black uppercase text-[#ef4444] transition hover:bg-[#ef4444]/20"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function CommanderHeatmapView({ marker }: { marker: MapMarker }) {
  const [heatmapReveal, setHeatmapReveal] = useState(100);
  const [heatmapState, setHeatmapState] = useState<
    | { status: "loading" }
    | {
        status: "done";
        changedPixelPercent: number;
        cropUrl: string;
        heatmapUrl: string;
        visualChangeScore: number;
      }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let preview: {
      changedPixelPercent: number;
      cropUrl: string;
      heatmapUrl: string;
      visualChangeScore: number;
    } | null = null;

    async function buildHeatmap() {
      if (!marker.beforePreview || !marker.afterPreview) {
        setHeatmapState({ status: "error", message: "No imagery available." });
        return;
      }

      setHeatmapState({ status: "loading" });

      try {
        preview = await createFullImagePairHeatmapPreview(marker.beforePreview, marker.afterPreview);

        if (!cancelled) {
          setHeatmapState({ status: "done", ...preview });
        }
      } catch (error) {
        if (!cancelled) {
          setHeatmapState({
            status: "error",
            message: error instanceof Error ? error.message : "Heatmap generation failed.",
          });
        }
      }
    }

    void buildHeatmap();

    return () => {
      cancelled = true;

      if (preview) {
        URL.revokeObjectURL(preview.cropUrl);
        URL.revokeObjectURL(preview.heatmapUrl);
      }
    };
  }, [marker.afterPreview, marker.beforePreview]);

  if (heatmapState.status === "loading") {
    return (
      <div className="grid aspect-square place-items-center rounded-[10px] border border-white/15 bg-black text-[12px] font-black uppercase text-[var(--text-muted)]">
        Building heatmap...
      </div>
    );
  }

  if (heatmapState.status === "error") {
    return (
      <div className="grid aspect-square place-items-center rounded-[10px] border border-[#ef4444]/40 bg-[#ef4444]/10 px-4 text-center text-[12px] text-[#ef4444]">
        {heatmapState.message}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square overflow-hidden rounded-[10px] border border-white/15 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${marker.label} target crop`}
          className="absolute inset-0 h-full w-full object-cover"
          src={heatmapState.cropUrl}
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - heatmapReveal}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`${marker.label} target change heatmap`}
            className="h-full w-full object-cover"
            src={heatmapState.heatmapUrl}
          />
        </div>
        <div
          className="absolute bottom-0 top-0 w-[2px] bg-white"
          style={{ left: `${heatmapReveal}%` }}
        />
        <div className="absolute left-3 top-3 rounded-[6px] bg-black/75 px-2 py-1 text-[10px] font-black uppercase text-white">
          Image
        </div>
        <div className="absolute right-3 top-3 rounded-[6px] bg-black/75 px-2 py-1 text-[10px] font-black uppercase text-white">
          Heatmap
        </div>
      </div>
      <input
        aria-label="Heatmap overlay amount"
        className="w-full accent-white"
        max={100}
        min={0}
        type="range"
        value={heatmapReveal}
        onChange={(event) => setHeatmapReveal(Number(event.target.value))}
      />
    </div>
  );
}

function CommanderImage({
  label,
  onOpen,
  src,
}: {
  label: string;
  onOpen: (src: string) => void;
  src?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-2 py-1 text-[10px] font-black uppercase text-[var(--text-muted)]">
        {label}
      </div>
      {src ? (
        <button
          className="block h-[150px] w-full overflow-hidden text-left"
          type="button"
          onClick={() => onOpen(src)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={label} className="h-full w-full object-cover transition hover:scale-[1.03]" src={src} />
        </button>
      ) : (
        <div className="grid h-[150px] place-items-center px-3 text-center text-[12px] text-[var(--text-muted)]">
          No saved image
        </div>
      )}
    </div>
  );
}

function ImagePreviewDialog({
  label,
  onClose,
  src,
}: {
  label: string;
  onClose: () => void;
  src: string;
}) {
  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="max-h-[calc(100dvh-48px)] w-full max-w-[1100px] overflow-hidden rounded-[14px] border border-white/15 bg-[#121317] shadow-[0_28px_90px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <p className="truncate text-[13px] font-black uppercase text-[var(--text-primary)]">
            {label}
          </p>
          <button
            className="h-9 rounded-[8px] border border-white/15 px-3 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[calc(100dvh-112px)] overflow-auto bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={label} className="mx-auto h-auto max-h-none max-w-full object-contain" src={src} />
        </div>
      </div>
    </div>
  );
}

function CommanderFolder({
  decision,
  onDeleteReview,
  reviews,
  title,
}: {
  decision: CommanderDecision;
  onDeleteReview: (id: string) => void;
  reviews: CommanderReview[];
  title: string;
}) {
  const [selected, setSelected] = useState<CommanderReview | null>(null);
  const decisionColor = decision === "validated" ? "#22c55e" : "#eab308";

  return (
    <section className="rounded-[12px] border border-white/15 bg-[#191b20] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          {title}
        </p>
        <span className="text-[13px] font-black text-[var(--text-primary)]">
          {reviews.length}
        </span>
      </div>
      <div className="mt-3 grid max-h-[260px] gap-2 overflow-auto pr-1">
        {reviews.length === 0 ? (
          <p className="rounded-[8px] border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-[var(--text-muted)]">
            Empty.
          </p>
        ) : (
          reviews.map((review) => (
            <button
              className="w-full rounded-[8px] border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-white/25 hover:bg-white/10"
              key={review.id}
              type="button"
              onClick={() => setSelected(review)}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-black text-[var(--text-primary)]">
                  {review.marker.label}
                </p>
                <span
                  className="shrink-0 text-[10px] font-black uppercase"
                  style={{ color: decisionColor }}
                >
                  {decision}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {formatMarkerDate(review.decidedAt)}
              </p>
            </button>
          ))
        )}
      </div>

      {selected && (
        <ReviewDetailDialog
          decisionColor={decisionColor}
          decisionLabel={decision}
          review={selected}
          onClose={() => setSelected(null)}
          onDelete={() => { onDeleteReview(selected.id); setSelected(null); }}
        />
      )}
    </section>
  );
}

function ReviewDetailDialog({
  decisionColor,
  decisionLabel,
  onClose,
  onDelete,
  review,
}: {
  decisionColor: string;
  decisionLabel: CommanderDecision;
  onClose: () => void;
  onDelete: () => void;
  review: CommanderReview;
}) {
  const marker = review.marker;
  const meta = TARGET_STATUS_META[marker.status];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] overflow-auto rounded-[14px] border border-white/15 bg-[#121317] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.6)]" style={{ maxHeight: "calc(100dvh - 2rem)" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {decisionLabel} · {formatMarkerDate(review.decidedAt)}
            </p>
            <h2 className="mt-1 text-[20px] font-black text-[var(--text-primary)]">
              {marker.label}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="rounded-[7px] border px-2 py-1 text-[11px] font-black uppercase"
              style={{ color: meta.color, borderColor: meta.border }}
            >
              {meta.label}
            </span>
            <button
              className="rounded-[7px] border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-black uppercase text-[var(--text-muted)] transition hover:bg-white/10"
              type="button"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {marker.beforePreview && marker.afterPreview ? (
          <BeforeAfterSlider
            afterImage={marker.afterPreview}
            beforeImage={marker.beforePreview}
            title={marker.label}
          />
        ) : (
          <div className="grid h-[160px] place-items-center rounded-[10px] border border-white/10 bg-white/5 text-[12px] text-[var(--text-muted)]">
            No imagery available
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">Severity</p>
            <p className="mt-1 text-[13px] font-black text-[var(--text-primary)]">{marker.severityScore}/100</p>
          </div>
          <div className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">Confidence</p>
            <p className="mt-1 text-[13px] font-black text-[var(--text-primary)]">{marker.confidenceScore}%</p>
          </div>
          <div className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">Coords</p>
            <p className="mt-1 text-[12px] font-black text-[var(--text-primary)]">{marker.lat.toFixed(4)}, {marker.lon.toFixed(4)}</p>
          </div>
        </div>

        {(marker.beforeDate ?? marker.afterDate) && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {marker.beforeDate && (
              <div className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">Before</p>
                <p className="mt-1 text-[12px] text-[var(--text-primary)]">{marker.beforeDate}</p>
              </div>
            )}
            {marker.afterDate && (
              <div className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">After</p>
                <p className="mt-1 text-[12px] text-[var(--text-primary)]">{marker.afterDate}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 rounded-[10px] border border-white/10 bg-white/5 px-3 py-3">
          <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">AI Summary</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{marker.summary}</p>
        </div>

        {marker.recommendedAction && (
          <div className="mt-2 rounded-[10px] border px-3 py-3" style={{ borderColor: `${decisionColor}30`, background: `${decisionColor}08` }}>
            <p className="text-[10px] font-black uppercase" style={{ color: decisionColor }}>Recommended action</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{marker.recommendedAction}</p>
          </div>
        )}

        <button
          className="mt-4 h-9 w-full rounded-[8px] border border-[#ef4444]/40 bg-[#ef4444]/10 text-[12px] font-black uppercase text-[#ef4444] transition hover:bg-[#ef4444]/20"
          type="button"
          onClick={onDelete}
        >
          Delete from folder
        </button>
      </div>
    </div>
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

const UKRAINE_CITIES: { name: string; lat: number; lon: number; minZoom: number; size: "xl" | "lg" | "md" | "sm" }[] = [
  // Major cities (zoom 5-6)
  { name: "Kyiv",           lat: 50.450, lon: 30.523, minZoom: 5,  size: "xl" },
  { name: "Kharkiv",        lat: 49.993, lon: 36.230, minZoom: 6,  size: "lg" },
  { name: "Odessa",         lat: 46.482, lon: 30.726, minZoom: 6,  size: "lg" },
  { name: "Dnipro",         lat: 48.464, lon: 35.046, minZoom: 6,  size: "lg" },
  { name: "Lviv",           lat: 49.839, lon: 24.029, minZoom: 6,  size: "lg" },
  { name: "Zaporizhzhia",   lat: 47.838, lon: 35.139, minZoom: 6,  size: "lg" },
  // Regional centers (zoom 7)
  { name: "Mykolaiv",       lat: 46.975, lon: 32.000, minZoom: 7,  size: "md" },
  { name: "Kherson",        lat: 46.636, lon: 32.616, minZoom: 7,  size: "md" },
  { name: "Poltava",        lat: 49.588, lon: 34.552, minZoom: 7,  size: "md" },
  { name: "Chernihiv",      lat: 51.499, lon: 31.290, minZoom: 7,  size: "md" },
  { name: "Sumy",           lat: 50.907, lon: 34.799, minZoom: 7,  size: "md" },
  { name: "Vinnytsia",      lat: 49.233, lon: 28.468, minZoom: 7,  size: "md" },
  { name: "Donetsk",        lat: 47.987, lon: 37.801, minZoom: 7,  size: "md" },
  { name: "Luhansk",        lat: 48.574, lon: 39.307, minZoom: 7,  size: "md" },
  { name: "Mariupol",       lat: 47.096, lon: 37.543, minZoom: 7,  size: "md" },
  { name: "Rivne",          lat: 50.619, lon: 26.251, minZoom: 7,  size: "md" },
  { name: "Lutsk",          lat: 50.747, lon: 25.325, minZoom: 7,  size: "md" },
  { name: "Ivano-Frankivsk",lat: 48.922, lon: 24.711, minZoom: 7,  size: "md" },
  { name: "Ternopil",       lat: 49.553, lon: 25.594, minZoom: 7,  size: "md" },
  { name: "Khmelnytskyi",   lat: 49.422, lon: 26.997, minZoom: 7,  size: "md" },
  { name: "Zhytomyr",       lat: 50.254, lon: 28.658, minZoom: 7,  size: "md" },
  { name: "Cherkasy",       lat: 49.444, lon: 32.059, minZoom: 7,  size: "md" },
  { name: "Kropyvnytskyi",  lat: 48.507, lon: 32.272, minZoom: 7,  size: "md" },
  { name: "Uzhhorod",       lat: 48.621, lon: 22.288, minZoom: 7,  size: "md" },
  { name: "Chernivtsi",     lat: 48.292, lon: 25.935, minZoom: 7,  size: "md" },
  // Frontline & strategic cities (zoom 8)
  { name: "Kramatorsk",     lat: 48.723, lon: 37.533, minZoom: 8,  size: "sm" },
  { name: "Bakhmut",        lat: 48.596, lon: 38.000, minZoom: 8,  size: "sm" },
  { name: "Izium",          lat: 49.208, lon: 37.278, minZoom: 8,  size: "sm" },
  { name: "Melitopol",      lat: 46.849, lon: 35.363, minZoom: 8,  size: "sm" },
  { name: "Sloviansk",      lat: 48.868, lon: 37.629, minZoom: 8,  size: "sm" },
  { name: "Berdiansk",      lat: 46.755, lon: 36.801, minZoom: 8,  size: "sm" },
  { name: "Severodonetsk",  lat: 48.948, lon: 38.488, minZoom: 8,  size: "sm" },
  { name: "Lysychansk",     lat: 48.895, lon: 38.436, minZoom: 8,  size: "sm" },
  { name: "Pokrovsk",       lat: 48.282, lon: 37.177, minZoom: 8,  size: "sm" },
  { name: "Avdiivka",       lat: 48.140, lon: 37.749, minZoom: 8,  size: "sm" },
  { name: "Toretsk",        lat: 48.401, lon: 37.851, minZoom: 8,  size: "sm" },
  { name: "Horlivka",       lat: 48.336, lon: 38.052, minZoom: 8,  size: "sm" },
  { name: "Makiivka",       lat: 48.044, lon: 37.951, minZoom: 8,  size: "sm" },
  { name: "Alchevsk",       lat: 48.473, lon: 38.799, minZoom: 8,  size: "sm" },
  { name: "Pervomaisk",     lat: 48.630, lon: 38.565, minZoom: 8,  size: "sm" },
  { name: "Starobilsk",     lat: 49.274, lon: 38.906, minZoom: 8,  size: "sm" },
  { name: "Kupiansk",       lat: 49.714, lon: 37.600, minZoom: 8,  size: "sm" },
  { name: "Balakliya",      lat: 49.463, lon: 36.849, minZoom: 8,  size: "sm" },
  { name: "Nova Kakhovka",  lat: 46.759, lon: 33.375, minZoom: 8,  size: "sm" },
  { name: "Kakhovka",       lat: 46.819, lon: 33.488, minZoom: 8,  size: "sm" },
  { name: "Enerhodar",      lat: 47.501, lon: 34.656, minZoom: 8,  size: "sm" },
  { name: "Vasylivka",      lat: 47.436, lon: 35.277, minZoom: 8,  size: "sm" },
  { name: "Tokmak",         lat: 47.244, lon: 35.706, minZoom: 8,  size: "sm" },
  { name: "Henichesk",      lat: 46.176, lon: 34.817, minZoom: 8,  size: "sm" },
  { name: "Skadovsk",       lat: 46.115, lon: 32.910, minZoom: 8,  size: "sm" },
  { name: "Oleshky",        lat: 46.631, lon: 32.988, minZoom: 8,  size: "sm" },
  { name: "Lyman",          lat: 48.988, lon: 37.812, minZoom: 8,  size: "sm" },
  { name: "Sviatohirsk",    lat: 49.054, lon: 37.554, minZoom: 8,  size: "sm" },
  { name: "Rubizhne",       lat: 49.019, lon: 38.381, minZoom: 8,  size: "sm" },
  // Kyiv suburbs (zoom 9)
  { name: "Bucha",          lat: 50.549, lon: 30.228, minZoom: 9,  size: "sm" },
  { name: "Irpin",          lat: 50.521, lon: 30.255, minZoom: 9,  size: "sm" },
  { name: "Hostomel",       lat: 50.573, lon: 30.261, minZoom: 9,  size: "sm" },
  { name: "Borodyanka",     lat: 50.647, lon: 29.938, minZoom: 9,  size: "sm" },
  { name: "Makariv",        lat: 50.464, lon: 29.823, minZoom: 9,  size: "sm" },
];

const CITY_SIZE_STYLE = {
  xl: { fontSize: "13px", fontWeight: 900, dotSize: 5 },
  lg: { fontSize: "11px", fontWeight: 700, dotSize: 4 },
  md: { fontSize: "10px", fontWeight: 600, dotSize: 3 },
  sm: { fontSize: "9px",  fontWeight: 500, dotSize: 2 },
};

function UkraineMapPanel({
  markers,
  notice,
  onClearMarkers,
  onDeleteMarker,
  onOpenAnalytics,
  onOpenCommander,
  onUpdateMarker,
}: {
  markers: MapMarker[];
  notice: string | null;
  onClearMarkers: () => void;
  onDeleteMarker: (id: string) => void;
  onOpenAnalytics: () => void;
  onOpenCommander: () => void;
  onUpdateMarker: (id: string, patch: Partial<Pick<MapMarker, "lat" | "lon">>) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenterPoint: { x: number; y: number };
  } | null>(null);
  const markerDragRef = useRef<{ pointerId: number; markerId: string } | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [mapCenter, setMapCenter] = useState({ lat: 48.7, lon: 31.2 });
  const [zoom, setZoom] = useState(6);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [detailMarker, setDetailMarker] = useState<MapMarker | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const counts = markers.reduce(
    (acc, marker) => {
      acc[marker.status] += 1;
      return acc;
    },
    { active: 0, destroyed: 0, partially_active: 0, unknown: 0 } satisfies Record<
      MarkerStatus,
      number
    >,
  );
  const reviewCount = counts.partially_active + counts.unknown;
  const tiles = useMemo(
    () => buildSatelliteTiles(mapCenter, zoom, mapSize),
    [mapCenter, mapSize, zoom],
  );

  const cityLabels = useMemo(() => {
    if (mapSize.width <= 0 || mapSize.height <= 0) return [];
    const centerPoint = latLonToWorldPoint(mapCenter.lat, mapCenter.lon, zoom);
    return UKRAINE_CITIES
      .filter((city) => zoom >= city.minZoom)
      .map((city) => {
        const pt = latLonToWorldPoint(city.lat, city.lon, zoom);
        return {
          ...city,
          x: pt.x - centerPoint.x + mapSize.width / 2,
          y: pt.y - centerPoint.y + mapSize.height / 2,
        };
      })
      .filter((city) => city.x > -40 && city.x < mapSize.width + 40 && city.y > -20 && city.y < mapSize.height + 20);
  }, [mapCenter, zoom, mapSize]);

  useEffect(() => {
    const node = mapRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setMapSize({ width: node.clientWidth, height: node.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedMarkerId && !markers.some((marker) => marker.id === selectedMarkerId)) {
      setSelectedMarkerId(null);
    }
  }, [markers, selectedMarkerId]);

  useEffect(() => {
    if (!detailMarker) {
      return;
    }

    const updatedMarker = markers.find((marker) => marker.id === detailMarker.id);
    setDetailMarker(updatedMarker ?? null);
  }, [detailMarker, markers]);

  function focusMarker(marker: MapMarker) {
    setSelectedMarkerId(marker.id);
    setMapCenter({ lat: marker.lat, lon: marker.lon });
    setZoom((current) => Math.max(current, 12));
  }

  function resetMap() {
    setSelectedMarkerId(null);
    setMapCenter({ lat: 48.7, lon: 31.2 });
    setZoom(6);
  }

  function changeZoom(delta: number) {
    setZoom((current) => clamp(Math.round(current + delta), 5, 18));
  }

  function deleteSelectedMarker(marker: MapMarker) {
    setSelectedMarkerId(null);
    setDetailMarker(null);
    onDeleteMarker(marker.id);
  }

  function handleMarkerPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    marker: MapMarker,
  ) {
    if (!event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    markerDragRef.current = { pointerId: event.pointerId, markerId: marker.id };
    dragRef.current = null;
    setSelectedMarkerId(marker.id);
    setIsDragging(true);
    mapRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startZoom = zoom;
    const startCenterPoint = latLonToWorldPoint(mapCenter.lat, mapCenter.lon, startZoom);
    const pointerId = event.pointerId;

    dragRef.current = { pointerId, startX, startY, startCenterPoint };
    setIsDragging(true);

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setMapCenter(
        worldPointToLatLon(
          { x: startCenterPoint.x - dx, y: startCenterPoint.y - dy },
          startZoom,
        ),
      );
    }

    function cleanup(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      dragRef.current = null;
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const markerDrag = markerDragRef.current;

    if (!markerDrag || markerDrag.pointerId !== event.pointerId) {
      return;
    }

    const point = screenEventToLatLon(event, mapCenter, zoom, mapSize);

    if (point) {
      onUpdateMarker(markerDrag.markerId, clampUkraineLocation(point));
    }
  }

  function endMarkerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const markerDrag = markerDragRef.current;

    if (!markerDrag || markerDrag.pointerId !== event.pointerId) {
      return;
    }

    markerDragRef.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-map-ui='true']")) {
      return;
    }

    event.preventDefault();

    const nextZoom = clamp(zoom + (event.deltaY < 0 ? 1 : -1), 5, 18);

    if (nextZoom === zoom || mapSize.width <= 0 || mapSize.height <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const cursor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const currentCenterPoint = latLonToWorldPoint(mapCenter.lat, mapCenter.lon, zoom);
    const cursorWorldPoint = {
      x: currentCenterPoint.x + cursor.x - mapSize.width / 2,
      y: currentCenterPoint.y + cursor.y - mapSize.height / 2,
    };
    const zoomScale = 2 ** (nextZoom - zoom);
    const nextCenterPoint = {
      x: cursorWorldPoint.x * zoomScale - cursor.x + mapSize.width / 2,
      y: cursorWorldPoint.y * zoomScale - cursor.y + mapSize.height / 2,
    };

    setZoom(nextZoom);
    setMapCenter(worldPointToLatLon(nextCenterPoint, nextZoom));
  }

  return (
    <div
      ref={mapRef}
      className={`relative h-dvh min-h-dvh touch-none select-none overflow-hidden bg-black ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerCancel={endMarkerDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endMarkerDrag}
      onWheel={handleWheel}
    >
      <div className="pointer-events-none absolute inset-0">
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="absolute h-[256px] w-[256px] select-none object-cover"
            draggable={false}
            key={`${tile.z}-${tile.x}-${tile.y}`}
            src={tile.url}
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.1),rgba(0,0,0,0.28))]" />

      <div className="pointer-events-none absolute inset-0">
        {cityLabels.map((city) => {
          const s = CITY_SIZE_STYLE[city.size];
          return (
            <div
              key={city.name}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[3px]"
              style={{ left: city.x, top: city.y }}
            >
              <div
                className="rounded-full bg-white/80"
                style={{ width: s.dotSize, height: s.dotSize }}
              />
              <span
                className="whitespace-nowrap tracking-wide text-white"
                style={{
                  fontSize: s.fontSize,
                  fontWeight: s.fontWeight,
                  textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
                  letterSpacing: "0.06em",
                }}
              >
                {city.name}
              </span>
            </div>
          );
        })}
      </div>

      {markers.map((marker) => {
        const point = projectMarkerToScreen(marker, mapCenter, zoom, mapSize);
        const meta = TARGET_STATUS_META[marker.status];

        if (!point) {
          return null;
        }

        return (
          <button
            aria-label={`${marker.label}: ${meta.label}`}
            className={`absolute z-10 grid h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white shadow-[0_0_0_8px_rgba(255,255,255,0.18),0_12px_30px_rgba(0,0,0,0.5)] transition hover:scale-110 ${
              selectedMarkerId === marker.id ? "scale-125" : ""
            }`}
            data-map-ui="true"
            key={marker.id}
            style={{ background: meta.color, left: point.x, top: point.y }}
            type="button"
            onClick={() => focusMarker(marker)}
            onPointerDown={(event) => handleMarkerPointerDown(event, marker)}
          >
            <span className="h-[10px] w-[10px] rounded-full bg-white" />
          </button>
        );
      })}

      <section
        className="absolute left-4 top-4 z-20 w-[min(440px,calc(100vw-32px))] rounded-[12px] border border-white/15 bg-[#121317]/97 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.42)]"
        data-map-ui="true"
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Satellite map
        </p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-black leading-tight tracking-tight text-[var(--text-primary)]">
              Attack & Damage Markers
            </h1>
            <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
              Click a marker to zoom to the attack or destruction location.
              Hold Shift and drag a marker to correct its position.
            </p>
          </div>
          <span className="rounded-[8px] border border-white/15 px-2 py-1 text-[12px] font-black text-[var(--text-primary)]">
            z{zoom}
          </span>
        </div>

        {notice && (
          <div className="mt-3 rounded-[8px] border border-white/10 bg-white/5 px-3 py-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            {notice}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="h-[38px] rounded-[8px] bg-[var(--button)] px-3 text-[12px] font-black uppercase text-[var(--button-text)] transition hover:bg-[var(--accent-hover)]"
            type="button"
            onClick={onOpenAnalytics}
          >
            New analysis
          </button>
          <a
            className="inline-flex h-[38px] items-center rounded-[8px] border border-[#3b82f6]/50 bg-[#3b82f6]/15 px-3 text-[12px] font-black uppercase text-[#3b82f6] transition hover:bg-[#3b82f6]/25"
            href="/satellite-generator"
          >
            Satellite Generator
          </a>

          <button
            className="h-[38px] rounded-[8px] border border-[#a855f7]/50 bg-[#a855f7]/15 px-3 text-[12px] font-black uppercase text-[#a855f7] transition hover:bg-[#a855f7]/25"
            type="button"
            onClick={onOpenCommander}
          >
            Commander
          </button>
          <button
            className="h-[38px] rounded-[8px] border border-white/15 px-3 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
            type="button"
            onClick={resetMap}
          >
            Reset
          </button>
        </div>
      </section>

      <div
        className="absolute right-4 top-[68px] z-20 grid overflow-hidden rounded-[10px] border border-white/15 bg-[#121317]/97 shadow-[0_18px_60px_rgba(0,0,0,0.42)]"
        data-map-ui="true"
      >
        <button
          aria-label="Zoom in"
          className="grid h-11 w-11 place-items-center border-b border-white/15 text-[22px] font-black text-[var(--text-primary)] transition hover:bg-white/10"
          type="button"
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className="grid h-11 w-11 place-items-center text-[22px] font-black text-[var(--text-primary)] transition hover:bg-white/10"
          type="button"
          onClick={() => changeZoom(-1)}
        >
          -
        </button>
      </div>

      <aside
        className="absolute bottom-4 right-4 z-20 hidden w-[320px] gap-3 md:grid"
        data-map-ui="true"
      >
        <div className="rounded-[12px] border border-white/15 bg-[#121317]/97 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Legend
          </p>
          <div className="mt-3 grid gap-2">
            <LegendRow color={TARGET_STATUS_META.destroyed.color} label="Red" value="Destroyed / neutralized" count={counts.destroyed} />
            <LegendRow color={TARGET_STATUS_META.partially_active.color} label="Yellow" value="Partially active / unconfirmed" count={reviewCount} />
            <LegendRow color={TARGET_STATUS_META.active.color} label="Green" value="Active / not neutralized" count={counts.active} />
          </div>
        </div>

        <div className="max-h-[320px] overflow-auto rounded-[12px] border border-white/15 bg-[#121317]/97 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Locations
            </p>
            <span className="text-[12px] font-black text-[var(--text-muted)]">
              {markers.length}
            </span>
          </div>

          <div className="mt-4 grid gap-2">
            {markers.length === 0 ? (
              <p className="rounded-[8px] border border-white/10 bg-white/5 px-3 py-3 text-[12px] leading-5 text-[var(--text-muted)]">
                No saved markers yet.
              </p>
            ) : (
              markers.map((marker) => {
                const meta = TARGET_STATUS_META[marker.status];

                return (
                  <button
                    className={`rounded-[8px] border px-3 py-3 text-left transition hover:bg-white/10 ${
                      selectedMarkerId === marker.id
                        ? "border-white/35 bg-white/10"
                        : "border-white/10 bg-white/5"
                    }`}
                    key={marker.id}
                    type="button"
                    onClick={() => focusMarker(marker)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-white/70"
                        style={{ background: meta.color }}
                      />
                      <p className="truncate text-[13px] font-black text-[var(--text-primary)]">
                        {({ destroyed: "Destroyed", partially_active: "Partially Active", active: "Active", unknown: "Unconfirmed" } as Record<string, string>)[marker.status] ?? marker.label}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] uppercase text-[var(--text-muted)]">
                      {meta.label} · severity {marker.severityScore}/100 · confidence{" "}
                      {marker.confidenceScore}%
                    </p>
                    <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[var(--text-secondary)]">
                      {marker.summary}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {selectedMarker && (
        <section
          className="absolute inset-x-4 bottom-4 z-20 cursor-pointer rounded-[12px] border border-white/15 bg-[#121317]/97 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.42)] transition hover:border-white/30 md:left-4 md:right-auto md:w-[430px]"
          data-map-ui="true"
          role="button"
          tabIndex={0}
          onClick={() => setDetailMarker(selectedMarker)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setDetailMarker(selectedMarker);
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Attack / destruction location
              </p>
              <h2 className="mt-1 truncate text-[22px] font-black text-[var(--text-primary)]">
                {selectedMarker.label}
              </h2>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="h-8 rounded-[8px] border border-[#ef4444]/60 px-2 text-[11px] font-black uppercase text-[#ef4444] transition hover:bg-[#ef4444]/15"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteSelectedMarker(selectedMarker);
                }}
              >
                Delete
              </button>
              <button
                className="h-8 rounded-[8px] border border-white/15 px-2 text-[11px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedMarkerId(null);
                }}
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MarkerMetric label="Status" marker={selectedMarker} value={TARGET_STATUS_META[selectedMarker.status].label} />
            <MarkerMetric label="Severity" marker={selectedMarker} value={`${selectedMarker.severityScore}/100`} />
            <MarkerMetric label="Confidence" marker={selectedMarker} value={`${selectedMarker.confidenceScore}%`} />
          </div>

          <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
            {selectedMarker.summary}
          </p>
          <p className="mt-3 text-[11px] uppercase text-[var(--text-muted)]">
            {selectedMarker.lat.toFixed(4)}, {selectedMarker.lon.toFixed(4)}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            Click for detailed info and command brief
          </p>
        </section>
      )}
      {detailMarker && (
        <MarkerDetailsDialog
          marker={detailMarker}
          onClose={() => setDetailMarker(null)}
          onDelete={() => deleteSelectedMarker(detailMarker)}
        />
      )}
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
  count,
}: {
  color: string;
  label: string;
  value: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full border border-white/70" style={{ background: color }} />
        <div className="min-w-0">
          <p className="text-[12px] font-black text-[var(--text-primary)]">{label}</p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">{value}</p>
        </div>
      </div>
      <span className="text-[13px] font-black text-[var(--text-primary)]">{count}</span>
    </div>
  );
}

function MarkerMetric({
  label,
  marker,
  value,
}: {
  label: string;
  marker: MapMarker;
  value: string;
}) {
  const meta = TARGET_STATUS_META[marker.status];

  return (
    <div className="min-w-0 rounded-[8px] border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{label}</p>
      <p
        className="mt-1 truncate text-[12px] font-black uppercase text-[var(--text-primary)]"
        style={label === "Status" ? { color: meta.color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function MarkerDetailsDialog({
  marker,
  onClose,
  onDelete,
}: {
  marker: MapMarker;
  onClose: () => void;
  onDelete: () => void;
}) {
  const meta = TARGET_STATUS_META[marker.status];
  const commandReadout = getCommandReadout(marker);

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-black/45 px-4 backdrop-blur-sm"
      data-map-ui="true"
      role="dialog"
      aria-modal="true"
      aria-label={`${marker.label} details`}
    >
      <div className="max-h-[calc(100dvh-120px)] w-full max-w-[680px] overflow-auto rounded-[14px] border border-white/15 bg-[#121317] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Command brief
            </p>
            <h2 className="mt-1 truncate text-[28px] font-black text-[var(--text-primary)]">
              {marker.label}
            </h2>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="h-9 rounded-[8px] bg-[var(--button)] px-3 text-[12px] font-black uppercase text-[var(--button-text)] transition hover:bg-[var(--accent-hover)]"
              type="button"
              onClick={() => exportMarkerBrief(marker)}
            >
              Export
            </button>
            <button
              className="h-9 rounded-[8px] border border-[#ef4444]/60 px-3 text-[12px] font-black uppercase text-[#ef4444] transition hover:bg-[#ef4444]/15"
              type="button"
              onClick={onDelete}
            >
              Delete
            </button>
            <button
              className="h-9 rounded-[8px] border border-white/15 px-3 text-[12px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MarkerMetric label="Status" marker={marker} value={meta.label} />
          <MarkerMetric label="Severity" marker={marker} value={`${marker.severityScore}/100`} />
          <MarkerMetric label="Confidence" marker={marker} value={`${marker.confidenceScore}%`} />
        </div>

        <div className="mt-4 rounded-[10px] border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            AI assessment
          </p>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            {marker.summary}
          </p>
        </div>

        <div className="mt-4 rounded-[10px] border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Command readout
          </p>
          <div className="mt-3 grid gap-2 text-[13px] leading-5">
            {commandReadout.map((item) => (
              <div className="grid gap-1 rounded-[8px] bg-black/15 px-3 py-2" key={item.label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {item.label}
                </p>
                <p className="text-[var(--text-primary)]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Coordinates
            </p>
            <p className="mt-2 text-[13px] font-black text-[var(--text-primary)]">
              {marker.lat.toFixed(6)}, {marker.lon.toFixed(6)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Original input: {marker.locationInput || "Not provided"}
            </p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              AI source context
            </p>
            <p className="mt-2 text-[13px] leading-5 text-[var(--text-primary)]">
              {marker.eventType || "Satellite change analysis"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Created: {formatMarkerDate(marker.createdAt)}
            </p>
          </div>
        </div>

        {marker.recommendedAction && (
          <div className="mt-4 rounded-[10px] border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              AI recommended command note
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              {marker.recommendedAction}
            </p>
          </div>
        )}

        <MarkerCaseViewer marker={marker} />
      </div>
    </div>
  );
}

function MarkerCaseViewer({ marker }: { marker: MapMarker }) {
  const meta = TARGET_STATUS_META[marker.status];

  return (
    <section className="mt-4 rounded-[10px] border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Case viewer
          </p>
          <h3 className="mt-1 truncate text-[22px] font-black text-[var(--text-primary)]">
            {marker.label}
          </h3>
        </div>
        <span
          className="shrink-0 rounded-[8px] border px-3 py-2 text-[11px] font-black uppercase"
          style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>

      {marker.beforePreview && marker.afterPreview ? (
        <BeforeAfterSlider
          afterImage={marker.afterPreview}
          beforeImage={marker.beforePreview}
          title={marker.label}
        />
      ) : (
        <div className="grid h-[260px] place-items-center rounded-[10px] border border-white/10 bg-black/20 px-4 text-center text-[12px] text-[var(--text-muted)]">
          No before / after imagery available
        </div>
      )}

      {(marker.beforeDate || marker.afterDate) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MarkerDateMeta label="Before" value={marker.beforeDate || "Not provided"} />
          <MarkerDateMeta label="After" value={marker.afterDate || "Not provided"} />
        </div>
      )}
    </section>
  );
}

function MarkerDateMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/15 px-3 py-2">
      <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[12px] text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function getCommandReadout(marker: MapMarker) {
  return [
    {
      label: "BDA result",
      value: getStatusReadout(marker.status),
    },
    {
      label: "Operational effect",
      value: getOperationalEffect(marker),
    },
    {
      label: "Command priority",
      value: getCommandPriority(marker),
    },
    {
      label: "Confidence note",
      value: getConfidenceReadout(marker.confidenceScore),
    },
  ];
}

function getStatusReadout(status: MarkerStatus) {
  if (status === "destroyed") {
    return "AI assesses the marked object as destroyed or neutralized.";
  }

  if (status === "partially_active") {
    return "AI assesses partial degradation; the object may retain limited function.";
  }

  if (status === "active") {
    return "AI assesses the object as still active or not neutralized.";
  }

  return "AI could not confirm final status from the available imagery.";
}

function getOperationalEffect(marker: MapMarker) {
  if (marker.status === "destroyed" || marker.severityScore >= 80) {
    return "Severe visible damage with likely major loss of function in the marked area.";
  }

  if (marker.status === "active" || marker.severityScore < 35) {
    return "Limited visible degradation; continued function cannot be ruled out.";
  }

  return "Visible degradation is present, but residual capability requires confirmation.";
}

function getCommandPriority(marker: MapMarker) {
  if (marker.confidenceScore < 55) {
    return "Priority: collect or review clearer imagery before relying on this assessment.";
  }

  if (marker.status === "active") {
    return "Priority: monitor as unresolved; AI indicates the object may remain functional.";
  }

  if (marker.status === "partially_active" || marker.status === "unknown") {
    return "Priority: verify status with follow-up imagery or collateral reporting.";
  }

  return "Priority: archive as confirmed damage unless newer intelligence contradicts it.";
}

function getConfidenceReadout(score: number) {
  if (score >= 80) {
    return "High confidence: imagery and AI indicators are consistent.";
  }

  if (score >= 55) {
    return "Medium confidence: assessment is usable but should be cross-checked.";
  }

  return "Low confidence: treat as preliminary until additional evidence is available.";
}

function exportMarkerBrief(marker: MapMarker) {
  const lines = [
    "COMMAND DAMAGE ASSESSMENT BRIEF",
    "================================",
    `Location: ${marker.label}`,
    `Coordinates: ${marker.lat.toFixed(6)}, ${marker.lon.toFixed(6)}`,
    `Event type: ${marker.eventType || "Satellite change analysis"}`,
    `Created: ${formatMarkerDate(marker.createdAt)}`,
    "",
    "AI ASSESSMENT",
    "-------------",
    `Status: ${TARGET_STATUS_META[marker.status].label}`,
    `Severity: ${marker.severityScore}/100`,
    `Confidence: ${marker.confidenceScore}%`,
    `Summary: ${marker.summary}`,
    "",
    "COMMAND READOUT",
    "---------------",
    ...getCommandReadout(marker).map((item) => `${item.label}: ${item.value}`),
    "",
    "AI COMMAND NOTE",
    "---------------",
    marker.recommendedAction || "No additional AI note provided.",
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `command-brief-${marker.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function TargetStatusBanner({
  status,
  recommendedAction,
}: {
  status: TargetStatus;
  recommendedAction: string;
}) {
  const meta = TARGET_STATUS_META[status];

  return (
    <div
      className="rounded-[12px] p-4"
      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
        Target Status
      </p>
      <p className="mt-1 text-[20px] font-black tracking-tight" style={{ color: meta.color }}>
        {meta.label}
      </p>
      <div className="mt-2 border-t pt-2" style={{ borderColor: meta.border }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Recommended Action
        </p>
        <p className="mt-1 text-[13px] leading-5 text-[var(--text-primary)]">
          {recommendedAction}
        </p>
      </div>
    </div>
  );
}

function ConfidenceScore({
  score,
  level,
}: {
  score: number;
  level: SatelliteAnalysisResult["damage_assessment"]["confidence"];
}) {
  const colors = {
    HIGH: "#22c55e",
    MEDIUM: "#eab308",
    LOW: "#ef4444",
  };
  const color = colors[level];

  return (
    <p className="mt-0.5 text-[24px] font-black leading-none" style={{ color }}>
      {score}
      <span className="text-[14px]">%</span>
    </p>
  );
}

function resolveUkraineLocation(input: string): ResolvedLocation | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const coordinateLocation = resolveCoordinateLocation(trimmed);

  if (coordinateLocation) {
    return coordinateLocation;
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/\bukraine\b/g, "")
    .replace(/[^a-zа-яіїєґ0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = Object.entries(KNOWN_UKRAINE_LOCATIONS)
    .sort(([a], [b]) => b.length - a.length)
    .find(([key]) => normalized.includes(key));

  return match?.[1] ?? null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Image preview could not be read."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Image preview could not be read."));
    reader.readAsDataURL(file);
  });
}

function resolveCoordinateLocation(input: string): ResolvedLocation | null {
  const numbers = input.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

  if (numbers.length < 2) {
    return null;
  }

  const [first, second] = numbers;
  const latLon = isInsideUkraineBounds(first, second)
    ? { lat: first, lon: second }
    : isInsideUkraineBounds(second, first)
      ? { lat: second, lon: first }
      : null;

  if (!latLon) {
    return null;
  }

  return {
    label: `${latLon.lat.toFixed(4)}, ${latLon.lon.toFixed(4)}`,
    ...latLon,
  };
}

function isInsideUkraineBounds(lat: number, lon: number) {
  return (
    lat >= UKRAINE_BOUNDS.minLat &&
    lat <= UKRAINE_BOUNDS.maxLat &&
    lon >= UKRAINE_BOUNDS.minLon &&
    lon <= UKRAINE_BOUNDS.maxLon
  );
}

const TILE_SIZE = 256;

type MapCenter = { lat: number; lon: number };
type MapSize = { width: number; height: number };

function buildSatelliteTiles(center: MapCenter, zoom: number, size: MapSize) {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const centerPoint = latLonToWorldPoint(center.lat, center.lon, zoom);
  const topLeft = {
    x: centerPoint.x - size.width / 2,
    y: centerPoint.y - size.height / 2,
  };
  const minTileX = Math.floor(topLeft.x / TILE_SIZE);
  const maxTileX = Math.floor((topLeft.x + size.width) / TILE_SIZE);
  const minTileY = Math.floor(topLeft.y / TILE_SIZE);
  const maxTileY = Math.floor((topLeft.y + size.height) / TILE_SIZE);
  const tileCount = 2 ** zoom;
  const tiles: Array<{ x: number; y: number; z: number; left: number; top: number; url: string }> = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileCount) {
        continue;
      }

      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push({
        x: wrappedX,
        y,
        z: zoom,
        left: x * TILE_SIZE - topLeft.x,
        top: y * TILE_SIZE - topLeft.y,
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${wrappedX}`,
      });
    }
  }

  return tiles;
}

function projectMarkerToScreen(
  marker: MapMarker,
  center: MapCenter,
  zoom: number,
  size: MapSize,
) {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const centerPoint = latLonToWorldPoint(center.lat, center.lon, zoom);
  const markerPoint = latLonToWorldPoint(marker.lat, marker.lon, zoom);

  return {
    x: markerPoint.x - centerPoint.x + size.width / 2,
    y: markerPoint.y - centerPoint.y + size.height / 2,
  };
}

function screenEventToLatLon(
  event: ReactPointerEvent<HTMLDivElement>,
  center: MapCenter,
  zoom: number,
  size: MapSize,
) {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const centerPoint = latLonToWorldPoint(center.lat, center.lon, zoom);
  const screenPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  return worldPointToLatLon(
    {
      x: centerPoint.x + screenPoint.x - size.width / 2,
      y: centerPoint.y + screenPoint.y - size.height / 2,
    },
    zoom,
  );
}

function latLonToWorldPoint(lat: number, lon: number, zoom: number) {
  const sinLat = Math.sin((clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function worldPointToLatLon(point: { x: number; y: number }, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lon = normalizeLongitude((point.x / scale) * 360 - 180);
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  const lat = clamp((Math.atan(Math.sinh(n)) * 180) / Math.PI, -85.05112878, 85.05112878);

  return { lat, lon };
}

function normalizeLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function clampUkraineLocation(location: MapCenter) {
  return {
    lat: clamp(location.lat, UKRAINE_BOUNDS.minLat, UKRAINE_BOUNDS.maxLat),
    lon: clamp(location.lon, UKRAINE_BOUNDS.minLon, UKRAINE_BOUNDS.maxLon),
  };
}

function formatMarkerDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isValidMarker(value: unknown): value is MapMarker {
  if (!value || typeof value !== "object") {
    return false;
  }

  const marker = value as Partial<MapMarker>;

  return (
    typeof marker.id === "string" &&
    typeof marker.label === "string" &&
    typeof marker.lat === "number" &&
    typeof marker.lon === "number" &&
    typeof marker.confidenceScore === "number" &&
    typeof marker.severityScore === "number" &&
    typeof marker.summary === "string" &&
    typeof marker.createdAt === "string" &&
    marker.status !== undefined &&
    marker.status in TARGET_STATUS_META
  );
}

function isValidCommanderReview(value: unknown): value is CommanderReview {
  if (!value || typeof value !== "object") {
    return false;
  }

  const review = value as Partial<CommanderReview>;

  return (
    typeof review.id === "string" &&
    typeof review.decidedAt === "string" &&
    (review.decision === "validated" || review.decision === "hold") &&
    isValidMarker(review.marker)
  );
}
