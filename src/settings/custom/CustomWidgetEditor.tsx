// «Новый виджет» / «Свой виджет»: a live preview beside the name, the picture (the Windows open dialog; the file
// is checked and copied by src-tauri/src/custom.rs), how it fills the widget and whether it sits on glass. An own
// widget can be deleted here, after a confirmation; the built-in ones only switch off.
//
// The preview is the desktop widget itself (src/tiles/Custom.tsx: the real .tile material and .custom-picture) on
// the accent desk of the other settings previews (.sys-desk), so design, palette, accent, «Как показывать» and
// «Фон виджета» show as they will. The picture is the one chosen in this dialog before it is saved (the copy
// pick_widget_image has already made), an animation moves; it is a square of a new widget's size
// (custom.rs DEFAULT_SIZE), since nothing tells the settings how an existing one was resized. Nothing ticks:
// the picture's blob URLs live as long as the dialog (useWidgetImage revokes them), so a GIF moves only while it
// is open.
import { useCallback, useEffect, useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { Segmented, type SegmentedOption } from "../../components/Segmented";
import { Switch } from "../../components/Switch";
import { TextField } from "../../components/TextField";
import { ru } from "../../i18n/ru";
import { extra as shell } from "../../i18n/ru.extra.shell";
import { CUSTOM_NAME_MAX, customLabel, newCustomId, settings, type CustomWidget } from "../../lib/settings";
import { useWidgetImage } from "../../lib/widgetImage";

const c = shell.custom;

const FIT_OPTIONS = [
  { value: "cover", label: c.fitCover },
  { value: "contain", label: c.fitContain },
] as const satisfies readonly SegmentedOption<CustomWidget["fit"]>[];

/** The empty preview's shortcut to «Выбрать картинку» keeps the focus where it was (the form has the real button). */
const keepFocus = (e: MouseEvent) => e.preventDefault();

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
  // An existing widget's proportions, from the rect it was given on the desktop (also while it is folded to an
  // icon); a new one, or one never resized, is the default square.
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    if (!widget) return;
    let alive = true;
    invoke<{ w: number; h: number } | null>("get_tile_rect", { label: customLabel(widget.id) })
      .then((r) => {
        if (alive && r && r.w > 0 && r.h > 0) setAspect(Math.min(4, Math.max(0.25, r.w / r.h)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [widget]);
  const missing = image === "missing";
  const ready = image !== null && image !== "missing";
  const closeConfirm = useCallback(() => setConfirm(false), []);
  const previewId = useId();

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

  // No picture yet (or its file is gone): a dashed place that invites to choose one. A picture still being read
  // leaves the widget empty for that moment instead of flashing the invitation.
  const blank = file === null || missing;
  const tileCls = ["tile tile-custom cw-tile", background ? "" : "no-bg", blank ? "is-empty" : ""].filter(Boolean).join(" ");

  return (
    <>
      <Dialog
        open
        title={widget ? c.editTitle : c.newTitle}
        onClose={onClose}
        width="640px"
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
        {/* The form comes first, so the Dialog focuses the name; the preview is laid out to its left (custom.css). */}
        <div className="cw-editor">
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

          <div className="cw-stage">
            <span id={previewId} className="cw-field-label">
              {c.previewTitle}
            </span>
            <div className="sys-desk cw-desk">
              <div
                className={tileCls}
                role={ready ? "img" : undefined}
                aria-labelledby={ready ? previewId : undefined}
                // Wide: the full width and lower; tall: the full height and narrower (custom.css --cw-side).
                style={{ aspectRatio: String(aspect), width: aspect < 1 ? `calc(var(--cw-side) * ${aspect.toFixed(3)})` : undefined }}
              >
                {ready ? (
                  <img className="custom-picture" src={image.url} alt="" draggable={false} style={{ objectFit: fit }} />
                ) : (
                  blank && (
                    // A shortcut for the mouse; the keyboard has the same button in the form.
                    <button type="button" className="cw-pick" tabIndex={-1} onMouseDown={keepFocus} onClick={() => void pick()} disabled={picking}>
                      <Icon name={missing ? "image" : "image_add"} size={24} />
                      <span className="caption">{missing ? c.pictureMissing : c.previewChoose}</span>
                    </button>
                  )
                )}
              </div>
            </div>
            <span className="cw-hint">{widget ? c.previewHint : c.previewHintNew}</span>
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
