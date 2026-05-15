import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold uppercase text-[var(--text-muted)]">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-[var(--text-primary)] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
