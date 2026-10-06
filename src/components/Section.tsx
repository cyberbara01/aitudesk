import type { ReactNode } from "react";

interface SectionProps {
  title?: string;
  description?: string;
  /** Rows (default) or free content with padding. */
  padded?: boolean;
  children: ReactNode;
  className?: string;
}

/** Settings group card: optional heading, then rows or padded content. */
export function Section({ title, description, padded, children, className }: SectionProps) {
  return (
    <section className={["section", className ?? ""].filter(Boolean).join(" ")}>
      {(title || description) && (
        <div className="section-head">
          {title && <div className="section-title">{title}</div>}
          {description && <div className="section-desc">{description}</div>}
        </div>
      )}
      <div className={padded ? "section-body padded" : "section-body"}>{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  hint?: string;
  /** Put the control under the text instead of on the right. */
  stack?: boolean;
  children?: ReactNode;
}

/** One settings row: label + hint on the left, control on the right. */
export function Row({ label, hint, stack, children }: RowProps) {
  return (
    <div className={stack ? "row stack" : "row"}>
      <div className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </div>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}

interface PageProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function Page({ title, description, children }: PageProps) {
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc" style={{ margin: 0 }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}
