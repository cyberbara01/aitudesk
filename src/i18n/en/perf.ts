// English for src/i18n/ru.extra.perf.ts.
import type { PerfStrings } from "../ru.extra.perf";

export const en: PerfStrings = {
  short: { cpu: "CPU", gpu: "GPU", ram: "RAM", disk: "Disk" },
  full: { cpu: "Processor", gpu: "Graphics", ram: "Memory", disk: "Disk" },
  modes: { rings: "Rings", bars: "Bars", numbers: "Numbers" },
  temp: "Temperature",
  degrees: (c: number) => `${Math.round(c)}°`,
  percent: (v: number) => `${Math.round(v)}%`,
  memory: (used: number, total: number) =>
    `${used.toLocaleString("en-GB", { maximumFractionDigits: 1 })} of ${total.toLocaleString("en-GB", { maximumFractionDigits: 0 })} GB`,
  cycleHint: "Click to switch the view",
  waiting: "Collecting data",

  pageDesc: "Processor, graphics, memory and disk load and their temperature. Updated every 2 seconds, and only while the widget is visible",
  previewHint: "Live preview: the real values of this computer",
  view: "View",
  viewHint: "Clicking the widget itself switches the view too",
  metrics: "Readings",
  metricsHint: "Graphics and disk show up when Windows reports their load",
  hints: {
    cpu: "How much of the time the processor is busy",
    gpu: "The busiest part of the graphics card, as in Task Manager",
    ram: "How much memory is in use",
    disk: "How much of the time the busiest disk is working",
  },
  tempHint:
    "The graphics temperature comes from its driver, as in Task Manager. Without admin rights Windows gives the processor temperature only through ACPI sensors: laptops usually have them, desktop PCs often do not, and then it is not shown",
  look: "Look",
  backgroundHint: "Without the background the rings and numbers sit right on the wallpaper",
  summary: (mode: string, shown: string) => `${mode}: ${shown}`,
};
