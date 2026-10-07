// Settings → «Расписание»: a week overview (lesson blocks per day) over the day selector, the chosen day's
// lessons with «Изменить» / «Удалить» and «Добавить пару», the display and privacy switches, clearing the
// whole schedule (confirmed) and, last, the reset of this section's look.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button, IconButton } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { Tooltip } from "../components/Tooltip";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.schedule";
import { isoWeekday, parseTime } from "../lib/design";
import {
  ALL_DAYS,
  clearLessons,
  lessonInkStyle,
  lessonsForDay,
  msUntilMidnight,
  removeLesson,
  TIME_SEP,
  upsertLesson,
  visibleDays,
  weekCounts,
  weekRange,
} from "../lib/schedule";
import { settings, type Lesson, type ScheduleSettings, type Weekday } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { LessonEditor } from "./schedule/LessonEditor";

type DayKey = `${Weekday}`;

interface EditorState {
  /** Changes on every open so the editor remounts with fresh form state. */
  key: number;
  lesson: Lesson | null;
  day: Weekday;
}

const DAY_OPTIONS: readonly SegmentedOption<DayKey>[] = ALL_DAYS.map((d) => ({ value: `${d}` as DayKey, label: ru.schedule.weekdaysShort[d - 1] }));

const T = ru.settings.schedule;

/** Longest wait between weekday checks: also catches a midnight that passed while the PC was asleep. */
const TODAY_RECHECK = 15 * 60_000;

/** Today's weekday, kept current while the window stays open across midnight. */
function useToday(): Weekday {
  const [today, setToday] = useState<Weekday>(() => isoWeekday(new Date()));
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => {
        setToday(isoWeekday(new Date()));
        arm();
      }, Math.min(msUntilMidnight(new Date()) + 250, TODAY_RECHECK));
    };
    arm();
    return () => window.clearTimeout(timer);
  }, []);
  return today;
}

