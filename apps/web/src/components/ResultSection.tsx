import type { ReactNode } from "react";

interface ResultSectionProps {
  children: ReactNode;
  count?: number;
  eyebrow?: string;
  title: string;
}

export function ResultSection({ children, count, eyebrow, title }: ResultSectionProps) {
  return (
    <section className="panel space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow ? <p className="mono text-xs uppercase tracking-[0.3em] text-slate-500">{eyebrow}</p> : null}
          <h2 className="mt-2 text-xl font-semibold text-slate-50">{title}</h2>
        </div>
        {typeof count === "number" ? <span className="metric-pill">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

