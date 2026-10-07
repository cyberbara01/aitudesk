// Settings → «Напоминания»: Windows notifications before lessons and note deadlines, shown by the app itself
// (src-tauri/src/reminders.rs reads settings.reminders once a minute). «Пары»: on or off and how long before
// the start; «Дедлайны заметок»: on or off, the first reminder, repeats until the deadline, one at the deadline
// and a live example of what that gives; «Общее»: sound, quiet hours, a test notification; the section reset.
// Every timing is a list of ready values plus «Свой вариант», which reads as a phrase («За [2] [дня] до
// дедлайна») and is saved as soon as it is valid.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { autostartChanged } from "../lib/autostart";
import { Button } from "../components/Button";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Select, type SelectOption } from "../components/Select";
import { Switch } from "../components/Switch";
import { TextField } from "../components/TextField";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.reminders";
import { formatTime, parseTime } from "../lib/design";
import { maskTime, normalizeTime, reminderOffsets, repeatsHappen, type DeadlineTiming } from "../lib/notes";
import { DEFAULT_START } from "../lib/schedule";
import { settings, type Lesson, type ReminderSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useTransient } from "./shell/hooks";
import { useNavigate } from "./shell/nav";

const L = extra.lessons;
const D = extra.deadlines;
const X = extra.example;
const G = extra.general;

const DAY = 24 * 60;

/** Ready values, minutes. The ranges of an own value are the clamps of normalize() in src/lib/settings.ts. */
const LESSON_PRESETS: readonly number[] = [0, 5, 10, 15, 20, 30, 45, 60];
const FIRST_PRESETS: readonly number[] = [0, 15, 30, 60, 180, 360, 720, 1440, 2880, 4320, 10080];
const REPEAT_PRESETS: readonly number[] = [0, 15, 30, 60, 180, 360, 1440];

type Unit = keyof typeof extra.units;
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: DAY };
const MINUTES_ONLY: readonly Unit[] = ["minutes"];
const ANY_UNIT: readonly Unit[] = ["minutes", "hours", "days"];

/** Select value of «Свой вариант» (the ready values are minutes as text). */
const CUSTOM = "custom";

/** The example deadline under «Дедлайны заметок»: Friday (0 = Monday) at 18:00. */
const EXAMPLE_DAY = 4;
const EXAMPLE_TIME = 18 * 60;

/** Minutes since midnight of any minute count, also before a day starts (-10 is 23:50). */
const ofDay = (minutes: number) => ((minutes % DAY) + DAY) % DAY;

type QuietSettings = Pick<ReminderSettings, "quiet" | "quietFrom" | "quietTo">;

/** Quiet hours as minutes since midnight, or null while they are off, invalid or empty (equal ends). */
function quietRange({ quiet, quietFrom, quietTo }: QuietSettings): { from: number; to: number } | null {
  const from = parseTime(quietFrom);
  const to = parseTime(quietTo);
  return quiet && from !== null && to !== null && from !== to ? { from, to } : null;
}

