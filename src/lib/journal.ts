// «Журнал» from the pages (src-tauri/src/journal.rs keeps the file): what a page saw happen, one line each, only while
// the journal is on. Nothing personal: settings are described without the texts of notes and lessons, the addresses
// of shortcuts or names typed by the user (describeSetting below).
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

/** Tells every page that the journal was switched on or off. */
export const JOURNAL_EVENT = "journal-state";

let on = false;
let known = false;
let started = false;
/** Lines from before the page knew whether the journal is on (errors while it starts). */
const early: string[] = [];
/** At most this many lines per page in `PER_MS`: a page stuck in a loop cannot fill the journal. */
const PER = 40;
const PER_MS = 5000;
let windowStart = 0;
let inWindow = 0;

function start() {
  if (started) return;
  started = true;
  void invoke<{ on: boolean }>("journal_status")
    .then((st) => {
      on = Boolean(st.on);
      known = true;
      for (const line of early.splice(0)) send(line);
    })
    .catch(() => undefined);
  void listen<boolean>(JOURNAL_EVENT, (e) => {
    on = Boolean(e.payload);
    known = true;
  }).catch(() => undefined);
}

function send(text: string) {
  if (!on) return;
  const now = Date.now();
  if (now - windowStart > PER_MS) {
    windowStart = now;
    inWindow = 0;
  }
  if (++inWindow > PER) return;
  void invoke("journal_write", { text }).catch(() => undefined);
}

/** One line in the journal (the window it comes from is added by the native side). */
export function journal(text: string): void {
  start();
  if (!known) {
    if (early.length < 50) early.push(text);
    return;
  }
  send(text);
}

/** After the switch in «О программе»: every page writes or stops at once. */
export function announceJournal(next: boolean): void {
  on = next;
  known = true;
  void emit(JOURNAL_EVENT, next).catch(() => undefined);
}

/** Errors of this page: a script that failed, a promise nobody caught. */
export function journalErrors(): void {
  window.addEventListener("error", (e) => {
    const where = e.filename ? ` (${e.filename.replace(/^.*\/assets\//, "")}:${e.lineno}:${e.colno})` : "";
    journal(`error: ${e.message}${where}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    journal(`unhandled: ${r instanceof Error ? `${r.name}: ${r.message}` : String(r)}`);
  });
}

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const json = (v: unknown) => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
};
const without = (v: unknown, ...keys: string[]) => {
  if (!v || typeof v !== "object") return v;
  const copy: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const k of keys) if (k in copy) copy[k] = `(${Array.isArray(copy[k]) ? count(copy[k]) : "…"})`;
  return copy;
};

/** One setting as the journal writes it: its value, or for what the user typed, only how much there is. */
export function describeSetting(key: string, value: unknown): string {
  const v = value as Record<string, unknown> | undefined;
  switch (key) {
    case "schedule":
      return json(without(v, "lessons"));
    case "notes":
      return json(without(v, "notes"));
    case "launchers":
      return json(without(v, "custom"));
    case "customWidgets":
      return `${count(value)} own widgets, on: ${Array.isArray(value) ? value.filter((w) => (w as { enabled?: boolean }).enabled).length : 0}`;
    case "map":
      return json(without(v, "favorites"));
    case "system":
      return json(without(v, "customLabel"));
    case "stacks":
      return Array.isArray(value)
        ? value.map((d) => { const s = d as { id: string; members: string[]; axis: string }; return `${s.id}: [${s.members.join(", ")}] ${s.axis}`; }).join("; ") || "none"
        : json(value);
    case "reminders":
      return json(without(v, "custom"));
    default:
      return json(value);
  }
}
