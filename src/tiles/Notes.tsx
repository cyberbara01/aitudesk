// «Заметки»: notes by the nearest deadline (overdue first, the most overdue on top), then notes without one
// (newest first), done ones last and dimmed when «Показывать выполненные» is on. Each row: a round «выполнено»
// toggle, the text (two lines at most) and a countdown chip; on a tall tile the absolute deadline sits next to
// the chip. One scheduler drives every countdown (see useDeadlineClock): per second only while a deadline is
// within the hour, otherwise on the minute, and no timer at all without deadlines.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuItemSpec } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { MaskedText, PrivacyScope, RevealButton } from "../components/Masked";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.notes";
import {
  NEW_NOTE,
  activeDeadlines,
  countdown,
  displayText,
  formatDeadline,
  openNotesSettings,
  orderNotes,
  removeNote,
  toggleNote,
  useDeadlineClock,
  type DueTone,
} from "../lib/notes";
import type { Note } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { NoteCheck } from "../settings/notes/NoteCheck";
import { NoteChip } from "../settings/notes/NoteChip";

/** Scroll slack (px) below which the list counts as fully shown and the edge fades go away. */
const FADE_THRESHOLD = 1;

const addNote = () => void openNotesSettings(NEW_NOTE);

interface NoteRowProps {
  note: Note;
  /** Countdown text and tone; null for notes without a deadline and for done notes. */
  chip: string | null;
  tone: DueTone | null;
  /** Absolute deadline («завтра, 09:00»), shown by CSS only when the tile is tall. */
  when: string | null;
}

/** One note. Memoised on plain strings, so a per-second tick re-renders only the row whose chip changed. */
const NoteRow = memo(function NoteRow({ note, chip, tone, when }: NoteRowProps) {
  const text = useMemo(() => displayText(note.text), [note.text]);
  return (
    <div className={note.done ? "note-row reveal-row done" : "note-row reveal-row"} data-note={note.id} role="listitem">
      <NoteCheck done={note.done} color={note.color} onToggle={() => void toggleNote(note.id)} />
      <div className="note-body">
        <MaskedText id={note.id} text={text} className="note-text" />
        {chip && (
          <div className="note-meta">
            <NoteChip text={chip} tone={tone ?? "later"} />
            {when && <span className="note-when caption">{when}</span>}
          </div>
        )}
      </div>
      <RevealButton id={note.id} />
    </div>
  );
});

export function NotesTile() {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const { notes, showDone, privacy, background } = s.notes;

  const ordered = useMemo(() => orderNotes(notes), [notes]);
  const visible = useMemo(() => (showDone ? ordered : ordered.filter((it) => !it.note.done)), [ordered, showDone]);
  const deadlines = useMemo(() => activeDeadlines(visible), [visible]);
  const now = useDeadlineClock(deadlines, true);
  const nowDate = useMemo(() => new Date(now), [now]);

  // Scroll fades: only while there really is more content in that direction.
  const listRef = useRef<HTMLDivElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const updateFades = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setFadeTop(el.scrollTop > FADE_THRESHOLD);
    setFadeBottom(el.scrollHeight - el.scrollTop - el.clientHeight > FADE_THRESHOLD);
  }, []);

  // When the notes do not fit, the list ends on a clean edge instead of slicing a row: its height is clamped
  // to the lowest cut that fits the tile, either the end of a row or the end of a row's text (never inside a
  // chip, whose outline would otherwise show as a stray line under the fade). The rest stays empty below.
  const layoutList = useCallback(() => {
    const el = listRef.current;
    const tile = el?.parentElement;
    if (!el || !tile) return;
    const ts = getComputedStyle(tile);
    const ls = getComputedStyle(el);
    const avail =
      tile.clientHeight - parseFloat(ts.paddingTop) - parseFloat(ts.paddingBottom) - parseFloat(ls.marginTop) - parseFloat(ls.marginBottom);
    let cut = 0;
    for (const row of Array.from(el.children) as HTMLElement[]) {
      const text = row.querySelector<HTMLElement>(".note-text");
      const ends = [text ? text.offsetTop + text.offsetHeight : 0, row.offsetTop + row.offsetHeight];
      for (const end of ends) if (end <= avail + 0.5 && end > cut) cut = end;
      if (row.offsetTop >= avail) break;
    }
    el.style.maxHeight = el.scrollHeight > avail + 0.5 && cut > 0 ? `${cut}px` : "";
    updateFades();
  }, [updateFades]);

  // The tile (window size) and the rows (text and chips reflowing) are observed; the list itself is not, as
  // its height is the output here.
  useEffect(() => {
    const el = listRef.current;
    if (!el) {
      setFadeTop(false);
      setFadeBottom(false);
      return;
    }
    layoutList();
    const ro = new ResizeObserver(layoutList);
    if (el.parentElement) ro.observe(el.parentElement);
    for (const row of Array.from(el.children)) ro.observe(row);
    return () => ro.disconnect();
  }, [layoutList, visible]);

  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const add: MenuItemSpec = { id: "add-note", label: extra.tile.add, icon: "add", onSelect: addNote };
      const id = target.closest<HTMLElement>("[data-note]")?.dataset.note;
      const note = id ? notes.find((n) => n.id === id) : undefined;
      if (!note) return [add];
      return [
        { id: "edit-note", label: ru.menu.edit, icon: "edit", onSelect: () => void openNotesSettings(note.id) },
        {
          id: "toggle-note",
          label: note.done ? extra.tile.markUndone : extra.tile.markDone,
          icon: note.done ? "arrow_counterclockwise" : "checkmark_circle",
          onSelect: () => void toggleNote(note.id),
        },
        { id: "remove-note", label: ru.menu.remove, icon: "delete", onSelect: () => void removeNote(note.id) },
        { id: "sep-note", label: "", separator: true, onSelect: () => undefined },
        add,
      ];
    },
    [notes],
  );

  // Nothing is rendered from the default settings: the window is revealed only after the store is read.
  if (!loaded) return null;

  let body;
  if (visible.length === 0) {
    // Notes exist but all are done and hidden: say so, instead of «Заметок нет».
    const allDone = notes.length > 0;
    body = (
      <EmptyState
        compact
        className="notes-empty"
        title={allDone ? extra.tile.allDone : extra.tile.empty}
        hint={allDone ? extra.tile.allDoneHint : extra.tile.emptyHint}
        action={{ label: extra.tile.add, icon: "add", onClick: addNote }}
      />
    );
  } else {
    const listCls = ["notes-list", fadeTop ? "fade-top" : "", fadeBottom ? "fade-bottom" : ""].filter(Boolean).join(" ");
    body = (
      <div ref={listRef} className={listCls} role="list" aria-label={ru.tiles.notes} onScroll={updateFades}>
        {visible.map(({ note, due }) => {
          const live = !note.done && due !== null;
          const c = live ? countdown(due, now, true) : null;
          return (
            <NoteRow
              key={note.id}
              note={note}
              chip={c?.text ?? null}
              tone={c?.tone ?? null}
              when={live ? formatDeadline(new Date(due), nowDate) : null}
            />
          );
        })}
      </div>
    );
  }

  return (
    <Tile label="notes" className="tile-notes" background={background} menuItems={menuItems}>
      <PrivacyScope masked={privacy}>{body}</PrivacyScope>
    </Tile>
  );
}
