// Settings → «Заметки»: every note in the tile's order («Сортировка»: by deadline, newest or oldest added
// first, or «Свой порядок»; done last) with the «выполнено» toggle, the deadline and the time left (and a mark
// when its reminders are off), «Изменить» / «Удалить»; «Добавить заметку»; the tile options (done notes,
// privacy, background) and the section reset. Notes are dragged into any order within their group (active or
// done; useDragReorder): from anywhere on the row or by the grip that shows on hover at its left edge, which
// also takes Alt+ArrowUp / Alt+ArrowDown. A move switches the sort to «Свой порядок». `editId` (from the tile's
// context menu) opens the editor on that note once; NEW_NOTE opens it on an empty note.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Select, type SelectOption } from "../components/Select";
import { Switch } from "../components/Switch";
import { Tooltip } from "../components/Tooltip";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.notes";
import {
  NEW_NOTE,
  activeDeadlines,
  countdown,
  displayText,
  formatDeadline,
  fullDate,
  moveNote,
  orderNotes,
  removeNote,
  setNoteSort,
  timeOf,
  toggleNote,
  useDeadlineClock,
} from "../lib/notes";
import { NOTE_SORTS, settings, type Note, type NoteSort, type NotesSettings } from "../lib/settings";
import { useDragReorder } from "../lib/useDragReorder";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { NoteCheck } from "./notes/NoteCheck";
import { NoteEditor } from "./notes/NoteEditor";
import { InkWidgetSection } from "./InkSection";

const P = extra.page;

const SORT_OPTIONS: readonly SelectOption<NoteSort>[] = NOTE_SORTS.map((value) => ({ value, label: P.sorts[value] }));
const pickSort = (sort: NoteSort) => void setNoteSort(sort);

interface EditorState {
  /** Changes on every open so the editor remounts with fresh form state. */
  key: number;
  note: Note | null;
  /** A new note for a day picked in the calendar («new@YYYY-MM-DD», «remind@YYYY-MM-DD»). */
  preset?: { date: string; remind: boolean } | null;
}

