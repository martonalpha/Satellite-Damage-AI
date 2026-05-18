"use client";

import { useState } from "react";

import type { SatelliteGenerateRequest, SatelliteGenerateResult } from "@/lib/satellite/types";

const GEOJSON_URL = "/data/zenodo/ukraine-damage/unosat_labels.geojson";
const IMPORT_URL = "/api/zenodo/ukraine-damage/import?file=unosat_labels";

const DAMAGE_LEVELS = [
  {
    value: "4",
    label: "Destroyed",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.4)",
    classes: ["Destroyed", "destroyed"],
    beforeDate: "2021-06-01",
    afterDate: "2023-06-01",
  },
  {
    value: "3",
    label: "Severely Damaged",
    color: "#f97316",
    bg: "rgba(249,115,22,0.12)",
    border: "rgba(249,115,22,0.4)",
    classes: ["Severely Damaged", "severely damaged", "severely_damaged"],
    beforeDate: "2021-06-01",
    afterDate: "2023-06-01",
  },
  {
    value: "2",
    label: "Moderate Damage",
    color: "#eab308",
    bg: "rgba(234,179,8,0.12)",
    border: "rgba(234,179,8,0.4)",
    classes: ["Moderate Damage", "moderate damage"],
    beforeDate: "2021-06-01",
    afterDate: "2023-06-01",
  },
  {
    value: "1",
    label: "Possible Damage",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.4)",
    classes: ["Possible Damage", "possible damage"],
    beforeDate: "2021-06-01",
    afterDate: "2023-06-01",
  },
] as const;

export function GeneratorForm({
  onGenerated,
}: {
  onGenerated: (result: SatelliteGenerateResult) => void;
}) {
  const [damageLevel, setDamageLevel] = useState<string>("4");
  const [count, setCount] = useState(3);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const selected = DAMAGE_LEVELS.find((d) => d.value === damageLevel) ?? DAMAGE_LEVELS[0];

  async function ensureDataset() {
    setImporting(true);
    setStatus("Downloading UNOSAT dataset...");
    try {
      const response = await fetch(IMPORT_URL);
      const payload = (await response.json()) as { featureCount?: number } | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Import failed.");
      setStatus(`Dataset ready — ${payload.featureCount ?? 0} buildings.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
      throw error;
    } finally {
      setImporting(false);
    }
  }

  async function generate() {
    setLoading(true);
    setStatus("Fetching Maxar/Esri imagery...");

    try {
      const body: SatelliteGenerateRequest = {
        geojsonUrl: GEOJSON_URL,
        limit: count,
        bboxSizeMeters: 1000,
        beforeDate: selected.beforeDate,
        selection: {
          strategy: "diverse",
        },
        filter: { damageClasses: [...selected.classes] },
        imagery: {
          collection: "SENTINEL2_L2A",
          maxCloudCoverage: 0.1,
          dateWindowDays: 60,
          fallbackDateWindowDays: 90,
        },
      };

      const response = await fetch("/api/satellite/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as SatelliteGenerateResult | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Generation failed.");
      }

      onGenerated(payload);
      setStatus(`Done — ${payload.generated} pairs generated${payload.failed > 0 ? `, ${payload.failed} failed` : ""}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Generation failed.";
      if (msg.includes("No GeoJSON features") || msg.includes("ENOENT")) {
        setStatus("Dataset not found — downloading first...");
        try {
          await ensureDataset();
          setStatus("Dataset ready. Click Generate again.");
        } catch {}
      } else {
        setStatus(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-white/15 bg-[#191b20] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
        UNOSAT Damage Filter
      </p>
      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
        18,686 Ukrainian buildings — select damage level to fetch Sentinel-2 before/after pairs.
      </p>

      <div className="mt-4 grid gap-2">
        {DAMAGE_LEVELS.map((level) => (
          <button
            key={level.value}
            className="flex items-center gap-3 rounded-[9px] border px-4 py-3 text-left transition hover:brightness-110"
            style={
              damageLevel === level.value
                ? { background: level.bg, borderColor: level.border }
                : { background: "transparent", borderColor: "rgba(255,255,255,0.1)" }
            }
            type="button"
            onClick={() => setDamageLevel(level.value)}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: level.color }}
            />
            <span
              className="text-[13px] font-black uppercase"
              style={{ color: damageLevel === level.value ? level.color : "var(--text-primary)" }}
            >
              {level.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span className="font-black uppercase">Pairs</span>
          <input
            className="w-16 rounded-[7px] border border-white/15 bg-white/5 px-2 py-1.5 text-center text-[12px] text-[var(--text-primary)] outline-none focus:border-white/35"
            max={50}
            min={1}
            type="number"
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value))))}
          />
        </label>
      </div>

      <button
        className="mt-4 h-11 w-full rounded-[9px] text-[13px] font-black uppercase transition disabled:cursor-not-allowed disabled:opacity-50"
        disabled={loading || importing}
        style={
          loading || importing
            ? { background: "rgba(255,255,255,0.07)", color: "var(--text-muted)" }
            : { background: selected.color, color: "#000" }
        }
        type="button"
        onClick={() => void generate()}
      >
        {loading ? "Fetching imagery..." : importing ? "Downloading dataset..." : `Generate ${count} ${selected.label} pair${count !== 1 ? "s" : ""}`}
      </button>

      {status && (
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">{status}</p>
      )}
    </div>
  );
}
