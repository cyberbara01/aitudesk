// Settings → «Календарь»: a live preview, the view (today's mark, week numbers, nearby days, the deadline dots, the
// background), the title (its style and where it stands), the day line (its date style and where it stands), the
// calendar's own colours (today, weekends, the dots), the colours of its text and icons, and the section's reset.
import { useMemo, useState } from "react";
import { ColorPicker } from "../components/ColorPicker";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Select, type SelectOption } from "../components/Select";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.calendar";
import { ACCENT_PRESETS } from "../lib/design";
import { widgetInk } from "../lib/ink";
import {
  CALENDAR_DAYS,
  CALENDAR_TITLES,
  CALENDAR_TODAY,
  settings,
  type CalendarAlign,
  type CalendarDay,
  type CalendarSettings,
  type CalendarTint,
  type CalendarTitle,
  type CalendarToday,
} from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { CalendarView, dayOf, titleOf } from "../tiles/Calendar";
import { InkWidgetSection } from "./InkSection";
import { useDebounced, useRootAttribute } from "./shell/hooks";

const x = extra;
/** The same three as the clock's alignment. */
const ALIGN_OPTIONS: readonly SegmentedOption<CalendarAlign>[] = [
  { value: "left", label: ru.common.left, icon: "text_align_left" },
  { value: "center", label: ru.common.center, icon: "text_align_center" },
  { value: "right", label: ru.common.right, icon: "text_align_right" },
];
const TODAY_OPTIONS: readonly SegmentedOption<CalendarToday>[] = CALENDAR_TODAY.map((t) => ({ value: t, label: x.todayStyles[t] }));
const TODAY_TINTS: readonly SegmentedOption<"accent" | "custom">[] = [
  { value: "accent", label: x.tints.accent },
  { value: "custom", label: x.tints.custom },
];
const WEEKEND_TINTS: readonly SegmentedOption<CalendarTint>[] = [
  { value: "text", label: x.tints.text },
  { value: "accent", label: x.tints.accent },
  { value: "custom", label: x.tints.custom },
];

const update = (p: Partial<CalendarSettings>) => void settings.update((cur) => ({ calendar: { ...cur.calendar, ...p } }));

