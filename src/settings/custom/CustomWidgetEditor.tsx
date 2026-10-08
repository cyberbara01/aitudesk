// «Новый виджет» / «Свой виджет»: a live preview, the name, the picture (the Windows open dialog; the file is
// checked and copied by src-tauri/src/custom.rs), how it fills the widget and whether it sits on glass. An own
// widget can be deleted here, after a confirmation; the built-in ones only switch off.
import { useCallback, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { Switch } from "../../components/Switch";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra as shell } from "../../i18n/ru.extra.shell";
import { CUSTOM_NAME_MAX, newCustomId, settings, type CustomWidget } from "../../lib/settings";
import { useWidgetImage } from "../../lib/widgetImage";

const c = shell.custom;

const FIT_OPTIONS = [
  { value: "cover", label: c.fitCover },
  { value: "contain", label: c.fitContain },
] as const satisfies readonly SegmentedOption<CustomWidget["fit"]>[];

/** Why a picture was not taken, from pick_widget_image's error. */
function pickError(e: unknown): string {
  if (e === "too large") return c.tooLarge;
  if (e === "not a picture") return c.notPicture;
  return c.pickFailed;
}

interface Props {
  /** null = a new widget. */
  widget: CustomWidget | null;
  /** Keep it referentially stable: the Dialog re-registers in the Esc stack whenever it changes. */
  onClose: () => void;
}

export function CustomWidgetEditor({ widget, onClose }: Props) {
  const [name, setName] = useState(widget?.name ?? "");
  const [file, setFile] = useState<string | null>(widget?.file ?? null);
  const [fit, setFit] = useState<CustomWidget["fit"]>(widget?.fit ?? "cover");
  const [background, setBackground] = useState(widget?.background ?? false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const image = useWidgetImage(file);
  const missing = image === "missing";
  const closeConfirm = useCallback(() => setConfirm(false), []);

  const pick = async () => {
    setPicking(true);
    setError("");
    try {
      const stored = await invoke<string | null>("pick_widget_image");
      if (stored) setFile(stored);
    } catch (e) {
      setError(pickError(e));
    } finally {
      setPicking(false);
    }
  };

  const valid = file !== null && !missing;
  const save = async () => {
    if (!valid || !file) return;
    const draft = { name: name.trim().slice(0, CUSTOM_NAME_MAX), file, fit, background };
    await settings.update((cur) => ({
      customWidgets: widget
        ? cur.customWidgets.map((w) => (w.id === widget.id ? { ...w, ...draft } : w))
        : [...cur.customWidgets, { id: newCustomId(), enabled: true, ...draft }],
    }));
    onClose();
  };

  const remove = async () => {
    if (!widget) return;
    setConfirm(false);
    await settings.update((cur) => ({ customWidgets: cur.customWidgets.filter((w) => w.id !== widget.id) }));
    onClose();
  };

  const onNameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  const shown = name.trim() || c.unnamed;
  let pictureHint: string = c.pictureHint;
  if (error) pictureHint = error;
  else if (missing) pictureHint = c.pictureMissing;

  return (
    <>
      <Dialog
        open
        title={widget ? c.editTitle : c.newTitle}
        onClose={onClose}
        footer={
          <>
            {widget && (
              <Button variant="danger" icon="delete" className="cw-remove" onClick={() => setConfirm(true)}>
                {c.remove}
              </Button>
            )}
            <Button onClick={onClose}>{ru.common.cancel}</Button>
            <Button variant="accent" onClick={() => void save()} disabled={!valid}>
              {ru.common.save}
            </Button>
          </>
        }
      >
        <div className="cw-editor">
          <div className="cw-preview" role="img" aria-label={ru.common.preview}>
            <div className={background ? "cw-preview-tile" : "cw-preview-tile no-bg"}>
              {image && image !== "missing" ? (
                <img src={image.url} alt="" draggable={false} style={{ objectFit: fit }} />
              ) : (
                <span className="cw-preview-empty">
                  <Icon name="image" size={24} />
                  <span className="caption">{missing ? c.pictureMissing : c.noPicture}</span>
                </span>
              )}
            </div>
          </div>

          <div className="cw-form">
            <TextField
              label={c.name}
              value={name}
              onChange={setName}
              placeholder={c.namePlaceholder}
              maxLength={CUSTOM_NAME_MAX}
              onKeyDown={onNameKey}
            />

            <div className="cw-field">
              <span className="cw-field-label">{c.picture}</span>
              <div className="cw-picture">
                <Button icon="image_add" onClick={() => void pick()} disabled={picking}>
                  {file && !missing ? c.change : c.choose}
                </Button>
                <span className={error || missing ? "cw-hint cw-warn" : "cw-hint"} role={error ? "alert" : undefined}>
                  {pictureHint}
                </span>
              </div>
            </div>

            <div className="cw-field">
              <span className="cw-field-label">{c.fit}</span>
              <Segmented options={FIT_OPTIONS} value={fit} onChange={setFit} fill ariaLabel={c.fit} />
              <span className="cw-hint">{c.fitHint}</span>
            </div>

            <Switch checked={background} onChange={setBackground} label={c.background} hint={c.backgroundHint} />
          </div>
        </div>
      </Dialog>
      <Dialog
        open={confirm}
        title={c.removeTitle}
        onClose={closeConfirm}
        width="440px"
        footer={
          <>
            <Button onClick={closeConfirm}>{ru.common.cancel}</Button>
            <Button variant="accent" onClick={() => void remove()}>
              {c.remove}
            </Button>
          </>
        }
      >
        <p className="reset-text">{c.removeText(shown)}</p>
      </Dialog>
    </>
  );
}
