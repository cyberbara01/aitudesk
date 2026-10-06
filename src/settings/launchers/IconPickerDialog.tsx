import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { ALL_ICON_NAMES, Icon } from "../../components/Icon";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.launchers";
import { LAUNCHER_ICONS, contentBox } from "../../lib/launchers";

/** Icon button 40×40 with an 8 px gap → 48 px pitch. */
const CELL = 40;
const GAP = 8;
const PITCH = CELL + GAP;
/** Rows rendered above and below the visible part of the list. */
const OVERSCAN = 2;
const SEARCH_DEBOUNCE_MS = 100;

interface Props {
  /** Currently chosen icon name (highlighted). Constant for the dialog's life: selecting closes it. */
  value: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}

/** "arrow up" / "arrow-up" → "arrow_up", like the file names. */
const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/[\s-]+/g, "_");

const colsFor = (w: number) => Math.max(1, Math.floor((w + GAP) / PITCH));

/**
 * Modal icon picker over the full Fluent 20 px set: search with a 100 ms debounce, a two-row strip of
 * popular icons with "Смотреть все", and a row-windowed grid (only the visible rows are mounted) so the
 * whole set scrolls smoothly. Arrow keys move inside the grid, Enter in the search picks the first match.
 * The kit Dialog focuses the search field (first form field) and handles Esc for the top-most dialog.
 */
