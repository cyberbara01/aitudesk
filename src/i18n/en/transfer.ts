// English for src/i18n/ru.extra.transfer.ts. The summaries are joined by src/lib/config.ts (partSummary): «3
// built-in and 2 custom shortcuts», «Aqua, Dark, Graphite accent».
import { pluralEn } from "../lang";
import type { TransferStrings } from "../ru.extra.transfer";

/** Non-breaking space: keeps «or https://» on one line. */
const NBSP = String.fromCharCode(0xa0);

export const en: TransferStrings = {
  desc: "A config is all your settings in one file. Save yours or load someone else's, and you decide what exactly to save and apply",

  parts: {
    layout: "Widget positions and sizes",
  },
  personal: "Personal",

  summary: {
    tilesAll: (n: number) => `All ${n} on`,
    tilesSome: (on: number, total: number) => `${on} of ${total} on`,
    tilesNone: "All off",
    locked: "layout locked",
    grid: "on the grid",
    layoutExport: "On a screen of another size the widgets adjust to it",
    layoutAdapts: "The widgets adjust to your screen",
    layoutNoScreen: "The config doesn't give a screen size, so the widgets stay within yours",
    themeSystem: "theme as in Windows",
    accentWindows: "accent as in Windows",
    accentPreset: (name: string) => `${name} accent`,
    accentCustom: (hex: string) => `custom accent ${hex}`,
    clockPreset: (name: string) => `“${name}” style`,
    clockCustom: "Custom style",
    seconds: "with seconds",
    hour12: "12-hour format",
    onlyBattery: "Battery only",
    and: "and",
    namesHidden: "names hidden",
    launchersOff: "All shortcuts off",
    builtIn: (n: number) => `${n} built-in`,
    own: (n: number) => `${n} custom`,
    launchersWord: (n: number) => pluralEn(n, "shortcut", "shortcuts"),
    sites: (hosts: string, more: number) => (more > 0 ? `${hosts} and ${more} more` : hosts),
    scheme: (name: string) => `“${name}” scheme`,
    opacity: (n: number) => `${n}% opacity`,
    marked: (n: number) => (n === 0 ? "no marked rooms" : `${n} marked ${pluralEn(n, "room", "rooms")}`),
    lessons: (n: number) => (n === 0 ? "No classes" : `${n} ${pluralEn(n, "class", "classes")} a week`),
    notes: (n: number) => (n === 0 ? "No notes" : `${n} ${pluralEn(n, "note", "notes")}`),
    withDeadline: (n: number) => `${n} with a deadline`,
    remindersOff: "Off",
    lessonStart: "when a class starts",
    beforeLesson: (time: string) => `${time} before a class`,
    deadlines: "at the deadline",
    beforeDeadline: (time: string) => `${time} before a deadline`,
    minutes: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    days: (n: number) => `${n} ${pluralEn(n, "day", "days")}`,
  },
  size: {
    kb: (n: string) => `${n}${NBSP}KB`,
    mb: (n: string) => `${n}${NBSP}MB`,
  },

  exportTitle: "Save your config",
  exportDesc: "To move your settings to another computer or share them with a friend",
  exportList: "What to save",
  chosen: (n: number, total: number) => `${n} of ${total} selected`,
  selectAll: "Select all",
  clearAll: "Clear all",
  notesExportHint: "Leave it off if you give the config to someone else",
  customExportHint: "The pictures are saved inside the config. Leave it off if you give it to someone else",
  notesWarning: "The config will contain your notes. Don't send it to other people",
  customWarning: "The config will contain the widgets with your pictures, so the file will be bigger. Don't send it to other people",
  bothWarning:
    "The config will contain your notes and the widgets with your pictures, so the file will be bigger. Don't send it to other people",
  save: "Save config…",
  saveTitle: "Save AITU Desk config",
  fileName: (date: string, withNotes: boolean, withWidgets: boolean) => {
    const inside = withNotes && withWidgets ? " with notes and your widgets" : withNotes ? " with notes" : withWidgets ? " with your widgets" : "";
    return `AITU Desk config${inside} ${date}.json`;
  },
  saved: "Config saved",
  savedNoLayout: "Config saved, but without the widget layout",
  savedWithoutWidgets: (left: number, noLayout: boolean) =>
    `Config saved without ${noLayout ? "the widget layout and without " : ""}${left} of your widgets: ${pluralEn(
      left,
      "its picture is missing or didn't fit",
      "their pictures are missing or didn't fit",
    )} in the config`,
  saveFailed: "Couldn't save the config. Try another folder",
  showInFolder: "Show in folder",

  importTitle: "Load a config",
  importDesc: "Yours or someone else's. You choose what to apply, and nothing changes until you click “Apply”",
  choose: "Choose a config…",
  openTitle: "Load AITU Desk config",
  importList: "What to apply",
  file: (name: string) => `File “${name}”`,
  savedAt: (date: string, time: string) => `saved on ${date} at ${time}`,
  fromVersion: (version: string) => `version ${version}`,
  storeFile: "the app's own settings file",
  replaces: (widgets: string | null) =>
    `The checked parts replace yours completely, together with the lists of classes, notes, shortcuts and rooms${
      widgets ? `. Only “${widgets}” are added to yours instead of replacing them` : ""
    }`,
  notesReplace: (n: number) => `Notes from the config replace yours instead of being added to them. You have ${n} ${pluralEn(n, "note", "notes")} now`,
  customAdd: "Widgets from the config are added to yours, yours stay",
  customSome: (fit: number, total: number, max: number) =>
    `Only ${fit} of the ${total} widgets from the config ${pluralEn(fit, "is", "are")} added: you can have at most ${max} of your own`,
  customHere: "You already have these widgets, nothing is added",
  customFull: (max: number) => `You already have ${max} widgets of your own, so none from the config can be added`,
  customPictures: (n: number, size: string) =>
    n === 1 ? `The picture (${size}) is copied into the app's folder` : `The pictures (${size}) are copied into the app's folder`,
  lessonsReplace: (n: number) => `Classes from the config replace yours; the schedule has ${n} ${pluralEn(n, "class", "classes")} now`,
  apply: "Apply",
  applied: "Config loaded",
  appliedLayoutFailed: "Config loaded, but the widgets couldn't be rearranged",
  applyFailed: "Couldn't apply the settings",
  layoutFailed: "Couldn't rearrange the widgets",
  undo: "Undo",
  undone: "Your previous settings are back",
  undoFailed: "Couldn't bring back the previous settings",
  errors: {
    notJson: "Couldn't read the file: it is damaged or not a config",
    foreign: "This is not an AITU Desk config",
    newer: "The config was saved by a newer version of AITU Desk. Update the app to load it",
    empty: "The config has no settings that can be loaded",
    tooLarge: "The file is too large for a config",
    read: "Couldn't open the file. Make sure no other program is using it",
  },

  aboutTitle: "What's inside a config",
  plainLabel: "Plain text",
  plainHint: "A config is stored as JSON. You can open it in Notepad and see what's inside",
  notIncludedLabel: "What doesn't move",
  notIncludedHint: "The language, the widget scale, autostart and hiding all widgets stay as they are on this computer",
  picturesLabel: "Pictures of your widgets",
  picturesHint: "They are kept inside the config, so the file gets bigger with them. Loading copies them into the app's folder",
  addressesLabel: "Shortcut addresses",
  addressesHint: `Only shortcuts whose address starts with http://${NBSP}or${NBSP}https:// are loaded from a config, and the built-in AITU shortcuts lead only to university sites`,
  privacyLabel: "Privacy",
  privacyHint: "Loading a config never turns off hiding the text on the desktop or the network names, if you have it on",
};
