// «Конфиги»: the settings as a file. «Сохранить конфиг…» writes the parts the user picks; notes and own widgets
// are personal and treated alike: tinted with a lock badge in both lists, never picked by default, a hint under
// the part while it is off and a warning above the button once it is on (both only when the part holds
// something), and the suggested file name says which of them went in. Own widgets travel with their pictures
// inside the file and are added to the ones already here, never replacing them; the list of a loaded file says
// so, with the size of the pictures and how many still fit under CUSTOM_MAX.
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
  IMAGES_MAX,
  PARTS,
  addWidgets,
  applyParts,
  buildConfigFile,
  defaultChoice,
  imagesBytes,
  parseConfigFile,
  partSummary,
  previewOf,
  resolveLayout,
  savedAt,
  sizeText,
  snapshotOf,
  suggestedFileName,
  type ConfigFile,
  type LayoutFile,
  type Part,
  type PartId,
} from "../lib/config";
import { CUSTOM_MAX, TILE_IDS, newCustomId, settings, type Settings, type SettingsPatch } from "../lib/settings";
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
  /** One more line for some parts (the personal hint, what gets replaced or added); `on` = the part is picked. */
  note?: (id: PartId, on: boolean) => string | null;
}

/**
 * One kit-like row per part: the checkbox with the part's name, what it holds under the name, and the
 * personal parts tinted with a lock badge. A click anywhere on a row toggles it (unless it ends a text
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
 * The line above a list. «Выбрать всё» picks every part that is not personal (the personal ones are picked
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

/**
 * `noLayout`: the layout was picked but the tiles could not report it, so the file holds the rest. `widgetsLeft`:
 * how many own widgets stayed out (their pictures did not fit or could not be read).
 */
type SaveResult = { kind: "idle" } | { kind: "saved"; path: string; noLayout: boolean; widgetsLeft: number } | { kind: "failed" };

/**
 * The pictures of the own widgets for a file, by file name, while they fit in IMAGES_MAX; and how many widgets
 * were left out for want of theirs. A picture that failed once is not read again for another widget.
 */
async function widgetImages(s: Settings): Promise<{ images: Record<string, string>; left: number }> {
  const images: Record<string, string> = {};
  const failed = new Set<string>();
  let total = 0;
  for (const w of s.customWidgets) {
    if (Object.hasOwn(images, w.file) || failed.has(w.file)) continue;
    const data = await invoke<string>("widget_image_base64", { file: w.file }).catch(() => null);
    if (data === null || total + data.length > IMAGES_MAX) {
      failed.add(w.file);
      continue;
    }
    images[w.file] = data;
    total += data.length;
  }
  return { images, left: s.customWidgets.filter((w) => !Object.hasOwn(images, w.file)).length };
}

const ALL_IDS = PARTS.map((p) => p.id);

/**
 * The warning above «Сохранить конфиг…» for the personal parts that are picked and hold something (an empty
 * notes list or no own widgets puts nothing personal into the file).
 */
function personalWarning(notes: boolean, widgets: boolean): string | null {
  if (notes && widgets) return x.bothWarning;
  if (notes) return x.notesWarning;
  if (widgets) return x.customWarning;
  return null;
}