export function IconPickerDialog({ value, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cols, setCols] = useState(12);
  const [viewport, setViewport] = useState({ top: 0, height: 376 });
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounced query.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(normalizeQuery(query)), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  // Columns and viewport height follow the scroll area.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (w: number, h: number) => {
      setCols(colsFor(w));
      setViewport((v) => (v.height === h ? v : { ...v, height: h }));
    };
    const initial = contentBox(el);
    measure(initial.w, initial.h);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const results = useMemo(() => {
    if (!q) return null;
    const starts: string[] = [];
    const contains: string[] = [];
    for (const n of ALL_ICON_NAMES) {
      if (n.startsWith(q)) starts.push(n);
      else if (n.includes(q)) contains.push(n);
    }
    return starts.concat(contains);
  }, [q]);

  const mode = results ? "search" : expanded ? "all" : "popular";
  const names: readonly string[] = results ?? (expanded ? ALL_ICON_NAMES : LAUNCHER_ICONS.slice(0, cols * 2));

  // A new list starts at the top — except «Смотреть все», which starts at the selected icon so the
  // highlighted (and tabbable) cell is on screen instead of somewhere below the fold.
  useEffect(() => {
    const el = scrollRef.current;
    let top = 0;
    if (mode === "all" && el) {
      const i = ALL_ICON_NAMES.indexOf(value);
      if (i >= 0) {
        const { w, h } = contentBox(el);
        top = Math.max(0, Math.floor(i / colsFor(w)) * PITCH - Math.floor((h - CELL) / 2));
      }
    }
    if (el) {
      el.scrollTop = top;
      top = el.scrollTop; // what the browser accepted (clamped to the canvas)
    }
    setViewport((v) => (v.top === top ? v : { ...v, top }));
    setFocusIdx(null);
  }, [mode, q, value]);

  // Row windowing.
  const totalRows = Math.ceil(names.length / cols);
  const firstRow = Math.max(0, Math.floor(viewport.top / PITCH) - OVERSCAN);
  const lastRow = Math.min(totalRows, Math.ceil((viewport.top + viewport.height) / PITCH) + OVERSCAN);
  const slice = names.slice(firstRow * cols, lastRow * cols);
  const canvasHeight = totalRows > 0 ? totalRows * PITCH - GAP : 0;

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    setViewport((v) => (v.top === top ? v : { ...v, top }));
  };

  // Roving focus: one tabbable icon; arrows move it and keep its row in view. The tabbable cell must be a
  // mounted one, otherwise Tab from the search field would skip the grid: when the active icon is outside
  // the rendered window, the first rendered cell takes the tab stop.
  const activeIdx = focusIdx ?? Math.max(0, names.indexOf(value));
  const firstShown = firstRow * cols;
  const lastShown = lastRow * cols;
  const tabIdx = activeIdx >= firstShown && activeIdx < lastShown ? activeIdx : firstShown;
  const moveFocus = (next: number) => {
    if (!names.length) return;
    const idx = Math.max(0, Math.min(names.length - 1, next));
    setFocusIdx(idx);
    const el = scrollRef.current;
    if (!el) return;
    const top = Math.floor(idx / cols) * PITCH;
    const bottom = top + CELL;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  };
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const raw = (e.target as HTMLElement).dataset.index;
    if (raw === undefined) return;
    const i = Number(raw);
    const targets: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + cols,
      ArrowUp: i - cols,
      Home: 0,
      End: names.length - 1,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    moveFocus(next);
  };
  // The target button may have been mounted by this very render: focus it now.
  useLayoutEffect(() => {
    if (focusIdx === null) return;
    scrollRef.current?.querySelector<HTMLButtonElement>(`[data-index="${focusIdx}"]`)?.focus({ preventScroll: true });
  }, [focusIdx, firstRow, lastRow]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && names.length) {
      e.preventDefault();
      onSelect(names[0]);
    } else if (e.key === "ArrowDown" && names.length) {
      e.preventDefault();
      moveFocus(activeIdx);
    }
  };

  // Head: one message per state. «Смотреть все» lives in the CTA under the popular rows (single entry point);
  // the head only offers «Свернуть» once the full set is shown.
  let headLabel: string;
  let headAction: ReactNode = null;
  if (mode === "search") {
    headLabel = extra.iconsFound(names.length);
  } else if (mode === "all") {
    headLabel = extra.allIconsCount(ALL_ICON_NAMES.length);
    headAction = (
      <Button size="sm" variant="subtle" onClick={() => setExpanded(false)}>
        {ru.common.collapse}
      </Button>
    );
  } else {
    headLabel = extra.popular;
  }

  return (
    <Dialog open title={ru.settings.launchers.pickIcon} onClose={onClose} width="640px">
      <div className="ln-picker">
        <TextField
          value={query}
          onChange={setQuery}
          placeholder={ru.settings.launchers.searchIcons}
          suffix={<Icon name="search" size={16} />}
          onKeyDown={onSearchKey}
        />
        <div className="ln-picker-head">
          <span className="caption">{headLabel}</span>
          {headAction}
        </div>
        <div ref={scrollRef} className="ln-icon-scroll" onScroll={onScroll} onKeyDown={onGridKey}>
          <div className="ln-icon-canvas" style={{ height: canvasHeight, paddingTop: firstRow * PITCH }}>
            <div
              className="ln-icon-grid"
              role="listbox"
              aria-label={ru.settings.launchers.allIcons}
              style={{ "--ln-pick-cols": cols } as CSSProperties}
            >
              {slice.map((n, k) => {
                const i = firstShown + k;
                const selected = n === value;
                return (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={n}
                    data-index={i}
                    tabIndex={i === tabIdx ? 0 : -1}
                    className={selected ? "icon-btn selected" : "icon-btn subtle"}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setFocusIdx(i)}
                    onClick={() => onSelect(n)}
                  >
                    <Icon name={n} variant={selected ? "filled" : "regular"} />
                  </button>
                );
              })}
            </div>
          </div>
          {mode === "popular" && (
            <div className="ln-picker-cta">
              <Icon name="apps" size={24} />
              <span className="caption">{extra.moreIcons(ALL_ICON_NAMES.length - names.length)}</span>
              <Button onClick={() => setExpanded(true)}>{ru.common.showAll}</Button>
            </div>
          )}
          {mode === "search" && names.length === 0 && (
            <div className="ln-picker-cta">
              <Icon name="search" size={24} />
              <span className="body-strong">{ru.common.nothingFound}</span>
              <span className="caption">{extra.searchEmptyHint}</span>
            </div>
          )}
        </div>
        {/* Status: the label in the text face, only the icon name in mono. */}
        <div className="ln-picker-status" aria-live="polite">
          {hovered ? (
            <span className="mono">{hovered}</span>
          ) : (
            <>
              <span>{extra.selectedIcon}</span> <span className="mono">{value}</span>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
