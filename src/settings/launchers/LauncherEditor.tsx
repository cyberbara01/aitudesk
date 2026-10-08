import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/Button";
import { ColorPicker } from "../../components/ColorPicker";
import { Dialog } from "../../components/Dialog";
import { ALL_ICON_NAMES } from "../../components/Icon";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.launchers";
import {
  DEFAULT_FLUENT_ICON,
  builtInDef,
  builtInOriginal,
  bundledSiteIcon,
  hasSpaces,
  isBuiltInOriginal,
  isIconMarkup,
  isImageDataUrl,
  isValidUrl,
  newLauncherId,
  nextLauncherColor,
  saveBuiltIn,
  upsertCustom,
  type IconMode,
  type LauncherItem,
} from "../../lib/launchers";
import { settings, type LauncherIcon as LauncherIconSpec } from "../../lib/settings";
import { IconPickerDialog } from "./IconPickerDialog";
import { iconSvgFor, trustedIconSvg } from "./iconCache";
import { LauncherCell, LauncherIcon, type LauncherLook } from "./LauncherIcon";
import { PopularIcons } from "./PopularIcons";

interface Props {
  /** null = a new launcher; otherwise the launcher as it shows now (a built-in one with the user's edits). */
  item: LauncherItem | null;
  /** Mirrors settings.launchers.showLabels in the live preview. */
  showLabels: boolean;
  /** Keep it referentially stable: the Dialog re-registers in the Esc stack whenever it changes. */
  onClose: () => void;
}

/** The chosen Fluent icon and, when already known, its 20 px regular markup (the launcher's icon cache). */
interface FluentChoice {
  name: string;
  svg?: string;
}

/** The Fluent choice an icon stands for, or null for a site or letter icon. */
const fluentOf = (icon: LauncherIconSpec | undefined): FluentChoice | null =>
  icon?.kind === "fluent" ? { name: icon.name, svg: trustedIconSvg(icon) } : null;

const MODE_OPTIONS = [
  { value: "site", label: ru.settings.launchers.iconSite, icon: "globe" },
  { value: "fluent", label: ru.settings.launchers.iconFluent, icon: "apps" },
  { value: "letter", label: ru.settings.launchers.iconLetter, icon: "text_font" },
] as const satisfies readonly SegmentedOption<IconMode>[];

const NAME_MAX = 40;

/**
 * Longest wait for a site icon. favicon.rs tries up to nine addresses with 8 s each, so on a network without
 * internet (connected, nothing answers) the lookup could keep «Сохранить» busy for a minute; after this the
 * editor treats it as failed (the lookup ends on its own in the background and its result is dropped).
 */
const FETCH_DEADLINE_MS = 45_000;

/** `p`, or null when it has not settled within `ms`. A later rejection of `p` is absorbed by the race. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer = 0;
  const late = new Promise<null>((resolve) => {
    timer = window.setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p, late]).finally(() => window.clearTimeout(timer));
}

/**
 * «Добавить ярлык» / «Изменить ярлык»: live cell preview, name, URL, icon mode (site, Fluent set, letter)
 * and colour, for custom and built-in launchers alike.
 * - Site: an address on DU, LMS or Learn takes the icon bundled with the app (bundledSiteIcon), so it needs
 *   no network. Any other site's icon is fetched once on save (fetch_site_icon, the only network use, cut
 *   off after FETCH_DEADLINE_MS); on failure the dialog stays open with an explanation, and a second
 *   «Сохранить» keeps the letter fallback.
 * - Fluent: two rows of popular icons right here, «Смотреть все» opens the full set in its own scrollable
 *   window. Saving stores the icon's markup in the launcher (icon.svg), so the desktop tile draws it
 *   without loading the full icon set.
 * - Built-in: saving keeps only what differs from the original (saveBuiltIn); its original icon is the
 *   bundled site icon, never stored. While the form differs from the original, «Вернуть как было» puts the
 *   original name, address, site icon and colour back into the form; «Сохранить» then stores them, «Отмена»
 *   keeps the launcher as it was.
 * Focus and Esc are the kit's job: the Dialog focuses its first form field (the name) and routes Esc to the
 * top-most dialog, so the nested icon picker closes first and the editor stays open.
 */
