import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";

interface IconRowProps {
  icon: string;
  label: string;
  hint?: string;
  /** Tinted square (accent, default) or neutral grey square. */
  tone?: "accent" | "neutral";
  children?: ReactNode;
}

/** Settings row with a leading icon in a tinted square (like macOS System Settings), text and a control. */
export function IconRow({ icon, label, hint, tone = "accent", children }: IconRowProps) {
  return (
    <div className="row">
      <span className={tone === "neutral" ? "row-icon neutral" : "row-icon"} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </div>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}
