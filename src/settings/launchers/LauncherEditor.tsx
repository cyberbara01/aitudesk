import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/Button";
import { ColorPicker } from "../../components/ColorPicker";
import { Dialog } from "../../components/Dialog";
import { ALL_ICON_NAMES } from "../../components/Icon";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.launchers";
import { SWATCHES } from "../../lib/design";
import { DEFAULT_FLUENT_ICON, isValidUrl, newLauncherId, upsertCustom, type IconMode } from "../../lib/launchers";
import type { CustomLauncher, LauncherIcon as LauncherIconSpec } from "../../lib/settings";
import { IconPickerDialog } from "./IconPickerDialog";
import { LauncherCell, LauncherIcon, type LauncherLook } from "./LauncherIcon";

interface Props {
  /** null = a new launcher. */
  item: CustomLauncher | null;
  /** Mirrors settings.launchers.showLabels in the live preview. */
  showLabels: boolean;
  /** Keep it referentially stable: the Dialog re-registers in the Esc stack whenever it changes. */
  onClose: () => void;
}

const MODE_OPTIONS = [
  { value: "site", label: ru.settings.launchers.iconSite, icon: "globe" },
  { value: "fluent", label: ru.settings.launchers.iconFluent, icon: "apps" },
  { value: "letter", label: ru.settings.launchers.iconLetter, icon: "text_font" },
] as const satisfies readonly SegmentedOption<IconMode>[];

const NAME_MAX = 40;

/**
 * "Добавить / Изменить ярлык": live cell preview, name, URL, icon mode (site / Fluent / letter) and colour.
 * Saving a site-icon launcher fetches the icon once (fetch_site_icon); on failure the dialog stays open
 * with an explanation, and a second "Сохранить" keeps the letter fallback.
 * Focus and Esc are the kit's job: the Dialog focuses its first form field (the name) and routes Esc to the
 * top-most dialog, so the nested icon picker closes first and the editor stays open.
 */
export function LauncherEditor({ item, showLabels, onClose }: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [mode, setMode] = useState<IconMode>(item?.icon.kind ?? "site");
  const [fluentName, setFluentName] = useState(item?.icon.kind === "fluent" ? item.icon.name : DEFAULT_FLUENT_ICON);
  const [color, setColor] = useState(item?.color ?? SWATCHES[0]);
  const [touched, setTouched] = useState({ name: false, url: false });
  const [loading, setLoading] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** False once unmounted, so a fetch that outlives the dialog does not set state or close twice. */
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  /** The cached site icon stays valid only while the URL is unchanged. */
  const cachedData = item?.icon.kind === "site" && item.icon.data && item.url === trimmedUrl ? item.icon.data : undefined;
  const previewIcon: LauncherIconSpec =
    mode === "fluent" ? { kind: "fluent", name: fluentName } : mode === "letter" ? { kind: "letter" } : { kind: "site", data: cachedData };
  const look: LauncherLook = { name: trimmedName || extra.untitled, url: trimmedUrl, icon: previewIcon, color };

  const nameError = touched.name && !trimmedName ? ru.settings.launchers.nameRequired : undefined;
  const urlError = touched.url && !isValidUrl(url) ? ru.settings.launchers.urlInvalid : undefined;
  const valid = Boolean(trimmedName) && isValidUrl(url);
  const failed = failedUrl !== null && failedUrl === trimmedUrl;

  const save = async () => {
    setTouched({ name: true, url: true });
    if (!valid || loading) return;
    let icon: LauncherIconSpec;
    if (mode === "fluent") icon = { kind: "fluent", name: fluentName };
    else if (mode === "letter") icon = { kind: "letter" };
    else if (cachedData) icon = { kind: "site", data: cachedData };
    else if (failed) icon = { kind: "site" }; // second confirmation after a failed fetch: keep the letter
    else {
      setLoading(true);
      let data: string | null = null;
      try {
        data = await invoke<string>("fetch_site_icon", { url: trimmedUrl });
      } catch {
        data = null;
      }
      if (!alive.current) return;
      setLoading(false);
      if (!data) {
        setFailedUrl(trimmedUrl);
        return;
      }
      icon = { kind: "site", data };
    }
    await upsertCustom({ id: item?.id ?? newLauncherId(), name: trimmedName, url: trimmedUrl, icon, color });
    if (alive.current) onClose();
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
  else if (cachedData) siteHint = extra.siteIconReady;

  return (
    <Dialog
      open
      title={item ? ru.settings.launchers.editLauncher : ru.settings.launchers.addLauncher}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{ru.common.cancel}</Button>
          <Button variant="accent" onClick={() => void save()} disabled={loading}>
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
            <div className="ln-mode">
              {mode === "fluent" ? (
                <button type="button" className="ln-mode-icon" aria-label={ru.settings.launchers.pickIcon} onClick={() => setPickerOpen(true)}>
                  <LauncherIcon look={look} />
                </button>
              ) : (
                <LauncherIcon look={look} />
              )}
              <div className="ln-mode-text">
                {mode === "site" && (
                  <>
                    <span className={failed ? "ln-warn" : undefined}>{siteHint}</span>
                    {failed && <span className="hint">{extra.saveAnyway}</span>}
                  </>
                )}
                {mode === "fluent" && (
                  <>
                    <span className="mono ellipsis">{fluentName}</span>
                    <span className="hint">{extra.fluentHint(ALL_ICON_NAMES.length)}</span>
                  </>
                )}
                {mode === "letter" && <span>{extra.letterHint}</span>}
              </div>
              {mode === "fluent" && (
                <Button icon="apps" onClick={() => setPickerOpen(true)}>
                  {ru.settings.launchers.pickIcon}
                </Button>
              )}
            </div>
          </div>

          <div className="ln-field">
            <span className="ln-field-label">{ru.settings.launchers.color}</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
      </div>

      {pickerOpen && (
        <IconPickerDialog
          value={fluentName}
          onSelect={(n) => {
            setFluentName(n);
            closePicker();
          }}
          onClose={closePicker}
        />
      )}
    </Dialog>
  );
}
