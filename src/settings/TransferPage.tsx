// «Конфиги»: the settings as a file. «Сохранить конфиг…» writes the parts the user picks; notes are
// personal: marked, never picked by default, and the suggested file name says when they are inside.
// «Выбрать конфиг…» reads one's own file or someone else's, lists the parts it holds with what is in them
// and changes nothing until «Применить»; «Отменить» then brings back what was replaced, for as long as the page
// stays open. The format and the pure helpers live in src/lib/config.ts, the Windows dialogs in
// src-tauri/src/files.rs.
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.transfer";
import {
  PARTS,
  applyParts,
  buildConfigFile,
  defaultChoice,
  parseConfigFile,
  partSummary,
  previewOf,
  resolveLayout,
  savedAt,
  snapshotOf,
  suggestedFileName,
  type ConfigFile,
  type LayoutFile,
  type Part,
  type PartId,
} from "../lib/config";
import { TILE_IDS, settings, type Settings, type SettingsPatch } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useTransient } from "./shell/hooks";

const x = extra;

type Choice = ReadonlySet<PartId>;

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/** Last segment of a Windows path: the file name for captions and messages. */
const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

/** Moves the tiles whose on/off state changed: the settings store alone does not (see GeneralPage). */
function syncTiles(before: Settings["tiles"], after: Settings["tiles"]) {
  for (const id of TILE_IDS) {
    if (before[id] !== after[id]) invoke("set_tile_enabled", { label: id, enabled: after[id] }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// Checklist of parts (both sections)
// ---------------------------------------------------------------------------------------------

interface PartListProps {
  /** Name of the group for assistive tech: «Что сохранить», «Что применить». */
  label: string;
  /** Id of the group element (the page moves the focus into a list that has just appeared). */
  id?: string;
  parts: readonly Part[];
  chosen: Choice;
  onChange: (next: Choice) => void;
  /** What the part holds, under its name. */
  summary: (id: PartId) => string;
  /** One more line for some parts (the personal warning, what gets replaced); `on` = the part is picked. */
  note?: (id: PartId, on: boolean) => string | null;
}

/**
 * One kit-like row per part: the checkbox with the part's name, what it holds under the name, and the
 * personal part tinted with a lock badge. A click anywhere on a row toggles it (unless it ends a text
 * selection); the checkbox itself stays the keyboard target.
 */
function PartList({ label, id, parts, chosen, onChange, summary, note }: PartListProps) {
  const set = (part: PartId, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(part);
    else next.delete(part);
    onChange(next);
  };
  return (
    <div id={id} className="tr-list" role="group" aria-label={label}>
      {parts.map((p) => {
        const on = chosen.has(p.id);
        const more = note?.(p.id, on) ?? null;
        const onRowClick = (e: MouseEvent<HTMLDivElement>) => {
          if ((e.target as Element).closest(".checkbox")) return;
          if (!(window.getSelection()?.isCollapsed ?? true)) return;
          set(p.id, !on);
        };
        return (
          <div key={p.id} className={cx("tr-part", p.personal && "personal", on && "on")} onClick={onRowClick}>
            <Checkbox checked={on} onChange={(v) => set(p.id, v)} label={p.label} />
            {p.personal && (
              <span className="tr-badge">
                <Icon name="shield_lock" size={16} />
                {x.personal}
              </span>
            )}
            <span className="tr-part-text">
              <span className="tr-part-summary">{summary(p.id)}</span>
              {more && <span className="tr-part-note">{more}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ListHeadProps {
  /** Left: what the list is about (count or the file caption). */
  children: string;
  /** Parts on offer and the current choice, for «Выбрать всё» / «Снять всё». */
  parts: readonly Part[];
  chosen: Choice;
  onChange: (next: Choice) => void;
}

/**
 * The line above a list. «Выбрать всё» picks every part that is not personal (the personal one is picked
 * only on purpose); once those are all picked, «Снять всё» clears the whole list. With fewer than two such
 * parts the checkboxes say it all, so there is no button.
 */
function ListHead({ children, parts, chosen, onChange }: ListHeadProps) {
  const common = parts.filter((p) => !p.personal);
  const all = common.every((p) => chosen.has(p.id));
  const toggle = () => {
    if (all) onChange(new Set());
    else onChange(new Set([...chosen, ...common.map((p) => p.id)]));
  };
  return (
    <div className="tr-head">
      <span className="tr-caption">{children}</span>
      {common.length > 1 && (
        <Button size="sm" variant="subtle" onClick={toggle}>
          {all ? x.clearAll : x.selectAll}
        </Button>
      )}
    </div>
  );
}

interface StatusProps {
  tone?: "ok" | "fail";
  text: string;
}

/** A result next to its button. A polite live region that stays mounted (empty when there is nothing to say). */
function Status({ tone, text }: StatusProps) {
  return (
    <span className={cx("status-text", tone)} role="status">
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// «Сохранить настройки в файл»
// ---------------------------------------------------------------------------------------------

/** `noLayout`: the layout was picked but the tiles could not report it, so the file holds the rest. */
type SaveResult = { kind: "idle" } | { kind: "saved"; path: string; noLayout: boolean } | { kind: "failed" };

const ALL_IDS = PARTS.map((p) => p.id);

function ExportSection({ s }: { s: Settings }) {
  const [chosen, setChosen] = useState<Choice>(() => new Set(defaultChoice(ALL_IDS)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult>({ kind: "idle" });
  const summaries = useMemo(() => new Map(PARTS.map((p) => [p.id, partSummary(p.id, s)])), [s]);
  const withNotes = chosen.has("notes");

  const save = async () => {
    const ids = ALL_IDS.filter((id) => chosen.has(id));
    if (ids.length === 0) return;
    setBusy(true);
    setResult({ kind: "idle" });
    try {
      const layout = ids.includes("layout") ? await invoke<LayoutFile | null>("get_layout").catch(() => null) : null;
      const now = new Date();
      const contents = buildConfigFile(settings.get(), ids, layout, now);
      const path = await invoke<string | null>("save_config_file", {
        title: x.saveTitle,
        fileName: suggestedFileName(ids, now),
        contents,
      });
      if (path) setResult({ kind: "saved", path, noLayout: ids.includes("layout") && !layout });
    } catch {
      setResult({ kind: "failed" });
    } finally {
      setBusy(false);
    }
  };

  const showInFolder = (path: string) => void revealItemInDir(path).catch(() => undefined);

  return (
    <Section title={x.exportTitle} description={x.exportDesc}>
      <ListHead parts={PARTS} chosen={chosen} onChange={setChosen}>
        {x.chosen(chosen.size, PARTS.length)}
      </ListHead>
      <PartList
        label={x.exportList}
        parts={PARTS}
        chosen={chosen}
        onChange={setChosen}
        summary={(id) => summaries.get(id) ?? ""}
        note={(id, on) => (id === "notes" && !on ? x.notesExportHint : null)}
      />
      <div className="tr-actions">
        {withNotes && (
          <p className="tr-warning">
            <Icon name="warning" />
            <span>{x.notesWarning}</span>
          </p>
        )}
        <div className="tr-buttons">
          <Button variant="accent" icon="arrow_download" onClick={() => void save()} disabled={busy || chosen.size === 0}>
            {x.save}
          </Button>
          <span className="tr-result">
            <Status
              tone={result.kind === "saved" ? "ok" : result.kind === "failed" ? "fail" : undefined}
              text={result.kind === "saved" ? (result.noLayout ? x.savedNoLayout : x.saved) : result.kind === "failed" ? x.saveFailed : ""}
            />
            {result.kind === "saved" && (
              <Button size="sm" variant="subtle" icon="folder_open" onClick={() => showInFolder(result.path)}>
                {x.showInFolder}
              </Button>
            )}
          </span>
        </div>
        {result.kind === "saved" && <p className="tr-path">{result.path}</p>}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// «Загрузить настройки из файла»
// ---------------------------------------------------------------------------------------------

interface Loaded {
  name: string;
  file: ConfigFile;
  /** The parts of the file, marked personal where the file says so too. */
  parts: Part[];
}

/** What «Отменить» needs: the replaced keys as they were, and the tile layout before (null = not touched). */
interface Applied {
  before: SettingsPatch;
  layout: LayoutFile | null;
  layoutFailed: boolean;
}

type UndoOutcome = "idle" | "done" | "failed";

/** «Файл «…», сохранён 07.10.2026 в 15:42, версия 0.9» or «Файл «settings.json», рабочий файл настроек приложения». */
function fileCaption({ name, file }: Loaded): string {
  const items = [x.file(name)];
  if (file.source === "store") items.push(x.storeFile);
  if (file.saved) {
    const { date, time } = savedAt(file.saved);
    items.push(x.savedAt(date, time));
  }
  if (file.app && file.app !== ru.app.version) items.push(x.fromVersion(file.app));
  return items.join(", ");
}

function ImportSection({ s }: { s: Settings }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [chosen, setChosen] = useState<Choice>(new Set());
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  /** Why «Применить» changed nothing (shown in place of the result), or "". */
  const [applyError, setApplyError] = useState("");
  const [undoOutcome, flashUndo] = useTransient<UndoOutcome>("idle", 4000);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const chooseId = useId();
  // The control that had the focus goes away when the view switches: the keyboard continues in the list that
  // appeared, or on «Выбрать конфиг…» again. Moved after the render that shows (and enables) the target.
  const focusNext = useRef<"list" | "choose" | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const moveFocus = (target: "list" | "choose") => {
    focusNext.current = target;
    setFocusTick((n) => n + 1);
  };
  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === "list") document.getElementById(listId)?.querySelector("input")?.focus();
    else if (target === "choose") document.getElementById(chooseId)?.focus();
  }, [focusTick, listId, chooseId]);

  // What each part of the file would make of the current settings (lists replace, fields merge).
  const preview = useMemo(() => (loaded ? previewOf(s, loaded.file) : null), [loaded, s]);

  const choose = async () => {
    setBusy(true);
    setError("");
    setApplyError("");
    try {
      const opened = await invoke<{ path: string; contents: string } | null>("open_config_file", { title: x.openTitle });
      if (!opened) return;
      const parsed = parseConfigFile(opened.contents);
      if (!parsed.ok) {
        setError(x.errors[parsed.error]);
        return;
      }
      const { file } = parsed;
      const parts = PARTS.filter((p) => file.parts.includes(p.id)).map((p) => (file.personal.includes(p.id) ? { ...p, personal: true } : p));
      setLoaded({ name: baseName(opened.path), file, parts });
      moveFocus("list");
      setChosen(new Set(defaultChoice(file.parts, file.personal)));
    } catch (e) {
      setError(e === "too large" ? x.errors.tooLarge : x.errors.read);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!loaded) return;
    const ids = loaded.file.parts.filter((id) => chosen.has(id));
    if (ids.length === 0) return;
    setBusy(true);
    setApplyError("");
    const current = settings.get();
    const patch = applyParts(current, loaded.file.settings, ids);
    const before = snapshotOf(current, patch);
    // Empty when only the layout was picked: nothing to write then.
    const changed = Object.keys(patch).length > 0;
    try {
      if (changed) await settings.update(patch);
    } catch {
      setApplyError(x.applyFailed);
      setBusy(false);
      return;
    }
    // The layout first: a tile switched on afterwards then appears right at its new place.
    let layout: LayoutFile | null = null;
    let layoutFailed = false;
    if (ids.includes("layout") && loaded.file.layout) {
      try {
        const was = await invoke<LayoutFile | null>("get_layout");
        const next = was && resolveLayout(loaded.file.layout, was);
        if (!next) throw new Error("no tiles");
        await invoke("set_layout", { layout: next });
        layout = was;
      } catch {
        layoutFailed = true;
      }
    }
    syncTiles(current.tiles, settings.get().tiles);
    if (!changed && !layout) {
      // Only the layout was picked and it could not be applied: nothing changed, the list stays.
      setApplyError(x.layoutFailed);
      setBusy(false);
      return;
    }
    flashUndo("idle");
    setApplied({ before, layout, layoutFailed });
    setLoaded(null);
    setBusy(false);
    moveFocus("choose");
  };

  const undo = async () => {
    if (!applied) return;
    setBusy(true);
    const current = settings.get();
    try {
      if (Object.keys(applied.before).length > 0) await settings.update(applied.before);
      if (applied.layout) await invoke("set_layout", { layout: applied.layout });
      setApplied(null);
      flashUndo("done");
      moveFocus("choose");
    } catch {
      flashUndo("failed");
    } finally {
      syncTiles(current.tiles, settings.get().tiles);
      setBusy(false);
    }
  };

  const cancel = () => {
    setApplyError("");
    setLoaded(null);
    moveFocus("choose");
  };

  const lessonsNow = s.schedule.lessons.length;
  const note = (id: PartId) => {
    if (id === "notes") return x.notesImportHint;
    if (id === "schedule" && lessonsNow > 0) return x.lessonsReplace(lessonsNow);
    return null;
  };

  // One status line for both views, so it stays mounted and «Конфиг загружен» is announced.
  let status: StatusProps = { text: "" };
  if (applyError) status = { tone: "fail", text: applyError };
  else if (loaded) status = { text: "" };
  else if (error) status = { tone: "fail", text: error };
  else if (undoOutcome === "done") status = { tone: "ok", text: x.undone };
  else if (undoOutcome === "failed") status = { tone: "fail", text: x.undoFailed };
  else if (applied) status = applied.layoutFailed ? { tone: "fail", text: x.appliedLayoutFailed } : { tone: "ok", text: x.applied };

  return (
    <Section title={x.importTitle} description={x.importDesc}>
      {loaded && preview && (
        <>
          <ListHead parts={loaded.parts} chosen={chosen} onChange={setChosen}>
            {fileCaption(loaded)}
          </ListHead>
          <PartList
            label={x.importList}
            id={listId}
            parts={loaded.parts}
            chosen={chosen}
            onChange={setChosen}
            summary={(id) => partSummary(id, preview, loaded.file.layout)}
            note={note}
          />
        </>
      )}
      <div className={loaded ? "tr-actions" : "tr-actions first"}>
        {loaded && <p className="tr-hint">{x.replaces}</p>}
        <div className="tr-buttons">
          {loaded ? (
            <>
              <Button variant="accent" onClick={() => void apply()} disabled={busy || chosen.size === 0}>
                {x.apply}
              </Button>
              <Button onClick={cancel} disabled={busy}>
                {ru.common.cancel}
              </Button>
            </>
          ) : (
            <Button id={chooseId} icon="arrow_upload" onClick={() => void choose()} disabled={busy}>
              {x.choose}
            </Button>
          )}
          <span className="tr-result">
            <Status {...status} />
            {!loaded && applied && !error && (
              <Button size="sm" variant="subtle" icon="arrow_counterclockwise" onClick={() => void undo()} disabled={busy}>
                {x.undo}
              </Button>
            )}
          </span>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------

export function TransferPage() {
  const s = useSettings();
  return (
    <Page title={ru.settings.nav.transfer} description={x.desc}>
      <ExportSection s={s} />
      <ImportSection s={s} />
      <Section title={x.aboutTitle}>
        <Row label={x.plainLabel} hint={x.plainHint} />
        <Row label={x.notIncludedLabel} hint={x.notIncludedHint} />
        <Row label={x.addressesLabel} hint={x.addressesHint} />
        <Row label={x.privacyLabel} hint={x.privacyHint} />
      </Section>
    </Page>
  );
}