/** `editId`: "new" opens the editor on a new lesson for today, a lesson id opens that lesson (from the tile). */
export function SchedulePage({ editId }: { editId?: string | null }) {
  const s = useSettings();
  const { lessons, showWeekend, showEmptyDays, followToday, background, privacy } = s.schedule;
  const today = useToday();
  const [day, setDay] = useState<Weekday>(today);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Opened from the tile: show the editor once.
  const editHandled = useRef(false);
  useEffect(() => {
    if (editHandled.current || !editId) return;
    editHandled.current = true;
    if (editId === "new") {
      setEditor({ key: Date.now(), lesson: null, day: today });
      return;
    }
    const l = settings.get().schedule.lessons.find((x) => x.id === editId);
    if (l) {
      setDay(l.day);
      setEditor({ key: Date.now(), lesson: l, day: l.day });
    }
  }, [editId, today]);

  const dayLessons = useMemo(() => lessonsForDay(lessons, day), [lessons, day]);
  const counts = useMemo(() => weekCounts(lessons), [lessons]);
  const range = useMemo(() => weekRange(lessons), [lessons]);
  const span = range.to - range.from;
  // Whether the chosen day is in the tile's weekday row right now (explains an empty day below).
  const shownOnTile = useMemo(() => visibleDays(lessons, showWeekend, showEmptyDays).includes(day), [lessons, showWeekend, showEmptyDays, day]);

  const update = (p: Partial<ScheduleSettings>) => void settings.updateSchedule(p);

  const openAdd = () => setEditor({ key: Date.now(), lesson: null, day });
  const openEdit = (l: Lesson) => setEditor({ key: Date.now(), lesson: l, day: l.day });
  const closeEditor = useCallback(() => setEditor(null), []);
  const saveLesson = useCallback((l: Lesson) => {
    void upsertLesson(l);
    setEditor(null);
    setDay(l.day);
  }, []);

  const closeConfirm = useCallback(() => setConfirmClear(false), []);
  const doClear = () => {
    void clearLessons();
    setConfirmClear(false);
  };

  return (
    <Page title={ru.settings.nav.schedule} description={extra.pageDesc}>
      <Section title={`${T.lessons} ${T.perDay}`} description={extra.perWeek(lessons.length)}>
        {/* Week overview: one column per weekday, lesson blocks placed by time; the labels are the control below. */}
        <div className="sched-planner">
          <div className="sched-week" aria-hidden="true">
            {ALL_DAYS.map((d) => {
              const cls = ["sched-week-col", d === day ? "selected" : "", d === today ? "today" : ""].filter(Boolean).join(" ");
              const n = counts[d - 1];
              return (
                <button key={d} type="button" tabIndex={-1} className={cls} onClick={() => setDay(d)}>
                  {/* «3 пары» / «нет пар»; when the overview is narrow only «3» (the words hide). */}
                  <span className="sched-week-count caption">
                    {n > 0 && <span className="num">{n}</span>}
                    <span className="sched-week-word">{n > 0 ? ` ${extra.lessonsWord(n)}` : extra.noLessonsShort}</span>
                  </span>
                  <span className="sched-week-track">
                    {lessonsForDay(lessons, d).map((l) => {
                      const st = parseTime(l.start);
                      const en = parseTime(l.end);
                      if (st === null || en === null || en <= st) return null;
                      const style: CSSProperties = {
                        top: `${((st - range.from) / span) * 100}%`,
                        height: `${((en - st) / span) * 100}%`,
                        ...lessonInkStyle(l.color),
                      };
                      return <span key={l.id} className="sched-week-block" style={style} />;
                    })}
                  </span>
                </button>
              );
            })}
          </div>
          <Segmented<DayKey> fill options={DAY_OPTIONS} value={`${day}`} onChange={(v) => setDay(Number(v) as Weekday)} ariaLabel={ru.schedule.day} />
        </div>

        <div className="sched-day-head">
          <div className="sched-day-title">
            <span className="sched-day-name">
              <span className="body-strong">{ru.schedule.weekdaysLong[day - 1]}</span>
              {day === today && <span className="sched-today-pill caption">{ru.schedule.today}</span>}
            </span>
            {dayLessons.length > 0 && <span className="hint">{extra.lessonsCount(dayLessons.length)}</span>}
          </div>
          <Button variant="accent" icon="add" onClick={openAdd}>
            {ru.schedule.addLesson}
          </Button>
        </div>

        {dayLessons.length ? (
          <div className="sched-items" role="list">
            {dayLessons.map((l) => {
              const teacher = l.teacher.trim();
              const room = l.room.trim();
              return (
                <div key={l.id} className="sched-item" role="listitem" style={lessonInkStyle(l.color)}>
                  <span className="sched-item-bar" aria-hidden="true" />
                  <span className="sched-item-time">
                    <span className="num">{l.start}</span>
                    {TIME_SEP}
                    <span className="num">{l.end}</span>
                  </span>
                  <div className="sched-item-text">
                    <span className="sched-item-title ellipsis">{l.title.trim() || ru.schedule.lesson}</span>
                    {(teacher || room) && (
                      <span className="sched-item-meta caption ellipsis">
                        {teacher}
                        {teacher && room ? " · " : ""}
                        {room && <span className="mono">{room}</span>}
                      </span>
                    )}
                  </div>
                  {/* The common row actions: pencil, and a trash that turns critical only on hover. */}
                  <div className="sched-item-actions">
                    <Tooltip text={ru.common.edit}>
                      <IconButton icon="edit" label={ru.common.edit} variant="subtle" onClick={() => openEdit(l)} />
                    </Tooltip>
                    <Tooltip text={ru.common.remove}>
                      <IconButton icon="delete" label={ru.common.remove} variant="danger" onClick={() => void removeLesson(l.id)} />
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // «Добавить пару» is right above in the day head, so the empty state carries no button of its own.
          <EmptyState className="sched-day-empty" title={extra.dayEmpty} hint={shownOnTile ? extra.dayEmptyHint : extra.dayHiddenHint} />
        )}
      </Section>

      <Section title={T.options}>
        <Row label={extra.showEmptyDays} hint={extra.showEmptyDaysHint}>
          <Switch checked={showEmptyDays} onChange={(v) => update({ showEmptyDays: v })} ariaLabel={extra.showEmptyDays} />
        </Row>
        {/* With empty days hidden only days with lessons are shown, so this switch has nothing to add. */}
        <Row label={ru.schedule.showWeekend} hint={showEmptyDays ? extra.showWeekendHint : extra.showWeekendOffHint}>
          <Switch checked={showWeekend} disabled={!showEmptyDays} onChange={(v) => update({ showWeekend: v })} ariaLabel={ru.schedule.showWeekend} />
        </Row>
        <Row label={ru.schedule.followToday} hint={extra.followTodayHint}>
          <Switch checked={followToday} onChange={(v) => update({ followToday: v })} ariaLabel={ru.schedule.followToday} />
        </Row>
        <Row label={ru.common.privacy} hint={ru.common.privacyHint}>
          <Switch checked={privacy} onChange={(v) => update({ privacy: v })} ariaLabel={ru.common.privacy} />
        </Row>
        <Row label={T.background} hint={extra.backgroundHint}>
          <Switch checked={background} onChange={(v) => update({ background: v })} ariaLabel={T.background} />
        </Row>
      </Section>

      <Section>
        <Row label={T.clear} hint={extra.clearHint}>
          <Button variant="danger" icon="delete" disabled={lessons.length === 0} onClick={() => setConfirmClear(true)}>
            {extra.clearShort}
          </Button>
        </Row>
      </Section>

      {editor && <LessonEditor key={editor.key} lesson={editor.lesson} day={editor.day} lessons={lessons} onSave={saveLesson} onClose={closeEditor} />}

      <Dialog
        open={confirmClear}
        title={extra.clearTitle}
        onClose={closeConfirm}
        width="440px"
        footer={
          <>
            <Button onClick={closeConfirm}>{ru.common.cancel}</Button>
            <Button variant="danger" icon="delete" onClick={doClear}>
              {extra.clearShort}
            </Button>
          </>
        }
      >
        <div className="sched-confirm">
          <span className="body">{extra.clearText}</span>
          <span className="hint">{extra.inSchedule(lessons.length)}</span>
        </div>
      </Dialog>

      <ResetSection section="schedule" />
    </Page>
  );
}
