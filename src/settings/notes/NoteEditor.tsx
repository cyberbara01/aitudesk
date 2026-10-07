// Dialog for a new or an existing note: text (grows from 3 to 8 rows, 2000 characters at most, a counter near
// the limit), «Дедлайн» with a date from the calendar and a time with the «ЧЧ:ММ» mask plus quick choices, and
// an optional colour. Save stays disabled while the form is invalid; Ctrl+Enter in the text or Enter in the
// time field saves.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { ColorPicker } from "../../components/ColorPicker";
import { DatePicker } from "../../components/DatePicker";
import { Dialog } from "../../components/Dialog";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { Switch } from "../../components/Switch";
import { TextArea } from "../../components/TextArea";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.notes";
import { FAVORITE_COLORS } from "../../lib/design";
import {
  MAX_TEXT,
  countdown,
  deadlineMs,
  inAWeek,
  joinDeadline,
  maskTime,
  normalizeTime,
  saveNote,
  splitDeadline,
  tomorrowMorning,
  tonight,
  type DeadlineParts,
} from "../../lib/notes";
import type { Note } from "../../lib/settings";
import { NoteChip } from "./NoteChip";

type ColorMode = "none" | "custom";

const E = extra.editor;
const COLOR_OPTIONS: readonly SegmentedOption<ColorMode>[] = [
  { value: "none", label: E.noColor },
  { value: "custom", label: E.ownColor },
];

export interface NoteEditorProps {
  /** The note to edit, or null for a new one. */
  note: Note | null;
  onClose: () => void;
}

/** Mount a fresh instance (via `key`) for every open: the form state is initialised from the props once. */
export function NoteEditor({ note, onClose }: NoteEditorProps) {
  const editing = note !== null;
  const initial = useMemo(() => splitDeadline(note?.deadline), [note]);
  const [text, setText] = useState(note?.text ?? "");
  const [hasDeadline, setHasDeadline] = useState(initial !== null);
  const [parts, setParts] = useState<DeadlineParts>(() => initial ?? tonight(new Date()));
  const [timeTouched, setTimeTouched] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>(note?.color ? "custom" : "none");
  const [color, setColor] = useState(note?.color ?? FAVORITE_COLORS[0]);
  /** The date / time were chosen by the user (switching the deadline on again keeps them). */
  const chosen = useRef(initial !== null);

  const toggleDeadline = (on: boolean) => {
    setHasDeadline(on);
    if (on && !chosen.current) setParts(tonight(new Date()));
  };

  const choose = (next: DeadlineParts) => {
    chosen.current = true;
    setParts(next);
    setTimeTouched(false);
  };

  const changeTime = (v: string) => {
    chosen.current = true;
    setParts((p) => ({ ...p, time: maskTime(p.time, v) }));
  };

  const blurTime = () => {
    const n = normalizeTime(parts.time);
    if (n && n !== parts.time) setParts((p) => ({ ...p, time: n }));
    setTimeTouched(true);
  };

  const trimmed = text.trim();
  const timeValid = normalizeTime(parts.time) !== null;
  const deadline = hasDeadline ? joinDeadline(parts.date, parts.time) : null;
  const valid = trimmed.length > 0 && (!hasDeadline || deadline !== null);
  const timeError = hasDeadline && !timeValid && (timeTouched || parts.time.length >= 5) ? ru.schedule.invalidTime : undefined;

  // What the tile will show for this deadline, as of now (no timer in the editor: it updates with every edit).
  const due = deadline ? deadlineMs(deadline) : null;
  const preview = due !== null ? countdown(due, Date.now(), false) : null;

  const save = () => {
    if (!valid) return;
    void saveNote(note?.id ?? null, {
      text: trimmed,
      deadline,
      color: colorMode === "custom" ? color : null,
    });
    onClose();
  };

  const onTextKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  const onTimeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  return (
    <Dialog
      open
      title={editing ? E.editNote : E.newNote}
      onClose={onClose}
      width="560px"
      footer={
        <>
          <Button onClick={onClose}>{ru.common.cancel}</Button>
          <Button variant="accent" disabled={!valid} onClick={save}>
            {ru.common.save}
          </Button>
        </>
      }
    >
      <div className="note-editor">
        <TextArea
          label={E.text}
          value={text}
          onChange={setText}
          placeholder={E.textPlaceholder}
          maxLength={MAX_TEXT}
          minRows={3}
          maxRows={8}
          autoFocus
          hint={E.saveHint}
          counterText={E.counter}
          onKeyDown={onTextKey}
        />

        <div className="note-field">
          <div className="note-field-head">
            <div className="note-field-text">
              <span className="body">{E.deadline}</span>
              <span className="hint">{E.deadlineHint}</span>
            </div>
            <Switch checked={hasDeadline} onChange={toggleDeadline} ariaLabel={E.deadline} />
          </div>

          {hasDeadline && (
            <div className="note-deadline">
              <div className="note-deadline-fields">
                <DatePicker
                  label={E.date}
                  value={parts.date}
                  onChange={(date) => {
                    chosen.current = true;
                    setParts((p) => ({ ...p, date }));
                  }}
                />
                <TextField
                  label={E.time}
                  value={parts.time}
                  onChange={changeTime}
                  onBlur={blurTime}
                  onKeyDown={onTimeKey}
                  placeholder={E.timePlaceholder}
                  maxLength={5}
                  inputClassName="num"
                  error={timeError}
                  className="note-time"
                />
              </div>
              <div className="note-quick" role="group" aria-label={E.quick}>
                <Button size="sm" onClick={() => choose(tonight(new Date()))}>
                  {E.tonight}
                </Button>
                <Button size="sm" onClick={() => choose(tomorrowMorning(new Date()))}>
                  {E.tomorrowMorning}
                </Button>
                <Button size="sm" onClick={() => choose(inAWeek(new Date(), timeValid ? parts.time : null))}>
                  {E.inWeek}
                </Button>
              </div>
              {preview && (
                <div className="note-due" role="status">
                  <NoteChip text={preview.text} tone={preview.tone} />
                  {preview.tone === "overdue" && <span className="note-due-past caption">{E.past}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="note-field">
          <div className="note-field-head">
            <div className="note-field-text">
              <span className="body">{E.color}</span>
              <span className="hint">{E.colorHint}</span>
            </div>
            <Segmented<ColorMode> size="sm" options={COLOR_OPTIONS} value={colorMode} onChange={setColorMode} ariaLabel={E.color} />
          </div>
          {colorMode === "custom" && <ColorPicker value={color} onChange={setColor} swatches={FAVORITE_COLORS} />}
        </div>
      </div>
    </Dialog>
  );
}
