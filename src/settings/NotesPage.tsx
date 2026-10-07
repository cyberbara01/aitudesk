// Settings → «Заметки»: every note in the tile's order (active by deadline, then without one, done last) with
// the «выполнено» toggle, the deadline and the time left, «Изменить» / «Удалить»; «Добавить заметку»; the tile
// options (done notes, privacy, background) and the section reset. `editId` (from the tile's context menu)
// opens the editor on that note once; NEW_NOTE opens it on an empty note.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
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
  orderNotes,
  removeNote,
  timeOf,
  toggleNote,
  useDeadlineClock,
} from "../lib/notes";
import { settings, type Note, type NotesSettings } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { NoteCheck } from "./notes/NoteCheck";
import { NoteEditor } from "./notes/NoteEditor";

const P = extra.page;

interface EditorState {
  /** Changes on every open so the editor remounts with fresh form state. */
  key: number;
  note: Note | null;
}

export function NotesPage({ editId }: { editId?: string | null }) {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const { notes, showDone, privacy, background } = s.notes;
  const ordered = useMemo(() => orderNotes(notes), [notes]);
  const deadlines = useMemo(() => activeDeadlines(ordered), [ordered]);
  // Minute precision here: the list says «через 9 мин», only the tile counts seconds.
  const now = useDeadlineClock(deadlines, false);
  const nowDate = useMemo(() => new Date(now), [now]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const handledEdit = useRef<string | null>(null);

  // Deep link from the tile: «Изменить» on a note, or «Добавить заметку».
  useEffect(() => {
    if (!loaded || !editId || handledEdit.current === editId) return;
    handledEdit.current = editId;
    if (editId === NEW_NOTE) {
      setEditor({ key: Date.now(), note: null });
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
          <div className="note-items" role="list">
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
                    </>
                  );
                }
              }
              return (
                <div key={note.id} className={note.done ? "note-item done" : "note-item"} role="listitem">
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

      <ResetSection section="notes" />

      {editor && <NoteEditor key={editor.key} note={editor.note} onClose={closeEditor} />}
    </Page>
  );
}
