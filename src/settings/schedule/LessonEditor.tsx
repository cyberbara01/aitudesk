// Dialog for adding or editing one lesson: title, day, start and end («ЧЧ:ММ» mask, validated), teacher,
// room, colour (accent or own) and a live preview of the row as the tile draws it. The title is the first
// field, so the kit's Dialog focuses it on open; Esc and outside clicks are handled by the Dialog.
import { useMemo, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { ColorPicker } from "../../components/ColorPicker";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.schedule";
import { SWATCHES, parseTime } from "../../lib/design";
import {
  ALL_DAYS,
  DEFAULT_START,
  LESSON_MINUTES,
  addMinutes,
  findOverlap,
  hasErrors,
  lessonsForDay,
  maskTime,
  newId,
  normalizeTime,
  suggestTimes,
  timeRange,
  validateLesson,
  type LessonErrors,
} from "../../lib/schedule";
import type { Lesson, Weekday } from "../../lib/settings";
import { LessonRow } from "../../tiles/Schedule";

type DayKey = `${Weekday}`;
type ColorMode = "accent" | "custom";
type Field = keyof LessonErrors;

export interface LessonEditorProps {
  /** Existing lesson to edit, or null for a new one. */
  lesson: Lesson | null;
  /** Pre-selected weekday for a new lesson. */
  day: Weekday;
  /** The whole schedule: for suggested times and the overlap hint. */
  lessons: readonly Lesson[];
  onSave: (lesson: Lesson) => void;
  onClose: () => void;
}

const DAY_OPTIONS: readonly SegmentedOption<DayKey>[] = ALL_DAYS.map((d) => ({ value: `${d}` as DayKey, label: ru.schedule.weekdaysShort[d - 1] }));
const COLOR_OPTIONS: readonly SegmentedOption<ColorMode>[] = [
  { value: "accent", label: extra.colorAccent },
  { value: "custom", label: extra.colorOwn },
];
const START_PLACEHOLDER = DEFAULT_START;
const END_PLACEHOLDER = addMinutes(DEFAULT_START, LESSON_MINUTES) ?? DEFAULT_START;

const TITLE_MAX = 80;
const TEACHER_MAX = 60;
const ROOM_MAX = 24;

/** Mount a fresh instance (via `key`) for every open: the form state is initialised from the props once. */
export function LessonEditor({ lesson, day: initialDay, lessons, onSave, onClose }: LessonEditorProps) {
  const editing = lesson !== null;
  const [day, setDay] = useState<Weekday>(lesson?.day ?? initialDay);
  const [initialTimes] = useState(() => suggestTimes(lessonsForDay(lessons, lesson?.day ?? initialDay)));
  const [start, setStart] = useState(lesson?.start ?? initialTimes.start);
  const [end, setEnd] = useState(lesson?.end ?? initialTimes.end);
  /** Once the user edits a time, changing the day no longer re-suggests times. */
  const [timesTouched, setTimesTouched] = useState(editing);
  /** Once the end is edited by hand, the start no longer drags it along. */
  const [endTouched, setEndTouched] = useState(editing);
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [teacher, setTeacher] = useState(lesson?.teacher ?? "");
  const [room, setRoom] = useState(lesson?.room ?? "");
  const [colorMode, setColorMode] = useState<ColorMode>(lesson?.color ? "custom" : "accent");
  const [color, setColor] = useState(lesson?.color ?? SWATCHES[0]);
  /** Time fields the user has left (their errors may show from then on). */
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  /** The title had text at some point: clearing it again is worth a message, merely leaving it empty is not. */
  const [titleDirty, setTitleDirty] = useState(false);
  /** A save was attempted (Enter in a field): every remaining error shows. */
  const [submitted, setSubmitted] = useState(false);

  const changeTitle = (v: string) => {
    setTitle(v);
    if (v.trim()) setTitleDirty(true);
  };

  const changeDay = (d: Weekday) => {
    setDay(d);
    if (!timesTouched) {
      const t = suggestTimes(lessonsForDay(lessons, d));
      setStart(t.start);
      setEnd(t.end);
    }
  };

  const changeStart = (v: string) => {
    const masked = maskTime(start, v);
    setStart(masked);
    setTimesTouched(true);
    // The end follows only a complete «ЧЧ:ММ», so it does not jump around while the start is typed.
    if (!endTouched && parseTime(masked) !== null) {
      const follow = addMinutes(masked, LESSON_MINUTES);
      if (follow) setEnd(follow);
    }
  };

  const changeEnd = (v: string) => {
    setEnd(maskTime(end, v));
    setTimesTouched(true);
    setEndTouched(true);
  };

  /** «8» → «08:00», «8:30» → «08:30» once the field is left. */
  const blurTime = (field: "start" | "end") => {
    const value = field === "start" ? start : end;
    const n = normalizeTime(value);
    if (n && n !== value) (field === "start" ? setStart : setEnd)(n);
    setTouched((t) => ({ ...t, [field]: true }));
  };

  // Save stays disabled while the form is invalid (as in the note editor); messages appear only where they
  // help: the title after a save attempt or once typed and cleared, a time once its field was left, and the
  // order of the times («Конец должен быть позже начала») once either time was left.
  const errors = validateLesson({ start, end, title });
  const valid = !hasErrors(errors);
  const shown = (f: Field): string | undefined => {
    if (submitted) return errors[f];
    if (f === "title") return titleDirty ? errors.title : undefined;
    if (f === "end") return touched.end || touched.start ? errors.end : undefined;
    return touched.start ? errors.start : undefined;
  };

  const overlap = useMemo(() => findOverlap(lessons, day, start, end, lesson?.id), [lessons, day, start, end, lesson?.id]);

  const save = () => {
    setSubmitted(true);
    const s = normalizeTime(start);
    const e = normalizeTime(end);
    if (!s || !e || !valid) return;
    onSave({
      id: lesson?.id ?? newId(),
      day,
      start: s,
      end: e,
      title: title.trim(),
      teacher: teacher.trim(),
      room: room.trim(),
      color: colorMode === "custom" ? color : undefined,
    });
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  const preview: Lesson = {
    id: "preview",
    day,
    start: normalizeTime(start) ?? start,
    end: normalizeTime(end) ?? end,
    title: title.trim() || ru.schedule.lesson,
    teacher,
    room,
    color: colorMode === "custom" ? color : undefined,
  };

  return (
    <Dialog
      open
      title={editing ? ru.schedule.editLesson : ru.schedule.addLesson}
      onClose={onClose}
      width="600px"
      footer={
        <>
          <Button onClick={onClose}>{ru.common.cancel}</Button>
          <Button variant="accent" disabled={!valid} onClick={save}>
            {ru.common.save}
          </Button>
        </>
      }
    >
      <div className="sched-editor">
        <TextField
          label={ru.schedule.title}
          value={title}
          onChange={changeTitle}
          onKeyDown={onEnter}
          placeholder={ru.schedule.titlePlaceholder}
          maxLength={TITLE_MAX}
          error={shown("title")}
        />

        <div className="sched-field">
          <span className="sched-field-label caption">{ru.schedule.day}</span>
          <Segmented<DayKey> fill options={DAY_OPTIONS} value={`${day}`} onChange={(v) => changeDay(Number(v) as Weekday)} ariaLabel={ru.schedule.day} />
        </div>

        <div className="sched-field">
          <div className="grid-2">
            <TextField
              label={ru.schedule.from}
              value={start}
              onChange={changeStart}
              onBlur={() => blurTime("start")}
              onKeyDown={onEnter}
              inputClassName="num"
              placeholder={START_PLACEHOLDER}
              maxLength={5}
              error={shown("start")}
            />
            <TextField
              label={ru.schedule.to}
              value={end}
              onChange={changeEnd}
              onBlur={() => blurTime("end")}
              onKeyDown={onEnter}
              inputClassName="num"
              placeholder={END_PLACEHOLDER}
              maxLength={5}
              error={shown("end")}
            />
          </div>
          {overlap && (
            <span className="sched-warn caption" role="status">
              <Icon name="warning" size={16} />
              <span>{extra.overlaps(overlap.title.trim() || ru.schedule.lesson, timeRange(overlap))}</span>
            </span>
          )}
        </div>

        <div className="grid-2">
          <TextField label={ru.schedule.teacher} value={teacher} onChange={setTeacher} onKeyDown={onEnter} placeholder={ru.schedule.teacherPlaceholder} maxLength={TEACHER_MAX} />
          <TextField label={ru.schedule.room} value={room} onChange={setRoom} onKeyDown={onEnter} placeholder={ru.schedule.roomPlaceholder} mono maxLength={ROOM_MAX} />
        </div>

        <div className="sched-field">
          <div className="sched-field-head">
            <div className="sched-field-text">
              <span className="sched-field-label caption">{ru.common.color}</span>
              <span className="hint">{extra.colorHint}</span>
            </div>
            <Segmented<ColorMode> size="sm" options={COLOR_OPTIONS} value={colorMode} onChange={setColorMode} ariaLabel={ru.common.color} />
          </div>
          {colorMode === "custom" && <ColorPicker value={color} onChange={setColor} />}
        </div>

        <div className="sched-field">
          <span className="sched-field-label caption">{ru.common.preview}</span>
          <div className="sched-preview" role="img" aria-label={extra.previewHint}>
            <LessonRow lesson={preview} state="now" preview />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
