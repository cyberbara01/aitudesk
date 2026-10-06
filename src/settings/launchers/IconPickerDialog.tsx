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
import { LAUNCHER_ICONS } from "../../lib/launchers";

/** Icon button 40×40 with an 8 px gap → 48 px pitch. */
const CELL = 40;
const GAP = 8;
const PITCH = CELL + GAP;
/** Rows rendered above and below the visible part of the list. */
const OVERSCAN = 2;
const SEARCH_DEBOUNCE_MS = 100;

interface Props {
  /** Currently chosen icon name (highlighted). */
  value: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}

/** "arrow up" / "arrow-up" → "arrow_up", like the file names. */
const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Content-box size (clientWidth/Height minus padding), matching ResizeObserver's contentRect. */
function contentSize(el: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  return {
    w: el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
    h: el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom),
  };
}

/**
 * Modal icon picker over the full Fluent 20 px set: search with a 100 ms debounce, a two-row strip of
 * popular icons with "Смотреть все", and a row-windowed grid (only the visible rows are mounted) so the
 * whole set scrolls smoothly. Arrow keys move inside the grid, Enter in the search picks the first match.
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
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced query.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(normalizeQuery(query)), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  // The Dialog focuses its first button on open; move focus to the search field right after.
  useEffect(() => {
    const raf = requestAnimationFrame(() => searchRef.current?.querySelector("input")?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Columns and viewport height follow the scroll area.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (w: number, h: number) => {
      setCols(Math.max(1, Math.floor((w + GAP) / PITCH)));
      setViewport((v) => (v.height === h ? v : { ...v, height: h }));
    };
    const initial = contentSize(el);
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

  // A new list starts at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setViewport((v) => (v.top === 0 ? v : { ...v, top: 0 }));
    setFocusIdx(null);
  }, [mode, q]);

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

  // Roving focus: one tabbable icon; arrows move it and keep its row in view.
  const activeIdx = focusIdx ?? Math.max(0, names.indexOf(value));
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

  let headLabel: string;
  let headAction: ReactNode = null;
  if (mode === "search") {
    headLabel = names.length ? extra.iconsFound(names.length) : ru.common.nothingFound;
  } else if (mode === "all") {
    headLabel = extra.allIconsCount(ALL_ICON_NAMES.length);
    headAction = (
      <Button size="sm" variant="subtle" onClick={() => setExpanded(false)}>
        {ru.common.collapse}
      </Button>
    );
  } else {
    headLabel = extra.popular;
    headAction = (
      <Button size="sm" variant="subtle" onClick={() => setExpanded(true)}>
        {ru.common.showAll}
      </Button>
    );
  }

  const status = hovered ?? extra.selectedIcon(value);

  return (
    <Dialog open title={ru.settings.launchers.pickIcon} onClose={onClose} width="640px">
      <div className="ln-picker">
        <div ref={searchRef}>
          <TextField
            value={query}
            onChange={setQuery}
            placeholder={ru.settings.launchers.searchIcons}
            suffix={<Icon name="search" size={16} />}
            onKeyDown={onSearchKey}
          />
        </div>
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
                const i = firstRow * cols + k;
                const selected = n === value;
                return (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={n}
                    data-index={i}
                    tabIndex={i === activeIdx ? 0 : -1}
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
        <div className="ln-picker-status" aria-live="polite">
          {status}
        </div>
      </div>
    </Dialog>
  );
}
