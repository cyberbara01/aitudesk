import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Icon, hasIcon } from "../../components/Icon";
import { extra } from "../../i18n/ru.extra.launchers";
import { LAUNCHER_ICONS, contentBox, isIconMarkup } from "../../lib/launchers";

/** Icon button 36×36 (the size of a launcher square) with an 8 px gap. */
const SIZE = 36;
const GAP = 8;
const ROWS = 2;

const colsFor = (w: number) => Math.max(1, Math.floor((w + GAP) / (SIZE + GAP)));

interface Props {
  /** Chosen icon name. */
  value: string;
  /** Regular markup of the chosen icon, when known: draws it without the full icon set. */
  valueSvg?: string;
  onPick: (name: string) => void;
}

/**
 * Two rows of popular icons for the launcher editor (brief 3.3: «сначала 2 ряда популярных»); the full set
 * opens from «Смотреть все» next to it. A radio group: one tab stop, arrows move and pick, the preview
 * follows. An icon chosen from the full set that is not among the shown ones takes the first cell and keeps
 * it while the user moves through the strip, so cells never shift under the pointer or the keyboard.
 */
export function PopularIcons({ value, valueSvg, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(12);
  const [pinned, setPinned] = useState<{ name: string; svg?: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (w: number) => setCols(colsFor(w));
    measure(contentBox(el).w);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = Math.min(LAUNCHER_ICONS.length, cols * ROWS);
  const popular = LAUNCHER_ICONS.slice(0, count);
  const isPopular = popular.includes(value);
  // Derived state (React's "adjust state while rendering"): remember the chosen non-popular icon. A name
  // that is not in the set (a hand-edited settings file) is not pinned: it would be an empty cell.
  if (!isPopular && hasIcon(value) && (pinned?.name !== value || (valueSvg !== undefined && pinned?.svg !== valueSvg))) {
    setPinned({ name: value, svg: valueSvg });
  }
  const extraCell = pinned && !popular.includes(pinned.name) ? pinned : null;
  const names = extraCell ? [extraCell.name, ...popular.slice(0, count - 1)] : popular;
  const tabbable = names.includes(value) ? value : names[0];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const raw = (e.target as HTMLElement).dataset.index;
    if (raw === undefined) return;
    const i = Number(raw);
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + cols,
      ArrowUp: i - cols,
      Home: 0,
      End: names.length - 1,
    };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    if (next < 0 || next >= names.length || next === i) return;
    onPick(names[next]);
    ref.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      className="ln-strip"
      role="radiogroup"
      aria-label={extra.popular}
      style={{ "--ln-strip-cols": cols } as CSSProperties}
      onKeyDown={onKey}
    >
      {names.map((n, i) => {
        const selected = n === value;
        const svg = extraCell && n === extraCell.name && extraCell.svg && isIconMarkup(extraCell.svg) ? extraCell.svg : undefined;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={n}
            data-index={i}
            tabIndex={n === tabbable ? 0 : -1}
            className={selected ? "icon-btn selected" : "icon-btn subtle"}
            onClick={() => {
              if (!selected) onPick(n);
            }}
          >
            {svg ? (
              <span className="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <Icon name={n} variant={selected ? "filled" : "regular"} />
            )}
          </button>
        );
      })}
    </div>
  );
}
