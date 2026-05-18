"use client";

import { useState } from "react";

export function BeforeAfterSlider({
  afterImage,
  beforeImage,
  title,
}: {
  beforeImage: string;
  afterImage: string;
  title: string;
}) {
  const [value, setValue] = useState(50);

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square overflow-hidden rounded-[10px] border border-white/15 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`${title} before`} className="absolute inset-0 h-full w-full object-cover" src={beforeImage} />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 0 0 ${value}%)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`${title} after`} className="h-full w-full object-cover" src={afterImage} />
        </div>
        <div className="absolute left-3 top-3 rounded-[6px] bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-white">
          Before
        </div>
        <div className="absolute right-3 top-3 rounded-[6px] bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-white">
          After
        </div>
        <div className="absolute bottom-0 top-0 w-[2px] bg-white" style={{ left: `${value}%` }} />
      </div>
      <input
        aria-label="Before after comparison"
        className="w-full accent-white"
        max={100}
        min={0}
        type="range"
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
      />
    </div>
  );
}
