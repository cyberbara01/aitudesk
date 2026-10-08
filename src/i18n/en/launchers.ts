// English for src/i18n/ru.extra.launchers.ts.
import { pluralEn } from "../lang";
import type { LaunchersStrings } from "../ru.extra.launchers";

const icons = (n: number) => `${n} ${pluralEn(n, "icon", "icons")}`;
const launchers = (n: number) => `${n} more ${pluralEn(n, "shortcut", "shortcuts")}`;

export const en: LaunchersStrings = {
  description: "Quick links to the university sites and your favorite pages, one click from the desktop",
  preview: "This is how the widget looks on the desktop at its default size",
  previewOverflow: (n: number) =>
    `${launchers(n)} below: the widget scrolls with the mouse wheel. ` +
    "To see them all at once, make it bigger: right-click the widget, then “Move and resize”",
  builtInHint: "AITU sites. You can change or turn off any of them and always bring back the original",
  changed: "changed",
  customHint: "Any sites: your own name, address, icon and color",
  noCustomHint: "Click “Add shortcut”, enter a name and an address, and the site icon is found for you",
  display: "Display",
  showLabelsHint: "A name under each icon. Without names, a name shows when you point at its icon",
  backgroundHint: "Without the background the icons sit right on the wallpaper",
  moveUp: "Move up",
  moveDown: "Move down",

  tileNames: { du: "DU", moodle: "LMS", learn: "Learn" },
  menuTurnOff: "Turn off shortcut",

  untitled: "Shortcut",
  restore: "Restore the original",
  urlSpaces: "Remove the spaces from the address",
  siteIconReady: "Site icon loaded",
  siteIconBundled: "The AITU site icon comes with the app and shows without internet",
  saveAnyway: "Click “Save” again to keep the letter, or pick an icon from the set",
  letterHint: "The first letter of the name in a colored square",
  popular: "Popular icons",
  fullSetHint: (n: number) => `${icons(n)} in all, search by words like mail, code or music`,

  allIconsCount: (n: number) => `All icons · ${n}`,
  iconsFound: (n: number) => `Found: ${icons(n)}`,
  searchEmptyHint: "Try another word, for example mail, code or music",
};