/** A minute of the day inside the quiet hours (they may wrap past midnight), as quiet_now in reminders.rs. */
function inQuiet(minute: number, { from, to }: { from: number; to: number }): boolean {
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

// ---------------------------------------------------------------------------------------------
// Ready values plus «Свой вариант»
// ---------------------------------------------------------------------------------------------

interface Draft {
  /** Digits as typed. */
  text: string;
  unit: Unit;
}

/** An own value as a person would type it: the largest unit that divides it («2 дня», «36 часов», «90 минут»). */
function draftOf(minutes: number, units: readonly Unit[], min: number): Draft {
  if (minutes < min) return { text: "", unit: units.includes("hours") ? "hours" : units[0] };
  const unit = [...units].reverse().find((u) => minutes > 0 && minutes % UNIT_MINUTES[u] === 0) ?? units[0];
  return { text: String(minutes / UNIT_MINUTES[unit]), unit };
}

function totalOf(d: Draft): number | null {
  return /^\d+$/.test(d.text) ? Number(d.text) * UNIT_MINUTES[d.unit] : null;
}

interface MinutesChoiceProps {
  label: string;
  hint?: string;
  /** Stored minutes. */
  value: number;
  presets: readonly number[];
  presetLabel: (minutes: number) => string;
  /** Range of an own value, minutes, and the message shown outside it. */
  min: number;
  max: number;
  range: string;
  /** Units an own value can be typed in; one unit is shown as a word, several as a choice. */
  units: readonly Unit[];
  /** The own value reads as a phrase: «{lead} [N] {unit} {tail}». */
  lead: string;
  tail?: string;
  /** Accessible name of the number field. */
  fieldLabel: string;
  disabled: boolean;
  onChange: (minutes: number) => void;
}

/**
 * A timing row: a list of ready values and «Свой вариант». The own value is edited in a phrase under the row
 * and written as soon as it is valid; picking «Свой вариант» keeps the stored value until the number changes.
 */
function MinutesChoice({ label, hint, value, presets, presetLabel, min, max, range, units, lead, tail, fieldLabel, disabled, onChange }: MinutesChoiceProps) {
  const [custom, setCustom] = useState(() => !presets.includes(value));
  const [draft, setDraft] = useState<Draft>(() => draftOf(value, units, min));
  const [touched, setTouched] = useState(false);
  /** «Свой вариант» was just picked: the number field takes the focus as it appears. */
  const [focus, setFocus] = useState(false);
  /** The value written here last. Any other value came from elsewhere (the section reset, another window). */
  const written = useRef(value);

  useEffect(() => {
    if (value === written.current) return;
    written.current = value;
    setCustom(!presets.includes(value));
    setDraft(draftOf(value, units, min));
    setTouched(false);
    setFocus(false);
  }, [value, presets, units, min]);

  const options = useMemo<readonly SelectOption<string>[]>(
    () => [...presets.map((m) => ({ value: String(m), label: presetLabel(m) })), { value: CUSTOM, label: ru.common.custom }],
    [presets, presetLabel],
  );

  const write = (minutes: number) => {
    written.current = minutes;
    onChange(minutes);
  };

  const pick = (v: string) => {
    if (v !== CUSTOM) {
      setCustom(false);
      write(Number(v));
      return;
    }
    setCustom(true);
    setDraft(draftOf(value, units, min));
    setTouched(false);
    setFocus(true);
  };

  const total = totalOf(draft);
  const valid = total !== null && total >= min && total <= max;

  const edit = (next: Draft) => {
    setDraft(next);
    const t = totalOf(next);
    if (t !== null && t >= min && t <= max && t !== written.current) write(t);
  };

  // Up and Down step the number, as in a spin box.
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const n = (Number(draft.text) || 0) + (e.key === "ArrowUp" ? 1 : -1);
    if (n >= 0) edit({ ...draft, text: String(n) });
  };

  const onBlur = () => {
    setTouched(true);
    if (valid && draft.text !== String(Number(draft.text))) setDraft((d) => ({ ...d, text: String(Number(d.text)) }));
  };

  const count = Number(draft.text) || 0;
  const unitOptions: readonly SegmentedOption<Unit>[] = units.map((u) => ({ value: u, label: extra.units[u](count) }));
  const showError = !valid && (touched || draft.text !== "");

  return (
    <>
      <Row label={label} hint={hint}>
        <fieldset className="rem-fieldset" disabled={disabled}>
          <Select className="rem-select" options={options} value={custom ? CUSTOM : String(value)} onChange={pick} ariaLabel={label} />
        </fieldset>
      </Row>
      {custom && (
        <div className="row rem-sub">
          <fieldset className="rem-fieldset" disabled={disabled}>
            <div className="rem-phrase">
              <span className="rem-word">{lead}</span>
              <TextField
                className={showError ? "rem-number error" : "rem-number"}
                inputClassName="num"
                value={draft.text}
                onChange={(v) => edit({ ...draft, text: v.replace(/\D/g, "").slice(0, 5) })}
                onBlur={onBlur}
                onKeyDown={onKey}
                maxLength={5}
                ariaLabel={fieldLabel}
                autoFocus={focus}
              />
              {units.length > 1 ? (
                <>
                  <Segmented<Unit> options={unitOptions} value={draft.unit} onChange={(unit) => edit({ ...draft, unit })} ariaLabel={D.unit} />
                  {tail && <span className="rem-word">{tail}</span>}
                </>
              ) : (
                // One unit is a plain word: it and the tail are one run of text with an ordinary space.
                <span className="rem-word">{tail ? `${extra.units[draft.unit](count)} ${tail}` : extra.units[draft.unit](count)}</span>
              )}
            </div>
          </fieldset>
          {showError && (
            <span className="row-hint error" role="alert">
              {range}
            </span>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------------------------

/** One end of the quiet hours: the «ЧЧ:ММ» mask while typing, written as soon as it is a valid time. */
function useTimeField(stored: string, save: (time: string) => void) {
  const [text, setText] = useState(stored);
  const [touched, setTouched] = useState(false);

  // Changed elsewhere (the section reset, another window): show it, unless it is what is being typed here.
  useEffect(() => setText((cur) => (normalizeTime(cur) === stored ? cur : stored)), [stored]);

  const time = normalizeTime(text);
  return {
    text,
    time,
    bad: time === null && (touched || text.length >= 5),
    onChange: (typed: string) => {
      const masked = maskTime(text, typed);
      setText(masked);
      const t = normalizeTime(masked);
      if (t && t !== stored) save(t);
    },
    // «8:30» becomes «08:30» once the field is left.
    onBlur: () => {
      if (time && time !== text) setText(time);
      setTouched(true);
    },
  };
}

/**
 * «С [23:00] до [08:00]» under the «Тихие часы» switch, then one line: what is wrong, or how long they last;
 * and how many lesson reminders a week fall into them (they come silently, which matters before a morning
 * lesson). `silenced` is counted by the page from the stored values.
 */
function QuietRange({ r, silenced }: { r: ReminderSettings; silenced: number }) {
  const from = useTimeField(r.quietFrom, (quietFrom) => void settings.updateReminders({ quietFrom }));
  const to = useTimeField(r.quietTo, (quietTo) => void settings.updateReminders({ quietTo }));

  let note = null;
  if (from.bad || to.bad) {
    note = (
      <span className="row-hint error" role="alert">
        {ru.schedule.invalidTime}
      </span>
    );
  } else if (from.time && to.time) {
    const a = parseTime(from.time) ?? 0;
    const b = parseTime(to.time) ?? 0;
    const minutes = ofDay(b - a);
    const duration = G.duration(Math.floor(minutes / 60), minutes % 60);
    note =
      a === b ? (
        <span className="row-hint rem-caution">{G.same}</span>
      ) : (
        <span className="row-hint">{a < b ? G.daily(duration) : G.overnight(duration)}</span>
      );
  }

  return (
    <div className="row rem-sub">
      <fieldset className="rem-fieldset" disabled={!r.quiet}>
        <div className="rem-phrase">
          <span className="rem-word">{G.from}</span>
          <TextField
            className={from.bad ? "rem-time error" : "rem-time"}
            inputClassName="num"
            value={from.text}
            onChange={from.onChange}
            onBlur={from.onBlur}
            placeholder={G.timePlaceholder}
            maxLength={5}
            ariaLabel={G.fromLabel}
          />
          <span className="rem-word">{G.to}</span>
          <TextField
            className={to.bad ? "rem-time error" : "rem-time"}
            inputClassName="num"
            value={to.text}
            onChange={to.onChange}
            onBlur={to.onBlur}
            placeholder={G.timePlaceholder}
            maxLength={5}
            ariaLabel={G.toLabel}
          />
        </div>
      </fieldset>
      {note}
      {silenced > 0 && <span className="row-hint rem-caution">{G.lessonsQuiet(silenced)}</span>}
    </div>
  );
}

/** Lesson reminders a week that come during the quiet hours. */
function lessonsInQuiet(lessons: readonly Lesson[], before: number, quiet: QuietSettings): number {
  const range = quietRange(quiet);
  if (!range) return 0;
  let n = 0;
  for (const l of lessons) {
    const start = parseTime(l.start);
    if (start !== null && inQuiet(ofDay(start - before), range)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Live examples
// ---------------------------------------------------------------------------------------------

/** «Например, для пары в 08:00 уведомление придёт в 07:50» for the earliest lesson of the week. */
function lessonExample(lessons: readonly Lesson[], before: number): string {
  if (before === 0) return L.beforeHintStart;
  let start: number | null = null;
  for (const l of lessons) {
    const t = parseTime(l.start);
    if (t !== null && (start === null || t < start)) start = t;
  }
  start ??= parseTime(DEFAULT_START) ?? 8 * 60;
  const at = start - before;
  return at >= 0 ? L.beforeHint(formatTime(start), formatTime(at)) : L.beforeHintEve(formatTime(start), formatTime(ofDay(at)));
}

type ExampleSettings = DeadlineTiming & QuietSettings;

interface DeadlineExample {
  text: string;
  /** «Всего 9 уведомлений, из них 3 в тихие часы»; null when nothing comes. */
  count: string | null;
}

/** What the deadline settings give for a deadline on Friday at 18:00 (the same rules as reminders.rs). */
function deadlineExample(r: ExampleSettings): DeadlineExample {
  const offsets = reminderOffsets(r);
  if (offsets.length === 0) return { text: X.none, count: null };

  const weekdays = ru.schedule.weekdaysAt;
  const dueTime = formatTime(EXAMPLE_TIME);
  const deadline = X.dayTime(weekdays[EXAMPLE_DAY], dueTime);
  let text: string;
  if (r.deadlineFirst === 0) {
    text = X.only(deadline, dueTime);
  } else {
    // Minutes from Monday 00:00 of the deadline's week; earlier weeks are negative.
    const first = EXAMPLE_DAY * DAY + EXAMPLE_TIME - r.deadlineFirst;
    const day = Math.floor(first / DAY);
    const daysBefore = EXAMPLE_DAY - day;
    const time = formatTime(ofDay(first));
    // From a week ahead on the weekday says nothing (the deadline's own weekday comes round again), so the
    // span is named instead.
    let firstText: string;
    if (daysBefore >= 7) firstText = X.early(r.deadlineFirst);
    else if (daysBefore === 0) firstText = X.time(time);
    else firstText = X.dayTime(weekdays[((day % 7) + 7) % 7], time);
    const repeat = repeatsHappen(r) ? X.every(r.deadlineRepeat) : null;
    const at = r.atDeadline ? (daysBefore === 0 ? X.time(dueTime) : X.timeOnDay(dueTime, weekdays[EXAMPLE_DAY])) : null;
    text = X.text(deadline, firstText, repeat, at);
  }

  const n = offsets.length;
  const quiet = quietRange(r);
  let q = 0;
  if (quiet) for (const off of offsets) if (inQuiet(ofDay(EXAMPLE_TIME - off), quiet)) q++;
  const count = X.total(n) + (q === 0 ? "" : q === n ? X.quietAll(n) : X.quietSome(q));
  return { text, count };
}

// ---------------------------------------------------------------------------------------------

type Outcome = "idle" | "done" | "failed";

/** Result of an action, next to its button. A polite live region that stays mounted (empty while idle). */
function ResultText({ outcome, done, failed }: { outcome: Outcome; done: string; failed: string }) {
  const cls = outcome === "done" ? "status-text ok" : outcome === "failed" ? "status-text fail" : "status-text";
  return (
    <span className={cls} role="status">
      {outcome === "done" ? done : outcome === "failed" ? failed : ""}
    </span>
  );
}

/**
 * Autostart, read when the page opens. Reminders come only while the app runs: with autostart off they stop
 * after a restart, so the page says so and offers to switch it on (the same switch as in «Общие»).
 */
function useAutostart(): [boolean | null, () => void] {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    isEnabled().then(
      (v) => alive && setOn(v),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  const turnOn = () => {
    enable().then(
      () => {
        setOn(true);
        autostartChanged(true);
      },
      () => undefined,
    );
  };
  return [on, turnOn];
}

export function RemindersPage() {
  const s = useSettings();
  const [autostart, enableAutostart] = useAutostart();
  const r = s.reminders;
  const lessons = s.schedule.lessons;
  const navigate = useNavigate();
  const [tested, flashTested] = useTransient<Outcome>("idle", 4000);
  const update = (p: Partial<ReminderSettings>) => void settings.updateReminders(p);

  const hasDeadlines = s.notes.notes.some((n) => !n.done && n.deadline !== undefined);
  // Keyed on the fields used, so the examples are recomputed only when one of them changes.
  const { lessonBefore, deadlineFirst, deadlineRepeat, atDeadline, quiet, quietFrom, quietTo } = r;
  const lessonHint = useMemo(() => lessonExample(lessons, lessonBefore), [lessons, lessonBefore]);
  const example = useMemo(
    () => deadlineExample({ deadlineFirst, deadlineRepeat, atDeadline, quiet, quietFrom, quietTo }),
    [deadlineFirst, deadlineRepeat, atDeadline, quiet, quietFrom, quietTo],
  );
  const silenced = useMemo(
    () => (r.lessons ? lessonsInQuiet(lessons, lessonBefore, { quiet, quietFrom, quietTo }) : 0),
    [r.lessons, lessons, lessonBefore, quiet, quietFrom, quietTo],
  );

  let repeatHint: string = D.repeatHint;
  if (deadlineFirst === 0) repeatHint = D.repeatNoFirst;
  else if (deadlineRepeat > 0 && !repeatsHappen(r)) repeatHint = D.repeatNever;

  const test = () => {
    invoke("test_reminder").then(
      () => flashTested("done"),
      () => flashTested("failed"),
    );
  };

  return (
    <Page title={ru.settings.nav.reminders} description={extra.pageDesc}>
      {autostart === false && (r.lessons || r.deadlines) && (
        <Section>
          <Row label={G.autostartOff} hint={G.autostartOffHint}>
            <Button icon="power" onClick={enableAutostart}>
              {G.autostartOn}
            </Button>
          </Row>
        </Section>
      )}
      <Section title={L.title} description={L.desc} className="rem-section">
        <Row label={L.on} hint={s.schedule.privacy ? L.onHintPrivate : L.onHint}>
          <Switch checked={r.lessons} onChange={(v) => update({ lessons: v })} ariaLabel={L.on} />
        </Row>
        <MinutesChoice
          label={L.before}
          hint={lessonHint}
          value={r.lessonBefore}
          presets={LESSON_PRESETS}
          presetLabel={L.preset}
          min={0}
          max={180}
          range={L.range}
          units={MINUTES_ONLY}
          lead={L.customLead}
          tail={L.customTail}
          fieldLabel={L.customLabel}
          disabled={!r.lessons}
          onChange={(m) => update({ lessonBefore: m })}
        />
        {lessons.length === 0 && (
          <Row label={L.empty} hint={L.emptyHint}>
            <Button icon="calendar_ltr" onClick={() => navigate("schedule")}>
              {L.open}
            </Button>
          </Row>
        )}
      </Section>

      <Section title={D.title} description={D.desc} className="rem-section">
        <Row label={D.on} hint={s.notes.privacy ? D.onHintPrivate : D.onHint}>
          <Switch checked={r.deadlines} onChange={(v) => update({ deadlines: v })} ariaLabel={D.on} />
        </Row>
        <MinutesChoice
          label={D.first}
          value={r.deadlineFirst}
          presets={FIRST_PRESETS}
          presetLabel={D.firstPreset}
          min={1}
          max={20160}
          range={D.firstRange}
          units={ANY_UNIT}
          lead={D.firstLead}
          tail={D.firstTail}
          fieldLabel={D.firstLabel}
          disabled={!r.deadlines}
          onChange={(m) => update({ deadlineFirst: m })}
        />
        <MinutesChoice
          label={D.repeat}
          hint={repeatHint}
          value={r.deadlineRepeat}
          presets={REPEAT_PRESETS}
          presetLabel={D.repeatPreset}
          min={1}
          max={10080}
          range={D.repeatRange}
          units={ANY_UNIT}
          lead={D.repeatLead}
          fieldLabel={D.repeatLabel}
          disabled={!r.deadlines || r.deadlineFirst === 0}
          onChange={(m) => update({ deadlineRepeat: m })}
        />
        <Row label={D.at} hint={D.atHint}>
          <Switch checked={r.atDeadline} disabled={!r.deadlines} onChange={(v) => update({ atDeadline: v })} ariaLabel={D.at} />
        </Row>
        {r.deadlines && (
          <div className="row rem-example">
            <div className="rem-example-box" role="status">
              <span className="rem-example-text">{example.text}</span>
              {example.count && <span className="rem-example-count">{example.count}</span>}
            </div>
          </div>
        )}
        {!hasDeadlines && (
          <Row label={D.empty} hint={D.emptyHint}>
            <Button icon="note" onClick={() => navigate("notes")}>
              {D.open}
            </Button>
          </Row>
        )}
      </Section>

      <Section title={G.title} description={G.desc} className="rem-section">
        <Row label={G.sound} hint={G.soundHint}>
          <Switch checked={r.sound} onChange={(v) => update({ sound: v })} ariaLabel={G.sound} />
        </Row>
        <Row label={G.quiet} hint={G.quietHint}>
          <Switch checked={r.quiet} onChange={(v) => update({ quiet: v })} ariaLabel={G.quiet} />
        </Row>
        <QuietRange r={r} silenced={silenced} />
        <Row label={G.test} hint={G.testHint} stack>
          <span className="inline">
            <Button icon="alert" onClick={test}>
              {G.testButton}
            </Button>
            <ResultText outcome={tested} done={G.testDone} failed={G.testFailed} />
          </span>
        </Row>
      </Section>

      <ResetSection section="reminders" text={extra.resetText} />
    </Page>
  );
}
