// Round «выполнено» toggle shared by the «Заметки» tile and its settings list: an empty ring (a check shows
// through on hover), a filled check when done. Coloured notes draw it in their colour, others in the accent.
import type { CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { extra } from "../../i18n/ru.extra.notes";

interface NoteCheckProps {
  done: boolean;
  /** Note colour (#RRGGBB) or undefined for the neutral ring and the accent check. */
  color?: string;
  onToggle: () => void;
  className?: string;
}

export function NoteCheck({ done, color, onToggle, className }: NoteCheckProps) {
  const cls = ["note-check", done ? "done" : "", color ? "colored" : "", className ?? ""].filter(Boolean).join(" ");
  const style = color ? ({ "--note-color": color } as CSSProperties) : undefined;
  return (
    <button
      type="button"
      className={cls}
      style={style}
      aria-label={done ? extra.tile.markUndone : extra.tile.markDone}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {done ? (
        <Icon name="checkmark_circle" variant="filled" />
      ) : (
        <>
          <Icon name="circle" className="note-check-ring" />
          <Icon name="checkmark_circle" className="note-check-hint" />
        </>
      )}
    </button>
  );
}
