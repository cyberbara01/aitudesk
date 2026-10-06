// Settings → «Расписание»: a week overview (lesson blocks per day) over the day selector, the chosen
// day's lessons with «Изменить» / «Удалить» and «Добавить пару», display switches, and a guarded reset.
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.schedule";
import { isoWeekday, parseTime } from "../lib/design";
import { ALL_DAYS, clearLessons, lessonsForDay, removeLesson, timeRange, upsertLesson, weekCounts, weekRange } from "../lib/schedule";
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

export function SchedulePage() {
  const s = useSettings();
  const { lessons, showWeekend, followToday, background } = s.schedule;
  const today = isoWeekday(new Date());
  const [day, setDay] = useState<Weekday>(today);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const dayLessons = useMemo(() => lessonsForDay(lessons, day), [lessons, day]);
  const counts = useMemo(() => weekCounts(lessons), [lessons]);
  const range = useMemo(() => weekRange(lessons), [lessons]);
  const span = range.to - range.from;

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

  const weekendHidden = !showWeekend && (day === 6 || day === 7);

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
                  <span className="sched-week-count caption">{n ? ru.schedule.lessons(n) : "—"}</span>
                  <span className="sched-week-track">
                    {lessonsForDay(lessons, d).map((l) => {
                      const st = parseTime(l.start);
                      const en = parseTime(l.end);
                      if (st === null || en === null || en <= st) return null;
                      const style: CSSProperties = {
                        top: `${((st - range.from) / span) * 100}%`,
                        height: `${((en - st) / span) * 100}%`,
                        ...(l.color ? ({ "--lesson-color": l.color } as CSSProperties) : {}),
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
            <span className="hint">{dayLessons.length ? ru.schedule.lessons(dayLessons.length) : extra.dayEmpty}</span>
          </div>
          <Button variant="accent" icon="add" onClick={openAdd}>
            {ru.schedule.addLesson}
          </Button>
        </div>

        {weekendHidden && (
          <div className="sched-note caption" role="note">
            <Icon name="info" size={16} />
            <span>{extra.weekendHidden}</span>
          </div>
        )}

        {dayLessons.length ? (
          <div className="sched-items" role="list">
            {dayLessons.map((l) => {
              const teacher = l.teacher.trim();
              const room = l.room.trim();
              return (
                <div key={l.id} className="sched-item" role="listitem" style={l.color ? ({ "--lesson-color": l.color } as CSSProperties) : undefined}>
                  <span className="sched-item-bar" aria-hidden="true" />
                  <span className="sched-item-time num">{timeRange(l)}</span>
                  <div className="sched-item-text">
                    <span className="sched-item-title ellipsis">{l.title}</span>
                    {(teacher || room) && (
                      <span className="sched-item-meta caption ellipsis">
                        {teacher}
                        {teacher && room ? " · " : ""}
                        {room && <span className="mono">{room}</span>}
                      </span>
                    )}
                  </div>
                  <div className="sched-item-actions">
                    <Button size="sm" variant="subtle" icon="edit" onClick={() => openEdit(l)}>
                      {ru.common.edit}
                    </Button>
                    <Button size="sm" variant="danger" className="subtle" icon="delete" onClick={() => void removeLesson(l.id)}>
                      {ru.common.remove}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sched-day-empty">
            <Icon name="calendar_ltr" />
            <span className="body">{extra.dayEmpty}</span>
            <span className="hint">{extra.dayEmptyHint}</span>
          </div>
        )}
      </Section>

      <Section title={T.options}>
        <Row label={ru.schedule.showWeekend} hint={extra.showWeekendHint}>
          <Switch checked={showWeekend} onChange={(v) => update({ showWeekend: v })} />
        </Row>
        <Row label={ru.schedule.followToday} hint={extra.followTodayHint}>
          <Switch checked={followToday} onChange={(v) => update({ followToday: v })} />
        </Row>
        <Row label={T.background} hint={extra.backgroundHint}>
          <Switch checked={background} onChange={(v) => update({ background: v })} />
        </Row>
      </Section>

      <Section title={extra.resetTitle}>
        <Row label={T.clear} hint={extra.clearHint}>
          <Button variant="danger" icon="delete" disabled={lessons.length === 0} onClick={() => setConfirmClear(true)}>
            {extra.clearShort}
          </Button>
        </Row>
      </Section>

      {editor && <LessonEditor key={editor.key} lesson={editor.lesson} day={editor.day} lessons={lessons} onSave={saveLesson} onClose={closeEditor} />}

      <Dialog
        open={confirmClear}
        title={T.clear}
        onClose={closeConfirm}
        width="440px"
        footer={
          <>
            <Button onClick={closeConfirm}>{ru.common.cancel}</Button>
            <Button variant="danger" icon="delete" onClick={doClear}>
              {ru.common.remove}
            </Button>
          </>
        }
      >
        <div className="sched-confirm">
          <span className="body">{T.clearConfirm}</span>
          <span className="hint">{extra.perWeek(lessons.length)}</span>
        </div>
      </Dialog>
    </Page>
  );
}