export function NotesPage({ editId }: { editId?: string | null }) {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const { notes, sort, showDone, privacy, background } = s.notes;
  const ordered = useMemo(() => orderNotes(notes, sort), [notes, sort]);
  const deadlines = useMemo(() => activeDeadlines(ordered), [ordered]);
  // Minute precision here: the list says «через 9 мин», only the tile counts seconds.
  const now = useDeadlineClock(deadlines, false);
  const nowDate = useMemo(() => new Date(now), [now]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const handledEdit = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => ordered.map((it) => it.note.id), [ordered]);
  // A screen reader hears where a moved note landed (its place within its group) once the new order shows.
  const movedId = useRef<string | null>(null);
  const [moveSaid, setMoveSaid] = useState("");
  const onMove = useCallback((id: string, before: string | null) => {
    movedId.current = id;
    void moveNote(id, before);
  }, []);
  useEffect(() => {
    const id = movedId.current;
    const at = ordered.findIndex((it) => it.note.id === id);
    if (at < 0) return;
    movedId.current = null;
    const group = ordered.filter((it) => it.note.done === ordered[at].note.done);
    setMoveSaid(P.moved(group.findIndex((it) => it.note.id === id) + 1, group.length));
  }, [ordered]);
  const reorder = useDragReorder(listRef, { ids, onMove });
  const dragHintId = useId();

  // Deep link from the tile: «Изменить» on a note, or «Добавить заметку».
  useEffect(() => {
    if (!loaded || !editId || handledEdit.current === editId) return;
    handledEdit.current = editId;
    if (editId === NEW_NOTE) {
      setEditor({ key: Date.now(), note: null });
      return;
    }
    // From the calendar: a note (or a reminder) with its deadline on that day.
    const day = /^(new|remind)@(\d{4}-\d{2}-\d{2})$/.exec(editId);
    if (day) {
      setEditor({ key: Date.now(), note: null, preset: { date: day[2], remind: day[1] === "remind" } });
      return;
    }
    const note = settings.get().notes.notes.find((n) => n.id === editId);
    if (note) setEditor({ key: Date.now(), note });
  }, [loaded, editId]);

  const update = (p: Partial<NotesSettings>) => void settings.updateNotes(p);
  const openNew = () => setEditor({ key: Date.now(), note: null });
  // Stable: the Dialog re-registers its Esc handler and refocuses its first field whenever onClose changes.
  const closeEditor = useCallback(() => setEditor(null), []);

  const doneCount = notes.filter((n) => n.done).length;
  const activeCount = notes.length - doneCount;

  return (
    <Page title={ru.settings.nav.notes} description={P.desc}>
      <Section>
        <div className="notes-head">
          <div className="notes-head-text">
            <span className="section-title">{P.list}</span>
            {notes.length > 0 && <span className="section-desc">{P.summary(activeCount, doneCount)}</span>}
          </div>
          {ordered.length > 0 && (
            <Button variant="accent" icon="add" onClick={openNew}>
              {extra.tile.add}
            </Button>
          )}
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            className="notes-page-empty"
            title={P.emptyTitle}
            hint={P.emptyHint}
            action={{ label: extra.tile.add, icon: "add", onClick: openNew }}
          />
        ) : (
          <>
            <div className="notes-sort">
              <Row label={P.sort} hint={P.sortHint}>
                <Select<NoteSort> className="notes-sort-select" options={SORT_OPTIONS} value={sort} onChange={pickSort} ariaLabel={P.sort} />
              </Row>
            </div>
            <span id={dragHintId} hidden>
              {P.dragHint}
            </span>
            <span className="sr-only" aria-live="polite">
              {moveSaid}
            </span>
            <div ref={listRef} className="note-items" role="list" onPointerDown={reorder.onPointerDown} onKeyDown={reorder.onKeyDown}>
              {ordered.map(({ note, due }) => {
                let meta = <>{P.noDeadline}</>;
                if (due !== null) {
                  const d = new Date(due);
                  if (note.done) {
                    // Static: done notes have no countdown, so nothing here may go stale at midnight.
                    meta = <>{`${fullDate(d, nowDate, "long")}, ${timeOf(d)}`}</>;
                  } else {
                    const c = countdown(due, now, false);
                    meta = (
                      <>
                        {formatDeadline(d, nowDate, "long")}
                        {" · "}
                        <span className={`note-item-due ${c.tone}`}>{c.text}</span>
                        {/* Reminders switched off in the note's editor (they only matter for an active deadline). */}
                        {note.remind === false && (
                          <Tooltip text={P.noReminders} className="note-item-mute">
                            <span role="img" aria-label={P.noReminders}>
                              <Icon name="alert_off" size={16} />
                            </span>
                          </Tooltip>
                        )}
                      </>
                    );
                  }
                }
                // Only a group of two or more can be reordered: a lone note gets no grip.
                const movable = (note.done ? doneCount : activeCount) > 1;
                return (
                  <div
                    key={note.id}
                    className={note.done ? "note-item done" : "note-item"}
                    role="listitem"
                    data-reorder-id={note.id}
                    data-reorder-group={note.done ? "done" : "active"}
                  >
                    {movable && (
                      <Tooltip text={P.dragHint} className="note-item-grip">
                        <button
                          type="button"
                          className="note-item-grip-btn"
                          aria-label={P.drag}
                          aria-describedby={dragHintId}
                          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                          data-drag-handle
                        >
                          <Icon name="re_order_dots_vertical" size={16} />
                        </button>
                      </Tooltip>
                    )}
                    <NoteCheck done={note.done} color={note.color} onToggle={() => void toggleNote(note.id)} />
                    <div className="note-item-text">
                      <span className="note-item-title">{displayText(note.text)}</span>
                      <span className="note-item-meta caption">{meta}</span>
                    </div>
                    <div className="note-item-actions">
                      <Tooltip text={ru.common.edit}>
                        <IconButton icon="edit" label={ru.common.edit} variant="subtle" onClick={() => setEditor({ key: Date.now(), note })} />
                      </Tooltip>
                      <Tooltip text={ru.common.remove}>
                        <IconButton icon="delete" label={ru.common.remove} variant="danger" onClick={() => void removeNote(note.id)} />
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Section>

      <Section title={P.options}>
        <Row label={P.showDone} hint={P.showDoneHint}>
          <Switch checked={showDone} onChange={(v) => update({ showDone: v })} ariaLabel={P.showDone} />
        </Row>
        <Row label={ru.common.privacy} hint={ru.common.privacyHint}>
          <Switch checked={privacy} onChange={(v) => update({ privacy: v })} ariaLabel={ru.common.privacy} />
        </Row>
        <Row label={P.background} hint={P.backgroundHint}>
          <Switch checked={background} onChange={(v) => update({ background: v })} ariaLabel={P.background} />
        </Row>
      </Section>

      <InkWidgetSection widget="notes" />

      <ResetSection section="notes" />

      {editor && <NoteEditor key={editor.key} note={editor.note} preset={editor.preset} onClose={closeEditor} />}
    </Page>
  );
}
