// Dialog for adding / editing one lesson: day, start–end («ЧЧ:ММ» mask, validated), title, teacher,
// room, colour (accent or own) and a live preview of the row as the tile will draw it.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { ColorPicker } from "../../components/ColorPicker";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.schedule";
import { SWATCHES } from "../../lib/design";
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
  /** The whole schedule — for suggested times and the overlap hint. */
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
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The kit's Dialog focuses the first control in DOM order — here the «Пн» button of the day Segmented,
  // which the brief places above the fields. The form wants its required field (the title), so focus is
  // moved there one frame later; `autoFocus` alone would be overridden by the dialog's own focus call.
  useEffect(() => {
    const id = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>("input.sched-focus")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

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
    if (!endTouched) {
      const n = normalizeTime(masked);
      const follow = n ? addMinutes(n, LESSON_MINUTES) : null;
      if (follow) setEnd(follow);
    }
  };

  const changeEnd = (v: string) => {
    setEnd(maskTime(end, v));
    setTimesTouched(true);
    setEndTouched(true);
  };

  const blurTime = (field: "start" | "end") => {
    const value = field === "start" ? start : end;
    const n = normalizeTime(value);
    if (n && n !== value) (field === "start" ? setStart : setEnd)(n);
    setTouched((t) => ({ ...t, [field]: true }));
  };

  const errors = validateLesson({ start, end, title });
  const shown = (f: Field) => (submitted || touched[f] ? errors[f] : undefined);

  const overlap = useMemo(() => findOverlap(lessons, day, start, end, lesson?.id), [lessons, day, start, end, lesson?.id]);

  const save = () => {
    setSubmitted(true);
    const s = normalizeTime(start);
    const e = normalizeTime(end);
    if (!s || !e || hasErrors(errors)) return;
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
          <Button variant="accent" onClick={save}>
            {ru.common.save}
          </Button>
        </>
      }
    >
      <div ref={rootRef} className="sched-editor">
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

        <TextField
          label={ru.schedule.title}
          value={title}
          onChange={setTitle}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          onKeyDown={onEnter}
          placeholder={ru.schedule.titlePlaceholder}
          maxLength={TITLE_MAX}
          error={shown("title")}
          inputClassName="sched-focus"
        />

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
            <LessonRow lesson={preview} state="now" now={new Date()} preview />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
