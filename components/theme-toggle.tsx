"use client";

import { useAppTheme } from "@/components/app-theme-provider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useAppTheme();
  const isLight = resolvedTheme === "light";
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";

  return (
    <button
      aria-label={label}
      className={`theme-checkbox ${className}`}
      data-checked={isLight ? "true" : "false"}
      data-theme-toggle="true"
      title={label}
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
    >
      <span className="theme-checkbox__thumb" aria-hidden="true" />
    </button>
  );
}
