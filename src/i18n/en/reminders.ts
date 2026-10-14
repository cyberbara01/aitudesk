// English for src/i18n/ru.extra.reminders.ts. Phrases with a number field read «[25] minutes before the start»,
// so the words before the field (the «lead») are empty where Russian has «За».
import { pluralEn } from "../lang";
import type { RemindersStrings } from "../ru.extra.reminders";

const DAY = 24 * 60;
const WEEK = 7 * DAY;

/** Units after a number: «1 minute», «2 hours», «5 days». */
const units = {
  minutes: (n: number) => pluralEn(n, "minute", "minutes"),
  hours: (n: number) => pluralEn(n, "hour", "hours"),
  days: (n: number) => pluralEn(n, "day", "days"),
};

/** A span of time: «15 minutes», «1 hour», «3 hours», «2 days», «a week», «2 weeks». */
function span(minutes: number): string {
  if (minutes % WEEK === 0) {
    const n = minutes / WEEK;
    return n === 1 ? "a week" : `${n} weeks`;
  }
  if (minutes % DAY === 0) return `${minutes / DAY} ${units.days(minutes / DAY)}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${units.hours(minutes / 60)}`;
  return `${minutes} ${units.minutes(minutes)}`;
}

/** A repeat interval: «every 15 minutes», «every hour», «every 3 hours», «once a day», «every 2 days», «once a week». */
function every(minutes: number): string {
  if (minutes === WEEK) return "once a week";
  if (minutes % DAY === 0) {
    const n = minutes / DAY;
    return n === 1 ? "once a day" : `every ${n} days`;
  }
  if (minutes % 60 === 0) {
    const n = minutes / 60;
    return n === 1 ? "every hour" : `every ${n} hours`;
  }
  return minutes === 1 ? "every minute" : `every ${minutes} minutes`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the settings give for one deadline: «1 day before, then every 3 hours and at the deadline». */
export function deadlinePlanEn(first: number, repeat: number, atDeadline: boolean): string {
  const parts: string[] = [];
  if (first > 0) parts.push(`${span(first)} before${repeat > 0 ? `, then ${every(repeat)}${atDeadline ? "" : " until the deadline"}` : ""}`);
  if (atDeadline) parts.push("at the deadline");
  return cap(parts.join(" and "));
}

export const en: RemindersStrings = {
  pageDesc: "Windows notifications before classes and note deadlines. Choose here when and how often they come",

  units,

  lessons: {
    title: "Classes",
    desc: "Before every class in the schedule",
    on: "Remind me about classes",
    onHint: "The notification shows the class name and the room",
    onHintPrivate: "The schedule hides its content, so the notification won't show the class name or the room",
    before: "How long before the start",
    preset: (m: number) => (m === 0 ? "When the class starts" : cap(span(m))),
    beforeHint: (lesson: string, at: string) => `For example, for a class at ${lesson} the notification comes at ${at}`,
    beforeHintEve: (lesson: string, at: string) => `For example, for a class at ${lesson} the notification comes the day before at ${at}`,
    beforeHintStart: "The notification comes when the class starts",
    customLead: "",
    customTail: "before the start",
    customLabel: "Minutes before the class starts",
    range: "From 0 to 180 minutes",
    empty: "No classes in the schedule yet",
    emptyHint: "Reminders start as soon as you add classes",
    open: "Open the schedule",
  },

  deadlines: {
    title: "Note deadlines",
    desc: "For notes with a deadline that aren't done yet. You can turn reminders off for a single note in its editor",
    on: "Remind me about deadlines",
    onHint: "The notification shows the first line of the note",
    onHintPrivate: "The notes hide their content, so the notification won't show the note text",
    first: "First reminder",
    firstPreset: (m: number) => (m === 0 ? "No early reminder" : `${cap(span(m))} before`),
    firstLead: "",
    firstTail: "before the deadline",
    firstLabel: "First reminder lead time",
    firstRange: "From 1 minute to 14 days",
    repeat: "Repeat",
    repeatHint: "After the first reminder and until the deadline",
    repeatNoFirst: "Repeats follow the first reminder, and none is chosen",
    repeatNever: "The interval is not shorter than the time from the first reminder to the deadline, so there will be no repeats",
    repeatPreset: (m: number) => (m === 0 ? "Don't repeat" : cap(every(m))),
    repeatLead: "Every",
    repeatTail: "",
    repeatLabel: "Repeat interval",
    repeatRange: "From 1 minute to 7 days",
    unit: "Time unit",
    at: "At the deadline",
    atHint: "One more notification when the time comes",
    empty: "No notes with a deadline yet",
    emptyHint: "Give a note a deadline, and a reminder will come about it",
    open: "Open notes",
  },

  example: {
    dayTime: (day: string, time: string) => `${day} at ${time}`,
    time: (time: string) => `at ${time}`,
    timeOnDay: (time: string, day: string) => `at ${time} ${day}`,
    early: (minutes: number) => `${span(minutes)} before`,
    every,
    text: (deadline: string, first: string, repeat: string | null, at: string | null) => {
      let plan = first;
      if (repeat) plan += `, then ${repeat}${at ? "" : " until the deadline"}`;
      if (at) plan += ` and ${at}`;
      return `For example, for a deadline ${deadline}: ${plan}.`;
    },
    only: (deadline: string, time: string) => `For example, for a deadline ${deadline}: one notification, exactly at ${time}.`,
    total: (n: number) => `${n} ${pluralEn(n, "notification", "notifications")} in all`,
    quietSome: (q: number) => `, ${q} of them in quiet hours`,
    quietAll: (n: number) => (n === 1 ? ", in quiet hours" : ", all in quiet hours"),
    none: "With these settings there will be no deadline reminders. Choose the first reminder or turn on the notification at the deadline",
  },

  general: {
    title: "General",
    desc: "Notifications come while AITU Desk is running. Do not disturb in Windows can hide them",
    sound: "Notification sound",
    soundHint: "A short Windows sound with each notification",
    quiet: "Quiet hours",
    quietHint: "During this time reminders don't pop up or make a sound, but they stay in the Windows notification center",
    from: "From",
    to: "to",
    fromLabel: "Quiet hours start",
    toLabel: "Quiet hours end",
    timePlaceholder: "HH:MM",
    duration: (h: number, m: number) => (h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`),
    daily: (duration: string) => `Every day, ${duration}`,
    overnight: (duration: string) => `Every day, overnight, ${duration}`,
    same: "The start and the end are the same, so quiet hours have no effect",
    lessonsQuiet: (n: number) => `${n} class ${pluralEn(n, "reminder", "reminders")} a week ${pluralEn(n, "falls", "fall")} in quiet hours`,
    test: "Test notification",
    testHint: "If it didn't appear, check the notification settings for AITU Desk in Windows and Do not disturb",
    testButton: "Send a test notification",
    testDone: "Notification sent",
    testFailed: "Couldn't show the notification",
    autostartOff: "Autostart is off",
    autostartOffHint: "Reminders come only while AITU Desk is running. Turn on autostart so they don't stop after a restart",
    autostartOn: "Turn on autostart",
  },
  resetText:
    "Reminders go back to the defaults: 10 minutes before a class, 1 day before a deadline and at the deadline, with sound and no quiet hours. Notes with reminders turned off stay without them.",
};
