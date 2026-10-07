import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
} from "react";
import { Dialog } from "../../components/Dialog";
import { ALL_ICON_NAMES, Icon } from "../../components/Icon";
import catalog from "../../icons/catalog.json";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.launchers";
import { contentBox } from "../../lib/launchers";

/** Icon button 40×40; rows are 48 px apart, columns spread over the width. */
const CELL = 40;
const GAP = 8;
const PITCH = CELL + GAP;
/** Padding of .ln-icon-scroll: room for the focus rings of edge cells. */
const PAD = 4;
/** Rows kept mounted above and below the visible ones. */
const OVERSCAN = 3;
const SEARCH_DEBOUNCE_MS = 100;

type IconSet = Record<string, string>;

let iconSet: Promise<IconSet> | null = null;

/** The launcher icons (src/icons/catalog.json): the same lazy chunk the Icon component uses, loaded once per window. */
function loadIconSet(): Promise<IconSet> {
  iconSet ??= import("../../icons/generated/all-icons.json").then(
    (m) => (m.default ?? m) as IconSet,
    (err: unknown) => {
      iconSet = null; // the next picker may try again
      throw err;
    },
  );
  return iconSet;
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

/** Russian search words of every icon (src/icons/catalog.json), «ё» read as «е». */
const WORDS = new Map<string, string>(
  (catalog as { name: string; ru: string }[]).map((c) => [c.name, c.ru.replace(/ё/g, "е")]),
);

const RU_KEYS = "йцукенгшщзхъфывапролджэячсмитьбюё";
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";

/** Text typed with the Russian layout on («кщслуе») becomes what the same keys type in English («rocket»). */
function fromRussianLayout(s: string): string {
  if (!/[а-яё]/.test(s)) return s;
  let out = "";
  for (const ch of s) {
    const i = RU_KEYS.indexOf(ch);
    out += i >= 0 ? EN_KEYS[i] : ch;
  }
  return out;
}

/** "Arrow up", "arrow-up" or «фккщц гз» → "arrow_up", the form of the icon names. */
function normalizeQuery(text: string): string {
  return fromRussianLayout(text.trim().toLowerCase())
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** The typed text as Russian words: lower case, «ё» as «е», single spaces. */
function russianQuery(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/**
 * Icons matching the typed text, best first: the exact English name, a Russian word starting with the text
 * («поч» finds «почта»), names starting with it, names with a word starting with it, names or Russian words
 * containing it, then (several words) names containing every word in any order. `q` is the text as an icon
 * name (normalizeQuery), `ru` the text as Russian words (russianQuery); either may be empty. Within a group
 * the catalog order stays, so related icons stay together.
 */
function searchIcons(q: string, ru: string): string[] {
  const words = q.split("_").filter(Boolean);
  const wordStart = `_${q}`;
  const groups: string[][] = [[], [], [], [], [], []];
  for (const n of ALL_ICON_NAMES) {
    const said = WORDS.get(n) ?? "";
    if (q && n === q) groups[0].push(n);
    else if (ru && ` ${said}`.includes(` ${ru}`)) groups[1].push(n);
    else if (q && n.startsWith(q)) groups[2].push(n);
    else if (q && n.includes(wordStart)) groups[3].push(n);
    else if ((q && n.includes(q)) || (ru && said.includes(ru))) groups[4].push(n);
    else if (words.length > 1 && words.every((w) => n.includes(w))) groups[5].push(n);
  }
  return groups.flat();
}

/** Results for typed text, or null when the text holds nothing to search for. */
function resultsFor(text: string): string[] | null {
  const q = normalizeQuery(text);
  const ru = russianQuery(text);
  return q || ru ? searchIcons(q, ru) : null;
}

// ---------------------------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------------------------

const colsFor = (w: number) => Math.max(1, Math.floor((w + GAP) / PITCH));
/** First row (at least partly) in view for a scroll offset. */
const rowAt = (scrollTop: number) => Math.floor(Math.max(0, scrollTop - PAD) / PITCH);

/** Index of the option an event came from, or -1. */
function optionIndex(target: EventTarget | null): number {
  const el = target instanceof Element ? target.closest<HTMLElement>("[data-index]") : null;
  return el ? Number(el.dataset.index) : -1;
}

interface CellProps {
  name: string;
  index: number;
  count: number;
  x: number;
  y: number;
  markup: string;
  selected: boolean;
  tabbable: boolean;
}

/** One option, absolutely positioned and memoised: scrolling only mounts and unmounts cells. */
const IconCell = memo(function IconCell({ name, index, count, x, y, markup, selected, tabbable }: CellProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={name}
      aria-posinset={index + 1}
      aria-setsize={count}
      data-index={index}
      tabIndex={tabbable ? 0 : -1}
      className={selected ? "icon-btn selected ln-pick" : "icon-btn subtle ln-pick"}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <span className="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
    </button>
  );
});

interface Props {
  /** The launcher's current icon: highlighted and scrolled into view. Constant for the dialog's life. */
  value: string;
  /** Picked icon and its regular 20 px markup (for the launcher's icon cache) once the set is loaded. */
  onSelect: (name: string, svg?: string) => void;
  onClose: () => void;
}

/**
 * «Смотреть все»: the launcher icons (100, src/icons/catalog.json) in a scrollable modal window with search.
 * - Windowing: only the rows in view (plus a few) are mounted, every cell absolutely positioned and memoised,
 *   so scrolling mounts and unmounts a row at a time. The markup comes straight from the set's chunk, with
 *   no per-icon loading. The focused cell stays mounted while scrolled away, so the keyboard keeps working.
 * - Search: 100 ms debounce, Russian words from the catalog («почта», «код», «музыка») and English names,
 *   ranked (exact name, Russian word start, prefix, word, substring, all words in any order); English typed
 *   with the Russian layout on is read as the same keys in English too. Enter picks the first match.
 * - Keyboard: the kit Dialog focuses the search field; Down or Tab enters the grid (one tab stop); arrows,
 *   PageUp/PageDown, Home/End move; Up from the first row returns to the search, a typed letter continues
 *   it; Enter or Space picks; Esc closes only this dialog (kit Dialog stack).
 */
export function IconPickerDialog({ value, onSelect, onClose }: Props) {
  const [set, setSet] = useState<IconSet | null>(null);
  const [query, setQuery] = useState("");
  /** The text the list follows: the query after the debounce. */
  const [term, setTerm] = useState("");
  const [box, setBox] = useState({ w: 588, h: 352 });
  const [row, setRow] = useState(0);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [gridFocus, setGridFocus] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Set by keyboard moves: focus the target cell as soon as it is mounted. */
  const wantFocus = useRef(false);

  useEffect(() => {
    let alive = true;
    loadIconSet().then(
      (s) => {
        if (alive) setSet(s);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setTerm(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const found = useMemo(() => resultsFor(term), [term]);
  const names: readonly string[] = found ?? ALL_ICON_NAMES;
  /** A search is on: the list starts at the top and the header counts the matches. */
  const searching = found !== null;

  // Geometry follows the scroll area's content box (the scrollbar gutter is reserved, so it does not jump).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (w: number, h: number) => setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    const initial = contentBox(el);
    measure(initial.w, initial.h);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new result list starts at the top; the full set starts at the chosen icon, centred, so the
  // highlighted (and tabbable) cell is in view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let top = 0;
    const i = searching ? -1 : ALL_ICON_NAMES.indexOf(value);
    if (i >= 0) {
      const r = Math.floor(i / colsFor(contentBox(el).w));
      top = Math.max(0, PAD + r * PITCH - Math.floor((el.clientHeight - CELL) / 2));
    }
    el.scrollTop = top;
    setRow(rowAt(el.scrollTop));
    setFocusIdx(null);
    wantFocus.current = false;
  }, [found, searching, value]);

  const cols = colsFor(box.w);
  const colStep = cols > 1 ? (box.w - CELL) / (cols - 1) : 0;
  const totalRows = Math.ceil(names.length / cols);
  const pageRows = Math.max(1, Math.floor(box.h / PITCH));

  const firstRow = Math.max(0, Math.min(row, totalRows) - OVERSCAN);
  const lastRow = Math.min(totalRows, row + pageRows + 1 + OVERSCAN);
  const first = firstRow * cols;
  const last = Math.min(names.length, lastRow * cols);

  const selectedIdx = useMemo(() => names.indexOf(value), [names, value]);
  const activeIdx = focusIdx !== null && focusIdx < names.length ? focusIdx : Math.max(0, selectedIdx);
  // The focused cell stays mounted while scrolled out of the window, so focus is never dropped.
  const keep = gridFocus && focusIdx !== null && focusIdx < names.length ? focusIdx : -1;
  const indices: number[] = [];
  if (keep >= 0 && keep < first) indices.push(keep);
  for (let i = first; i < last; i++) indices.push(i);
  if (keep >= last) indices.push(keep);
  // One tab stop, always on a mounted cell (Tab from the search must land in the grid).
  const tabIdx = activeIdx === keep || (activeIdx >= first && activeIdx < last) ? activeIdx : first;

  // A keyboard move may target a cell that this render has just mounted.
  useLayoutEffect(() => {
    if (!wantFocus.current || focusIdx === null) return;
    const btn = scrollRef.current?.querySelector<HTMLButtonElement>(`[data-index="${focusIdx}"]`);
    if (!btn) return;
    wantFocus.current = false;
    btn.focus({ preventScroll: true });
  }, [focusIdx, first, last]);

  const pick = (name: string) => onSelect(name, set?.[`${name}_20_regular`]);

  const focusSearch = () => rootRef.current?.querySelector<HTMLInputElement>("input")?.focus();

  /** Focus option `idx` (clamped), scrolling just enough to show it with its focus ring. */
  const moveFocus = (idx: number) => {
    const el = scrollRef.current;
    if (!el || !names.length) return;
    const i = Math.max(0, Math.min(names.length - 1, idx));
    const top = PAD + Math.floor(i / cols) * PITCH;
    if (top - PAD < el.scrollTop) el.scrollTop = top - PAD;
    else if (top + CELL + PAD > el.scrollTop + el.clientHeight) el.scrollTop = top + CELL + PAD - el.clientHeight;
    setRow(rowAt(el.scrollTop));
    setFocusIdx(i);
    wantFocus.current = true;
  };

  const onScroll = (e: UIEvent<HTMLDivElement>) => setRow(rowAt(e.currentTarget.scrollTop));

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = optionIndex(e.target);
    if (cur < 0) return;
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      focusSearch(); // the typed character lands in the search field
      return;
    }
    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = cur + 1;
        break;
      case "ArrowLeft":
        next = cur - 1;
        break;
      case "ArrowDown":
        next = cur + cols;
        break;
      case "ArrowUp":
        if (cur < cols) {
          e.preventDefault();
          focusSearch();
          return;
        }
        next = cur - cols;
        break;
      case "PageDown":
        next = cur + pageRows * cols;
        break;
      case "PageUp":
        next = cur - pageRows * cols;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = names.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    moveFocus(next);
  };

  const onGridFocus = (e: FocusEvent<HTMLDivElement>) => {
    const i = optionIndex(e.target);
    if (i < 0) return;
    setFocusIdx(i);
    setGridFocus(true);
  };
  const onGridBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGridFocus(false);
  };

  const onGridClick = (e: MouseEvent<HTMLDivElement>) => {
    const i = optionIndex(e.target);
    if (i >= 0 && i < names.length) pick(names[i]);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // The current text, not the debounced list: a quick Enter after typing still picks the right icon.
      const list = resultsFor(query) ?? [];
      if (list.length) {
        e.preventDefault();
        pick(list[0]);
      }
    } else if (e.key === "ArrowDown" && names.length) {
      e.preventDefault();
      moveFocus(activeIdx);
    }
  };

  return (
    <Dialog open title={ru.settings.launchers.pickIcon} onClose={onClose} width="640px">
      <div ref={rootRef} className="ln-picker">
        <TextField
          value={query}
          onChange={setQuery}
          placeholder={ru.settings.launchers.searchIcons}
          suffix={<Icon name="search" size={16} />}
          onKeyDown={onSearchKey}
        />
        {/* One message per state, announced politely: all icons, the result count, or nothing found. */}
        <div className="ln-picker-head caption" aria-live="polite">
          {!searching ? extra.allIconsCount(ALL_ICON_NAMES.length) : names.length ? extra.iconsFound(names.length) : ru.common.nothingFound}
        </div>
        <div
          ref={scrollRef}
          className="ln-icon-scroll"
          onScroll={onScroll}
          onKeyDown={onGridKey}
          onFocus={onGridFocus}
          onBlur={onGridBlur}
        >
          {names.length > 0 ? (
            <div
              className="ln-icon-canvas"
              role="listbox"
              aria-label={ru.settings.launchers.allIcons}
              style={{ height: totalRows * PITCH - GAP }}
              onClick={onGridClick}
            >
              {indices.map((i) => {
                const n = names[i];
                const selected = n === value;
                const markup = set ? ((selected ? set[`${n}_20_filled`] : undefined) ?? set[`${n}_20_regular`] ?? "") : "";
                return (
                  <IconCell
                    key={n}
                    name={n}
                    index={i}
                    count={names.length}
                    x={Math.round((i % cols) * colStep)}
                    y={Math.floor(i / cols) * PITCH}
                    markup={markup}
                    selected={selected}
                    tabbable={i === tabIdx}
                  />
                );
              })}
            </div>
          ) : (
            <p className="ln-picker-empty hint">{extra.searchEmptyHint}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
