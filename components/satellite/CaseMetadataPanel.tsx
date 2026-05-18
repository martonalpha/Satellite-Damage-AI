"use client";

import { useEffect, useRef, useState } from "react";

import {
  analyzeAndSaveGeneratedCase,
  createGeneratedCaseHeatmapPreview,
} from "@/components/satellite/analysisActions";
import type { GeneratedSatelliteCase } from "@/lib/satellite/types";

type AnalyzeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done" }
  | { status: "error"; message: string };

type HeatmapState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; cropUrl: string; heatmapUrl: string }
  | { status: "error"; message: string };

export function CaseMetadataPanel({
  item,
  hasNextCase = false,
  onNextCase,
}: {
  item: GeneratedSatelliteCase;
  hasNextCase?: boolean;
  onNextCase?: () => void;
}) {
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>({ status: "idle" });
  const [heatmapState, setHeatmapState] = useState<HeatmapState>({ status: "idle" });
  const [heatmapReveal, setHeatmapReveal] = useState(65);
  const heatmapUrlRef = useRef<{ cropUrl: string; heatmapUrl: string } | null>(null);

  useEffect(() => {
    setAnalyzeState({ status: "idle" });
    revokeHeatmapPreview();
    setHeatmapState({ status: "idle" });
  }, [item.id]);

  useEffect(() => {
    return () => {
      revokeHeatmapPreview();
    };
  }, []);

  function revokeHeatmapPreview() {
    if (heatmapUrlRef.current) {
      URL.revokeObjectURL(heatmapUrlRef.current.cropUrl);
      URL.revokeObjectURL(heatmapUrlRef.current.heatmapUrl);
      heatmapUrlRef.current = null;
    }
  }

  async function analyzeAndSave() {
    setAnalyzeState({ status: "loading" });

    try {
      await analyzeAndSaveGeneratedCase(item);
      setAnalyzeState({ status: "done" });
    } catch (error) {
      setAnalyzeState({
        status: "error",
        message: error instanceof Error ? error.message : "Analysis failed.",
      });
    }
  }

  async function previewHeatmap() {
    revokeHeatmapPreview();
    setHeatmapState({ status: "loading" });

    try {
      const preview = await createGeneratedCaseHeatmapPreview(item);
      heatmapUrlRef.current = preview;
      setHeatmapState({ status: "done", ...preview });
    } catch (error) {
      setHeatmapState({
        status: "error",
        message: error instanceof Error ? error.message : "Heatmap preview failed.",
      });
    }
  }

  return (
    <div className="grid gap-3 rounded-[12px] border border-white/15 bg-[#191b20] p-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Source attribution
        </p>
        <p className="mt-1 text-[13px] text-[var(--text-primary)]">{item.sourceDataset}</p>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">{item.satelliteSource}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Meta label="Lat / Lon" value={`${item.lat.toFixed(6)}, ${item.lon.toFixed(6)}`} />
        <Meta label="BBOX size" value={`${item.bboxSizeMeters ?? 0}m`} />
        <Meta label="BBOX" value={item.bbox.map((value) => value.toFixed(5)).join(", ")} />
        <Meta label="Before" value={item.beforeDate} />
        <Meta label="After" value={item.afterDate} />
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Confidence note
        </p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
          {item.confidenceNote}
        </p>
      </div>

      <div className="rounded-[9px] border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              AI change heatmap
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              Red/yellow marks stronger change inside the target crop.
            </p>
          </div>
          <button
            className="shrink-0 rounded-[8px] border border-white/15 px-3 py-2 text-[11px] font-black uppercase text-[var(--text-primary)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={heatmapState.status === "loading"}
            type="button"
            onClick={() => void previewHeatmap()}
          >
            {heatmapState.status === "loading" ? "Building..." : "Preview"}
          </button>
        </div>
        {heatmapState.status === "done" && (
          <div className="mt-3 grid gap-2">
            <div className="relative aspect-square overflow-hidden rounded-[8px] border border-white/10 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`${item.title} target crop`}
                className="absolute inset-0 h-full w-full object-cover"
                src={heatmapState.cropUrl}
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - heatmapReveal}% 0 0)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`${item.title} target change heatmap`}
                  className="h-full w-full object-cover"
                  src={heatmapState.heatmapUrl}
                />
              </div>
              <div
                className="absolute bottom-0 top-0 w-[2px] bg-white"
                style={{ left: `${heatmapReveal}%` }}
              />
              <div className="absolute left-2 top-2 rounded-[6px] bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-white">
                Image
              </div>
              <div className="absolute right-2 top-2 rounded-[6px] bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-white">
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
        )}
        {heatmapState.status === "error" && (
          <p className="mt-2 text-[11px] text-red-400">{heatmapState.message}</p>
        )}
      </div>

      <div className="border-t border-white/10 pt-3">
        {analyzeState.status === "done" ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-black uppercase text-[#22c55e]">
              Saved to map
            </p>
            <a
              className="block w-full rounded-[9px] border border-[#22c55e]/30 bg-[#22c55e]/10 py-2.5 text-center text-[12px] font-black uppercase text-[#22c55e] transition hover:bg-[#22c55e]/20"
              href="/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Open map
            </a>
            {hasNextCase && (
              <button
                className="w-full rounded-[9px] bg-white py-2.5 text-center text-[12px] font-black uppercase text-black transition hover:bg-white/85"
                type="button"
                onClick={onNextCase}
              >
                Next case
              </button>
            )}
            <button
              className="text-[11px] text-[var(--text-muted)] underline underline-offset-2"
              type="button"
              onClick={() => setAnalyzeState({ status: "idle" })}
            >
              Analyze again
            </button>
          </div>
        ) : (
          <button
            className="h-11 w-full rounded-[9px] text-[13px] font-black uppercase transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={analyzeState.status === "loading"}
            style={
              analyzeState.status === "loading"
                ? { background: "rgba(255,255,255,0.07)", color: "var(--text-muted)" }
                : { background: "#3b82f6", color: "#fff" }
            }
            type="button"
            onClick={() => void analyzeAndSave()}
          >
            {analyzeState.status === "loading" ? "Analyzing..." : "Analyze & Save to Map"}
          </button>
        )}

        {analyzeState.status === "error" && (
          <p className="mt-2 text-[11px] text-red-400">{analyzeState.message}</p>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] font-black uppercase text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[12px] text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
