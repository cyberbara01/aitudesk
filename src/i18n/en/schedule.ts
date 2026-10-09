// English for src/i18n/ru.extra.schedule.ts.
import { pluralEn } from "../lang";
import type { ScheduleStrings } from "../ru.extra.schedule";

/** Non-breaking space: keeps «at» with its time on one line. */
const NBSP = String.fromCharCode(0xa0);

const lessonsWord = (n: number) => pluralEn(n, "class", "classes");
const lessonsCount = (n: number) => `${n} ${lessonsWord(n)}`;

export const en: ScheduleStrings = {
  emptyTitle: "The schedule is empty",
  emptyHint: "Add your classes, and the widget will show the current one and the next",
  startsIn: (m: number) => (m < 60 ? `in ${m} min` : m % 60 === 0 ? `in ${m / 60} h` : `in ${Math.floor(m / 60)} h ${m % 60} min`),
  tomorrow: "tomorrow",
  showOnMap: "Show on the map",
  editLesson: "Edit class",
  nextLesson: (when: string, time: string) => `Next class ${when.replace(/ /g, NBSP)} at${NBSP}${time}`,

  pageDesc:
    "Your classes by day of the week. The widget shows the chosen day, highlights the current class and tells you when the next one starts",
  perWeek: (n: number) => (n === 0 ? "No classes yet" : `${lessonsCount(n)} a week`),
  lessonsCount,
  lessonsWord,
  dayEmpty: "No classes on this day",
  noLessonsShort: "no classes",
  dayEmptyHint: "Add the first class, and it appears on the widget right away",
  dayHiddenHint: "This day is hidden on the widget now. It appears there as soon as you add a class",
  showEmptyDays: "Show days without classes",
  showEmptyDaysHint:
    "If you turn it off, the widget keeps only the days with classes, and on a free day it opens the nearest day with classes",
  showWeekendHint: "Sat and Sun always stay in the row of days. If you turn it off, a weekend day shows only when it has classes",
  showWeekendOffHint: "Has no effect while days without classes are hidden",
  followTodayHint: "At midnight the widget goes back to today, even if you opened another day",
  backgroundHint: "Without the background the list sits right on the wallpaper",
  clearHint: "Deletes all classes from the schedule. This can't be undone",
  clearShort: "Clear",
  clearTitle: "Clear the schedule?",
  clearText: "All classes will be deleted from the schedule. This can't be undone.",
  inSchedule: (n: number) => `The schedule has ${lessonsCount(n)} now`,

  colorAccent: "Accent",
  colorOwn: "Custom color",
  colorHint: "The bar to the left of the class and the “Now” label",
  overlaps: (title: string, range: string) => `Overlaps with “${title}” (${range})`,
  roomHint: "For example, C1.2.223 or 223. Click the room on the widget, and the map shows it",
  endAfterStart: "The end must be later than the start",
  previewHint: "This is how the class will look on the widget",
};
