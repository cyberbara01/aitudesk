// English for src/i18n/ru.extra.clock.ts.
import type { ClockStrings } from "../ru.extra.clock";

export const en: ClockStrings = {
  clock: {
    pageDesc: "Font, size, format and colors of the clock. Ready-made styles apply in one click",
    other: "Other",
    previewHint:
      "This is how the clock looks on the desktop: at the size of your widget, in the chosen design and theme. Change the size on the widget itself: right-click it, “Move and resize”",
    widgetSize: (w: number, h: number) => `Widget size ${w}${String.fromCharCode(0xd7)}${h}`,
    currentSettings: "Current settings",
    dateBeside: "Beside",
    am: "am",
    pm: "pm",
    percent: "%",
    fontAuto: "As in the design",
    weightNames: {
      100: "Hairline",
      200: "Extra light",
      300: "Light",
      400: "Regular",
      500: "Medium",
      600: "Semibold",
      700: "Bold",
      800: "Extra bold",
      900: "Black",
    },
    fontHint: "Inter and JetBrains Mono come with the app, the other fonts are part of Windows 11",
    fontAutoHint: "The font changes with the design: Segoe UI in Windows 11, Inter in Aqua, JetBrains Mono in Rice",
    weightStaticHint: "This font comes only in regular and bold",
    sizeHint: "If the time doesn't fit the widget, it shrinks automatically",
    trackingHint: "As a share of the digit size: below zero is tighter, above zero is looser",
    secondsHint: "Seconds redraw the clock every second and use a little more laptop battery. When Windows battery saver is on, they hide by themselves",
    blinkHint: "Doesn't blink when animation effects are off in Windows",
    hour12Hint: "A small am or pm appears after the time",
    tabularHint: "All digits have the same width, so the time doesn't jump as the seconds change",
  },
};