/** A colour row: what it follows (the accent, the text) or a colour of one's own with its picker under it. */
function TintRow<T extends string>({
  label,
  options,
  mode,
  color,
  onChange,
}: {
  label: string;
  options?: readonly SegmentedOption<T>[];
  mode: T | "custom";
  color: string;
  onChange: (mode: T | "custom", color: string) => void;
}) {
  const scheme = useRootAttribute("data-scheme") === "light" ? "light" : "dark";
  const swatches = ACCENT_PRESETS.map((p) => p[scheme]);
  // The picker answers at once, the widget after a short pause.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = useDebounced((hex: string) => {
    onChange("custom", hex);
    setDraft(null);
  }, 120);
  return (
    <div className="row stack">
      <div className="row-text">
        <span className="row-label">{label}</span>
      </div>
      <div className="row-control ink-control">
        {options && <Segmented options={options} value={mode as T} onChange={(m) => onChange(m, color)} fill ariaLabel={label} />}
        {(mode === "custom" || !options) && (
          <div className="ink-picker">
            <ColorPicker
              value={draft ?? color}
              swatches={swatches}
              onChange={(hex) => {
                setDraft(hex);
                commit(hex);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const all = useSettings();
  const c = all.calendar;
  // The styles are shown on today's date, as the clock shows its date styles.
  const { titleOptions, dayOptions } = useMemo(() => {
    const now = new Date();
    return {
      titleOptions: CALENDAR_TITLES.map((title): SegmentedOption<CalendarTitle> => ({ value: title, label: titleOf({ title }, now.getMonth(), now.getFullYear()) })),
      dayOptions: CALENDAR_DAYS.map((dayFormat): SelectOption<CalendarDay> => ({ value: dayFormat, label: dayOf({ dayFormat }, now) })),
    };
  }, []);
  return (
    <Page title={ru.settings.nav.calendar} description={x.pageDesc}>
      <div className="sys-stage">
        <div className="sys-stage-head">
          <span className="body-strong">{x.preview}</span>
        </div>
        <div className="sys-desk">
          <div className={c.background ? "tile tile-calendar cal-preview" : "tile tile-calendar cal-preview no-bg"} {...widgetInk(all, "calendar")}>
            <CalendarView s={all} />
          </div>
        </div>
      </div>

      <Section title={x.view}>
        <Row label={x.todayStyle}>
          <Segmented options={TODAY_OPTIONS} value={c.today} onChange={(today) => update({ today })} ariaLabel={x.todayStyle} />
        </Row>
        <Row label={x.weekNumbers} hint={x.weekNumbersHint}>
          <Switch checked={c.weekNumbers} onChange={(weekNumbers) => update({ weekNumbers })} ariaLabel={x.weekNumbers} />
        </Row>
        <Row label={x.otherDays} hint={x.otherDaysHint}>
          <Switch checked={c.otherDays} onChange={(otherDays) => update({ otherDays })} ariaLabel={x.otherDays} />
        </Row>
        <Row label={x.deadlines} hint={x.deadlinesHint}>
          <Switch checked={c.deadlines} onChange={(deadlines) => update({ deadlines })} ariaLabel={x.deadlines} />
        </Row>
        <Row label={x.background} hint={x.backgroundHint}>
          <Switch checked={c.background} onChange={(background) => update({ background })} ariaLabel={x.background} />
        </Row>
      </Section>

      <Section title={x.titleSection}>
        <Row label={x.titleFormat} stack>
          <Segmented options={titleOptions} value={c.title} onChange={(title) => update({ title })} fill ariaLabel={x.titleFormat} />
        </Row>
        <Row label={ru.common.alignment} stack>
          <Segmented options={ALIGN_OPTIONS} value={c.titleAlign} onChange={(titleAlign) => update({ titleAlign })} fill ariaLabel={ru.common.alignment} />
        </Row>
      </Section>

      <Section title={x.dayLine} description={x.dayLineHint}>
        <Row label={x.dayLineShow}>
          <Switch checked={c.dayLine} onChange={(dayLine) => update({ dayLine })} ariaLabel={x.dayLineShow} />
        </Row>
        {c.dayLine && (
          <>
            <Row label={x.dayFormat}>
              <Select className="cal-day-select" options={dayOptions} value={c.dayFormat} onChange={(dayFormat) => update({ dayFormat })} ariaLabel={x.dayFormat} />
            </Row>
            <Row label={ru.common.alignment} stack>
              <Segmented options={ALIGN_OPTIONS} value={c.dayAlign} onChange={(dayAlign) => update({ dayAlign })} fill ariaLabel={ru.common.alignment} />
            </Row>
          </>
        )}
      </Section>

      <Section title={x.colors} description={x.colorsHint}>
        <TintRow
          label={x.todayColor}
          options={TODAY_TINTS}
          mode={c.todayColor.mode}
          color={c.todayColor.color}
          onChange={(mode, color) => update({ todayColor: { mode: mode as "accent" | "custom", color } })}
        />
        <TintRow
          label={x.weekendColor}
          options={WEEKEND_TINTS}
          mode={c.weekendColor.mode}
          color={c.weekendColor.color}
          onChange={(mode, color) => update({ weekendColor: { mode, color } })}
        />
        <TintRow
          label={x.deadlineColor}
          options={TODAY_TINTS}
          mode={c.deadlineColor.mode}
          color={c.deadlineColor.color}
          onChange={(mode, color) => update({ deadlineColor: { mode: mode as "accent" | "custom", color } })}
        />
      </Section>

      <InkWidgetSection widget="calendar" />

      <ResetSection section="calendar" />
    </Page>
  );
}
