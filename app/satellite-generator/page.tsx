"use client";

import { useEffect, useState } from "react";

import { BeforeAfterSlider } from "@/components/satellite/BeforeAfterSlider";
import { CaseCard } from "@/components/satellite/CaseCard";
import { CaseMetadataPanel } from "@/components/satellite/CaseMetadataPanel";
import { GeneratorForm } from "@/components/satellite/GeneratorForm";
import { analyzeAndSaveGeneratedCase } from "@/components/satellite/analysisActions";
import type { GeneratedSatelliteCase, SatelliteGenerateResult } from "@/lib/satellite/types";

type BatchAnalyzeState =
  | { status: "idle" }
  | { status: "loading"; completed: number; total: number; currentTitle: string }
  | { status: "done"; saved: number; failed: number }
  | { status: "error"; message: string };

export default function SatelliteGeneratorPage() {
  const [cases, setCases] = useState<GeneratedSatelliteCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batchAnalyzeState, setBatchAnalyzeState] = useState<BatchAnalyzeState>({
    status: "idle",
  });
  const selected = cases.find((item) => item.id === selectedId) ?? cases[0] ?? null;

  useEffect(() => {
    void loadCases();
  }, []);

  async function loadCases() {
    const response = await fetch("/api/satellite/cases");
    const payload = (await response.json()) as { cases: GeneratedSatelliteCase[] };
    setCases(payload.cases);
    setSelectedId((current) => current ?? payload.cases[0]?.id ?? null);
  }

  function handleGenerated(result: SatelliteGenerateResult) {
    setCases(result.cases);
    setSelectedId(result.cases[0]?.id ?? null);
    setBatchAnalyzeState({ status: "idle" });
  }

  function deleteCase(caseId: string) {
    setCases((current) => {
      const deleteIndex = current.findIndex((item) => item.id === caseId);
      const nextCases = current.filter((item) => item.id !== caseId);

      setSelectedId((selectedCurrent) => {
        if (selectedCurrent !== caseId) {
          return selectedCurrent;
        }

        return nextCases[Math.min(deleteIndex, nextCases.length - 1)]?.id ?? null;
      });

      return nextCases;
    });
    setBatchAnalyzeState({ status: "idle" });
  }

  const selectedIndex = selected
    ? cases.findIndex((caseItem) => caseItem.id === selected.id)
    : -1;
  const hasNextCase = selectedIndex >= 0 && selectedIndex < cases.length - 1;

  function selectNextCase() {
    if (hasNextCase) {
      setSelectedId(cases[selectedIndex + 1].id);
    }
  }

  async function analyzeAllAndSave() {
    if (cases.length === 0 || batchAnalyzeState.status === "loading") {
      return;
    }

    let saved = 0;
    let failed = 0;

    for (const [index, item] of cases.entries()) {
      setSelectedId(item.id);
      setBatchAnalyzeState({
        status: "loading",
        completed: index,
        total: cases.length,
        currentTitle: item.title,
      });

      try {
        await analyzeAndSaveGeneratedCase(item);
        saved += 1;
      } catch {
        failed += 1;
      }
    }

    setBatchAnalyzeState({ status: "done", saved, failed });
  }

  return (
    <main className="min-h-dvh bg-[#080a0d] px-4 py-4 font-mono text-[var(--text-primary)] sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[380px_1fr] xl:gap-5">

        {/* Sidebar */}
        <aside className="grid content-start gap-3 sm:gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Humanitarian satellite context
              </p>
              <h1 className="mt-0.5 text-[20px] font-black tracking-tight sm:text-[28px]">
                Before/After Pair Generator
              </h1>
            </div>
            <a
              className="shrink-0 rounded-[8px] border border-white/15 px-3 py-2 text-[11px] font-black uppercase text-[var(--text-muted)] transition hover:bg-white/10 xl:hidden"
              href="/"
            >
              ← Map
            </a>
          </div>

          <GeneratorForm onGenerated={handleGenerated} />

          <div className="rounded-[12px] border border-white/15 bg-[#191b20] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Generated cases
              </p>
              <span className="text-[12px] font-black text-[var(--text-muted)]">
                {cases.length}
              </span>
            </div>
            {cases.length > 0 && (
              <div className="mt-3 rounded-[9px] border border-white/10 bg-white/5 p-3">
                <button
                  className="h-10 w-full rounded-[8px] bg-[#22c55e] text-[12px] font-black uppercase text-black transition hover:bg-[#22c55e]/90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={batchAnalyzeState.status === "loading"}
                  type="button"
                  onClick={() => void analyzeAllAndSave()}
                >
                  {batchAnalyzeState.status === "loading"
                    ? `Analyzing ${batchAnalyzeState.completed + 1}/${batchAnalyzeState.total}`
                    : `Analyze all ${cases.length} & save to map`}
                </button>
                {batchAnalyzeState.status === "loading" && (
                  <p className="mt-2 truncate text-[11px] text-[var(--text-secondary)]">
                    {batchAnalyzeState.currentTitle}
                  </p>
                )}
                {batchAnalyzeState.status === "done" && (
                  <p className="mt-2 text-[11px] text-[#22c55e]">
                    Saved {batchAnalyzeState.saved}/{batchAnalyzeState.saved + batchAnalyzeState.failed}
                    {batchAnalyzeState.failed > 0 ? `, failed ${batchAnalyzeState.failed}` : ""}.
                  </p>
                )}
                {batchAnalyzeState.status === "error" && (
                  <p className="mt-2 text-[11px] text-red-400">{batchAnalyzeState.message}</p>
                )}
              </div>
            )}
            <div className="mt-3 grid max-h-[260px] gap-2 overflow-auto pr-1 sm:max-h-[460px]">
              {cases.length === 0 ? (
                <p className="rounded-[9px] border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-[var(--text-muted)]">
                  No generated cases yet.
                </p>
              ) : (
                cases.map((item) => (
                  <CaseCard
                    active={selected?.id === item.id}
                    item={item}
                    key={item.id}
                    onDelete={() => deleteCase(item.id)}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Viewer */}
        <section className="min-w-0">
          {selected ? (
            <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
              <div className="rounded-[12px] border border-white/15 bg-[#191b20] p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:mb-4 sm:gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      Case viewer
                    </p>
                    <h2 className="mt-1 text-[18px] font-black sm:text-[24px]">{selected.title}</h2>
                  </div>
                  <span className="rounded-[8px] bg-[#eab308]/15 px-3 py-2 text-[11px] font-black uppercase text-[#eab308]">
                    {selected.label}
                  </span>
                </div>
                <BeforeAfterSlider
                  afterImage={selected.afterImage}
                  beforeImage={selected.beforeImage}
                  title={selected.title}
                />
              </div>
              <CaseMetadataPanel
                hasNextCase={hasNextCase}
                item={selected}
                onNextCase={selectNextCase}
              />
            </div>
          ) : (
            <div className="grid min-h-[200px] place-items-center rounded-[12px] border border-white/15 bg-[#191b20] p-6 text-center text-[12px] text-[var(--text-muted)] sm:min-h-[520px]">
              Generate cases to inspect before/after context images.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
