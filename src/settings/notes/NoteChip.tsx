// Countdown chip shared by the «Заметки» tile and the editor preview. Only the numbers use --font-num
// (JetBrains Mono in Rice): the words and units stay in the text font, so a monospace space never makes
// «через 5 ч 13 мин» look double-spaced.
import type { DueTone } from "../../lib/notes";

/** "через 12:34" → ["через ", "12:34"]: odd indexes are numbers (digits with an optional ":ss"). */
const NUMBER = /(\d+(?::\d+)?)/;

export function NoteChip({ text, tone }: { text: string; tone: DueTone }) {
  return (
    <span className={`note-chip ${tone}`}>
      {/* One inline run: as separate flex items the words would lose their edge spaces. */}
      <span>
        {text.split(NUMBER).map((part, i) =>
          i % 2 === 1 ? (
            <span key={i} className="note-chip-num">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </span>
    </span>
  );
}
