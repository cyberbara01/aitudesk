// English for src/i18n/ru.extra.notes.ts. Dates read «Fri, 10 Oct, 18:00» (day before month, as en-GB).
import { pluralEn } from "../lang";
import type { NotesStrings } from "../ru.extra.notes";

const notesCount = (n: number) => `${n} ${pluralEn(n, "note", "notes")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const en: NotesStrings = {
  tile: {
    empty: "No notes",
    emptyHint: "Your tasks and deadlines will appear here",
    allDone: "All done",
    allDoneHint: "Completed notes are hidden",
    add: "Add note",
    markDone: "Mark as done",
    markUndone: "Mark as not done",
  },

  countdown: {
    in: (rest: string) => `in ${rest}`,
    now: "now",
    overdue: (rest: string) => `${rest} overdue`,
    days: (n: number) => `${n} d`,
    hours: (n: number) => `${n} h`,
    minutes: (n: number) => `${n} min`,
  },

  dates: {
    today: "today",
    tomorrow: "tomorrow",
    yesterday: "yesterday",
    weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    weekdaysLong: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    monthsGenitive: MONTHS,
    monthsNominative: MONTHS,
  },

  page: {
    desc: "Short tasks and deadlines. The widget shows your notes and counts down to each deadline",
    list: "All notes",
    sort: "Sort order",
    sortHint: "The widget uses the same order",
    sorts: {
      deadline: "By deadline",
      newest: "Newest first",
      oldest: "Oldest first",
    },
    noReminders: "No deadline reminders",
    summary: (active: number, done: number) => {
      if (active === 0) return `All done: ${notesCount(done)}`;
      if (done === 0) return `${active} to do`;
      return `${active} to do, ${done} done`;
    },
    noDeadline: "no deadline",
    emptyTitle: "No notes yet",
    emptyHint: "Add the first one, and it appears on the widget right away",
    options: "Display",
    showDone: "Show completed notes",
    showDoneHint: "Completed notes stay on the widget: dimmed, at the end of the list",
    background: "Widget background",
    backgroundHint: "Without the background the list sits right on the wallpaper",
  },

  editor: {
    newNote: "New note",
    editNote: "Edit note",
    text: "Text",
    textPlaceholder: "What needs to be done?",
    saveHint: "Ctrl+Enter to save",
    counter: (n: number, max: number) => `${n} of ${max}`,
    deadline: "Deadline",
    deadlineHint: "The widget shows how much time is left",
    date: "Date",
    time: "Time",
    timePlaceholder: "HH:MM",
    quick: "Quick pick",
    tonight: "Tonight",
    tomorrowMorning: "Tomorrow morning",
    inWeek: "In a week",
    past: "This time has already passed, so the note will be overdue right away",
    remind: "Remind me about the deadline",
    remindOff: "There will be no notifications about this note",
    remindPlan: (plan: string, section: string) => `${plan}, as set in “${section}”`,
    remindGlobalOff: (section: string) => `Deadline reminders are turned off in “${section}” now`,
    remindNothing: (section: string) => `“${section}” has no time chosen for deadline reminders`,
    color: "Mark color",
    colorHint: "A dot next to the note on the widget",
    noColor: "No color",
    ownColor: "Custom color",
  },

  calendar: {
    placeholder: "Pick a date",
    label: "Date picker",
    prevMonth: "Previous month",
    nextMonth: "Next month",
  },
};
