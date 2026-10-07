import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";

interface IconRowProps {
  /** Fluent icon in a tinted square before the text (the tiles list); omit for a plain row. */
  icon?: string;
  label: string;
  hint?: string;
  /** Shown instead of the hint, in the critical colour, and announced when it appears. */
  error?: string;
  children?: ReactNode;
}

/**
 * A settings row with the kit layout (base.css `.row`): text on the left, control on the right. Adds what the
 * kit `Row` lacks: a leading icon in a tinted square (like macOS System Settings) and an error state.
 */
export function IconRow({ icon, label, hint, error, children }: IconRowProps) {
  return (
    <div className="row">
      {icon && (
        <span className="row-icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
      )}
      <div className="row-text">
        <span className="row-label">{label}</span>
        {error ? (
          <span className="row-hint error" role="alert">
            {error}
          </span>
        ) : (
          hint && <span className="row-hint">{hint}</span>
        )}
      </div>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}
