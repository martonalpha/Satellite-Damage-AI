"use client";

import type { GeneratedSatelliteCase } from "@/lib/satellite/types";

export function CaseCard({
  active,
  item,
  onDelete,
  onSelect,
}: {
  active: boolean;
  item: GeneratedSatelliteCase;
  onDelete: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={`cursor-pointer rounded-[10px] border p-3 text-left transition hover:bg-white/10 ${
        active ? "border-white/35 bg-white/10" : "border-white/10 bg-white/5"
      }`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <div className="mb-3 grid grid-cols-2 overflow-hidden rounded-[8px] border border-white/10 bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${item.title} before thumbnail`}
          className="aspect-[4/3] h-full w-full object-cover"
          src={item.beforeImage}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${item.title} after thumbnail`}
          className="aspect-[4/3] h-full w-full object-cover"
          src={item.afterImage}
        />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black text-[var(--text-primary)]">
            {item.title}
          </p>
          <p className="mt-1 text-[11px] uppercase text-[var(--text-muted)]">
            {item.location}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-[7px] bg-[#eab308]/15 px-2 py-1 text-[10px] font-black uppercase text-[#eab308]">
            {item.label}
          </span>
          <button
            aria-label={`Delete ${item.title}`}
            className="rounded-[7px] border border-[#ef4444]/50 bg-[#ef4444]/10 px-2 py-1 text-[10px] font-black uppercase text-[#ef4444] transition hover:bg-[#ef4444]/20"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        {item.beforeDate} to {item.afterDate}
      </p>
    </div>
  );
}
