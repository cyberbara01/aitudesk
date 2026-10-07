// One empty-state pattern for tiles and settings pages: a short bold title, an optional quiet hint and an
// optional small button. Tiles pass `compact` (tighter spacing; the hint gives way first on short tiles).
import type { ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  hint?: ReactNode;
  action?: { label: string; icon?: string; onClick: () => void };
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, hint, action, compact, className }: EmptyStateProps) {
  const cls = ["empty-state", compact ? "compact" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="empty-state-title">{title}</span>
      {hint && <span className="empty-state-hint">{hint}</span>}
      {action && (
        <Button size="sm" icon={action.icon ?? "add"} onClick={action.onClick} className="empty-state-action">
          {action.label}
        </Button>
      )}
    </div>
  );
}