export function LauncherEditor({ item, showLabels, onClose }: Props) {
  /** The built-in launcher being edited, or null for a custom or new one. */
  const builtIn = item?.kind === "builtin" ? item.id : null;
  const original = useMemo(() => (builtIn ? builtInOriginal(builtIn) : null), [builtIn]);
  const [name, setName] = useState(item?.name ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [mode, setMode] = useState<IconMode>(item?.icon.kind ?? "site");
  // A built-in shown with its site icon (or a letter) offers its own Fluent icon first in the Fluent mode.
  const [fluent, setFluent] = useState<FluentChoice>(
    () => fluentOf(item?.icon) ?? { name: builtIn ? builtInDef(builtIn).fluent : DEFAULT_FLUENT_ICON },
  );
  const [color, setColor] = useState(() => item?.color ?? nextLauncherColor(settings.get()));
  const [touched, setTouched] = useState({ name: false, url: false });
  const [loading, setLoading] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** False after «Вернуть как было»: a site image the launcher fetched before gives way to the original one. */
  const [keepOwnImage, setKeepOwnImage] = useState(true);
  /** False once unmounted, so a fetch that outlives the dialog does not set state or save. */
  const alive = useRef(true);
  /** One id per editor: a repeated «Сохранить» (double click, held Enter) replaces, never duplicates. */
  const id = useRef(item?.kind === "custom" ? item.id : newLauncherId());
  /** A save in progress; further requests are ignored until it ends. */
  const busy = useRef(false);
  const saveId = useId();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const closePicker = useCallback(() => setPickerOpen(false), []);
  const pickPopular = useCallback((n: string) => setFluent({ name: n }), []);
  const pickFromSet = useCallback((n: string, svg?: string) => {
    setFluent({ name: n, svg });
    setPickerOpen(false);
  }, []);

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  /** The site image the launcher already has stays valid only while the URL is unchanged. */
  const ownData =
    keepOwnImage && item?.icon.kind === "site" && isImageDataUrl(item.icon.data) && item.url === trimmedUrl
      ? item.icon.data
      : undefined;
  /** An address on DU, LMS or Learn takes the icon bundled with the app: nothing to fetch. */
  const bundled = bundledSiteIcon(trimmedUrl);
  const cachedData = ownData ?? bundled;
  /** The icon in use is the bundled one (a built-in's own, or one taken for such an address): the hint says so. */
  const usesBundled = bundled !== undefined && cachedData === bundled;
  const previewIcon: LauncherIconSpec =
    mode === "fluent"
      ? { kind: "fluent", name: fluent.name, svg: fluent.svg }
      : mode === "letter"
        ? { kind: "letter" }
        : { kind: "site", data: cachedData };
  const look: LauncherLook = {
    name: trimmedName || extra.untitled,
    // A built-in keeps its short tile caption («DU») until it is renamed, as on the tile.
    caption: original && trimmedName === original.name ? original.caption : undefined,
    url: trimmedUrl,
    icon: previewIcon,
    color,
  };
  /** «Вернуть как было» is offered while the form shows a built-in that differs from its original. */
  const changed = builtIn !== null && !isBuiltInOriginal(builtIn, { name: trimmedName, url: trimmedUrl, icon: previewIcon, color });

  const nameError = touched.name && !trimmedName ? ru.settings.launchers.nameRequired : undefined;
  let urlError: string | undefined;
  if (touched.url && !isValidUrl(url)) urlError = hasSpaces(url) ? extra.urlSpaces : ru.settings.launchers.urlInvalid;
  const valid = Boolean(trimmedName) && isValidUrl(url);
  const failed = failedUrl !== null && failedUrl === trimmedUrl;

  /** The icon to store, or null when saving has to stop (the site icon could not be fetched). */
  const resolveIcon = async (): Promise<LauncherIconSpec | null> => {
    if (mode === "fluent") {
      const known = fluent.svg && isIconMarkup(fluent.svg) ? fluent.svg : undefined;
      const svg = known ?? (await iconSvgFor(fluent.name));
      return svg ? { kind: "fluent", name: fluent.name, svg } : { kind: "fluent", name: fluent.name };
    }
    if (mode === "letter") return { kind: "letter" };
    if (cachedData) return { kind: "site", data: cachedData };
    if (failed) return { kind: "site" }; // second confirmation after a failed fetch: keep the letter
    setLoading(true);
    let data: unknown = null;
    try {
      data = await withDeadline(invoke<string>("fetch_site_icon", { url: trimmedUrl }), FETCH_DEADLINE_MS);
    } catch {
      data = null;
    }
    if (!alive.current) return null;
    setLoading(false);
    if (typeof data !== "string" || !isImageDataUrl(data)) {
      setFailedUrl(trimmedUrl);
      return null;
    }
    return { kind: "site", data };
  };

  const save = async () => {
    setTouched({ name: true, url: true });
    if (!valid || busy.current) return;
    busy.current = true;
    try {
      const icon = await resolveIcon();
      if (!icon || !alive.current) return;
      const draft = { name: trimmedName, url: trimmedUrl, icon, color };
      await (builtIn ? saveBuiltIn(builtIn, draft) : upsertCustom({ id: id.current, ...draft }));
      if (alive.current) onClose();
    } finally {
      busy.current = false;
    }
  };

  const restore = () => {
    if (!original) return;
    setName(original.name);
    setUrl(original.url);
    setMode(original.icon.kind);
    // Its own icon from the set comes back too (the one offered first when «Из набора» is chosen).
    if (builtIn) setFluent({ name: builtInDef(builtIn).fluent });
    setKeepOwnImage(false);
    setColor(original.color);
    // The button goes away with the difference: keep the keyboard on the step that follows.
    document.getElementById(saveId)?.focus();
  };

  const onFieldKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  let siteHint: string = ru.settings.launchers.iconSiteHint;
  if (loading) siteHint = ru.settings.launchers.iconLoading;
  else if (failed) siteHint = ru.settings.launchers.iconFailed;
  else if (usesBundled) siteHint = extra.siteIconBundled;
  else if (cachedData) siteHint = extra.siteIconReady;

  // The picker is a sibling of the editor's Dialog, not its child: while the editor plays its entrance
  // transform, a transformed ancestor would become the containing block of the picker's fixed backdrop and
  // squeeze the picker into the editor. Esc still closes the top-most dialog first (kit Dialog stack).
  return (
    <>
      <Dialog
        open
        title={item ? ru.settings.launchers.editLauncher : ru.settings.launchers.addLauncher}
        onClose={onClose}
        footer={
          <>
            {changed && (
              <Button variant="subtle" icon="arrow_reset" className="ln-restore" onClick={restore} disabled={loading}>
                {extra.restore}
              </Button>
            )}
            <Button onClick={onClose}>{ru.common.cancel}</Button>
            <Button id={saveId} variant="accent" onClick={() => void save()} disabled={loading}>
              {loading ? ru.settings.launchers.iconLoading : ru.common.save}
            </Button>
          </>
        }
      >
        <div className="ln-editor">
          <div className="ln-editor-preview" role="img" aria-label={ru.common.preview}>
            <div className="ln-preview-tile">
              <LauncherCell look={look} showLabel={showLabels} />
            </div>
          </div>

          <div className={loading ? "ln-form ln-busy" : "ln-form"} aria-busy={loading}>
            <TextField
              label={ru.settings.launchers.name}
              value={name}
              onChange={setName}
              placeholder={ru.settings.launchers.namePlaceholder}
              error={nameError}
              maxLength={NAME_MAX}
              disabled={loading}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              onKeyDown={onFieldKey}
            />
            <TextField
              label={ru.settings.launchers.url}
              value={url}
              onChange={setUrl}
              placeholder={ru.settings.launchers.urlPlaceholder}
              mono
              type="url"
              error={urlError}
              disabled={loading}
              onBlur={() => setTouched((t) => ({ ...t, url: true }))}
              onKeyDown={onFieldKey}
            />

            <div className="ln-field">
              <span className="ln-field-label">{ru.settings.launchers.icon}</span>
              <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} fill ariaLabel={ru.settings.launchers.icon} />
              {mode === "fluent" ? (
                <div className="ln-fluent">
                  <PopularIcons value={fluent.name} valueSvg={fluent.svg} onPick={pickPopular} />
                  <div className="ln-fluent-foot">
                    <span className="hint">{extra.fullSetHint(ALL_ICON_NAMES.length)}</span>
                    <Button icon="apps" onClick={() => setPickerOpen(true)}>
                      {ru.common.showAll}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="ln-mode">
                  <LauncherIcon look={look} />
                  <div className="ln-mode-text">
                    {mode === "site" ? (
                      <>
                        <span className={failed ? "ln-warn" : undefined}>{siteHint}</span>
                        {failed && <span className="hint">{extra.saveAnyway}</span>}
                      </>
                    ) : (
                      <span>{extra.letterHint}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="ln-field">
              <span className="ln-field-label">{ru.settings.launchers.color}</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>
        </div>
      </Dialog>
      {pickerOpen && <IconPickerDialog value={fluent.name} onSelect={pickFromSet} onClose={closePicker} />}
    </>
  );
}
