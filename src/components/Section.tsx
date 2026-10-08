import { createContext, useContext, type ReactNode } from "react";
import { Icon } from "./Icon";

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

/** The page a page lives in (a widget's settings inside «Виджеты»): its name and the way back. */
export interface PageParent {
  label: string;
  go: () => void;
}

/** Provided by the settings shell around a page that lives inside another one; null elsewhere. */
export const PageParentContext = createContext<PageParent | null>(null);

/** A page: its title (under the parent page's name, a link back, when it lives inside one) and description. */
export function Page({ title, description, children }: PageProps) {
  const parent = useContext(PageParentContext);
  return (
    <div className="page">
      <div className="page-head">
        {parent && (
          <button type="button" className="page-parent" onClick={parent.go}>
            <Icon name="chevron_right" size={16} className="page-parent-back" />
            <span>{parent.label}</span>
          </button>
        )}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc" style={{ margin: 0 }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}