function ExportSection({ s }: { s: Settings }) {
  const [chosen, setChosen] = useState<Choice>(() => new Set(defaultChoice(ALL_IDS)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult>({ kind: "idle" });
  const summaries = useMemo(() => new Map(PARTS.map((p) => [p.id, partSummary(p.id, s)])), [s]);
  const hasNotes = s.notes.notes.length > 0;
  const hasWidgets = s.customWidgets.length > 0;
  const warning = personalWarning(hasNotes && chosen.has("notes"), hasWidgets && chosen.has("custom"));

  const save = async () => {
    const ids = ALL_IDS.filter((id) => chosen.has(id));
    if (ids.length === 0) return;
    setBusy(true);
    setResult({ kind: "idle" });
    try {
      const layout = ids.includes("layout") ? await invoke<LayoutFile | null>("get_layout").catch(() => null) : null;
      const current = settings.get();
      const { images, left } = ids.includes("custom") ? await widgetImages(current) : { images: {}, left: 0 };
      const now = new Date();
      const contents = buildConfigFile(current, ids, layout, now, images);
      // The name tells only what really went in: no notes, or not one own widget, is nothing to point out.
      const named = ids.filter((id) =>
        id === "notes" ? current.notes.notes.length > 0 : id === "custom" ? current.customWidgets.length > left : true,
      );
      const path = await invoke<string | null>("save_config_file", {
        title: x.saveTitle,
        fileName: suggestedFileName(named, now),
        contents,
      });
      if (path) setResult({ kind: "saved", path, noLayout: ids.includes("layout") && !layout, widgetsLeft: left });
    } catch {
      setResult({ kind: "failed" });
    } finally {
      setBusy(false);
    }
  };

  // Under a personal part while it is off; once it is on, the warning above the button says it instead.
  const note = (id: PartId, on: boolean) => {
    if (on) return null;
    if (id === "notes" && hasNotes) return x.notesExportHint;
    if (id === "custom" && hasWidgets) return x.customExportHint;
    return null;
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
        note={note}
      />
      <div className="tr-actions">
        {warning && (
          <p className="tr-warning">
            <Icon name="warning" />
            <span>{warning}</span>
          </p>
        )}
        <div className="tr-buttons">
          <Button variant="accent" icon="arrow_download" onClick={() => void save()} disabled={busy || chosen.size === 0}>
            {x.save}
          </Button>
          <span className="tr-result">
            <Status
              // Saved without some own widgets or the layout: said in the neutral tone, not as a full success.
              tone={
                result.kind === "saved"
                  ? result.widgetsLeft > 0 || result.noLayout
                    ? undefined
                    : "ok"
                  : result.kind === "failed"
                    ? "fail"
                    : undefined
              }
              text={
                result.kind === "saved"
                  ? result.widgetsLeft > 0
                    ? x.savedWithoutWidgets(result.widgetsLeft, result.noLayout)
                    : result.noLayout
                      ? x.savedNoLayout
                      : x.saved
                  : result.kind === "failed"
                    ? x.saveFailed
                    : ""
              }
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
    // Own widgets are added to the ones here, each picture stored in the app's folder first.
    if (patch.customWidgets) {
      const store = (data: string) => invoke<string>("store_widget_image", { data });
      patch.customWidgets = await addWidgets(current.customWidgets, patch.customWidgets, loaded.file.images, store, newCustomId);
    }
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

  // What loading a part does to what is here, under the part (in caution once it is picked).
  const lessonsNow = s.schedule.lessons.length;
  const notesNow = s.notes.notes.length;
  const widgetsNow = s.customWidgets.length;
  // Own widgets are added, and only while there is room under CUSTOM_MAX (normalize drops the rest). The list of
  // the file is the one apply hands to addWidgets: preview's, already through normalize. addWidgets skips a widget
  // whose picture is not in the file, and one already here (a picture's stored name follows its bytes, so the same
  // picture has the same name here; plus the same widget name): the counts below leave both out, so they are exact
  // (a backup loaded on the PC it came from adds nothing and copies nothing).
  const widgetsNote = () => {
    if (!loaded || !preview) return null;
    const images = loaded.file.images ?? {};
    const incoming = preview.customWidgets.filter((w) => Object.hasOwn(images, w.file));
    if (incoming.length === 0) return null;
    const fresh = incoming.filter((w) => !s.customWidgets.some((c) => c.file === w.file && c.name === w.name));
    if (fresh.length === 0) return x.customHere;
    const room = CUSTOM_MAX - widgetsNow;
    if (room <= 0) return x.customFull(CUSTOM_MAX);
    // Only pictures not in the folder yet are copied.
    const files = new Set(fresh.map((w) => w.file).filter((f) => !s.customWidgets.some((c) => c.file === f)));
    const pictures = files.size > 0 ? x.customPictures(files.size, sizeText(imagesBytes(images, files))) : null;
    const what = fresh.length > room ? x.customSome(room, fresh.length, CUSTOM_MAX) : widgetsNow > 0 ? x.customAdd : null;
    return [what, pictures].filter(Boolean).join(". ") || null;
  };
  const note = (id: PartId) => {
    if (id === "notes" && notesNow > 0) return x.notesReplace(notesNow);
    if (id === "custom") return widgetsNote();
    if (id === "schedule" && lessonsNow > 0) return x.lessonsReplace(lessonsNow);
    return null;
  };
  // Under the list. Own widgets are the one part that adds instead of replacing: named as the exception, and a file
  // of nothing but own widgets needs no line about replacing (its row says it all).
  const withWidgets = loaded?.file.parts.includes("custom") ?? false;
  const replacesHint =
    loaded && !(withWidgets && loaded.file.parts.length === 1)
      ? x.replaces(withWidgets ? (PARTS.find((p) => p.id === "custom")?.label ?? null) : null)
      : null;

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
        {replacesHint && <p className="tr-hint">{replacesHint}</p>}
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
        <Row label={x.picturesLabel} hint={x.picturesHint} />
        <Row label={x.addressesLabel} hint={x.addressesHint} />
        <Row label={x.privacyLabel} hint={x.privacyHint} />
      </Section>
    </Page>
  );
}
