// «Язык · Language» in the bottom-left corner of the settings window, under «Как пользоваться»: a small button
// that reads «RU | EN», the language in use bright. Its menu offers «Как в Windows», Русский and English, each
// name in its own language so anyone finds theirs, drawn like the sidebar's items (the one in use looks like the
// selected page in every design); picking another one asks first, since the app restarts to switch.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Tooltip } from "../../components/Tooltip";
import { LANG } from "../../i18n/lang";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.shell";
import { settings, type LanguageSetting } from "../../lib/settings";
import { useSettings } from "../../lib/useSettings";

const x = extra.general;

export const LANGUAGE_OPTIONS: readonly { value: LanguageSetting; label: string }[] = [
  { value: "auto", label: x.languageAuto },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

export function LanguageSwitch() {
  const { language } = useSettings();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** The language picked in the menu, waiting for «Перезапустить». */
  const [pending, setPending] = useState<LanguageSetting | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = LANGUAGE_OPTIONS.findIndex((o) => o.value === language);

  // The menu closes on a press outside it and when the window loses focus.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onBlur = () => setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, current));
    setOpen(true);
  };

  const choose = (value: LanguageSetting) => {
    setOpen(false);
    btnRef.current?.focus();
    if (value !== language) setPending(value);
  };

  // Like a list box: the focus stays on the button, the arrows move through the menu, Enter picks, Esc closes.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openMenu();
      else setActive((i) => (i + (e.key === "ArrowDown" ? 1 : LANGUAGE_OPTIONS.length - 1)) % LANGUAGE_OPTIONS.length);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      choose(LANGUAGE_OPTIONS[active].value);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };


  return (
    <div ref={rootRef} className="lang-switch">
      <Tooltip text={x.language} disabled={open}>
        <button
          ref={btnRef}
          type="button"
          className={open ? "lang-btn open" : "lang-btn"}
          aria-label={`${x.language}: ${LANGUAGE_OPTIONS[Math.max(0, current)].label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKey}
        >
          <span className={LANG === "ru" ? "lang-code on" : "lang-code"}>RU</span>
          <span className="lang-sep" aria-hidden="true" />
          <span className={LANG === "en" ? "lang-code on" : "lang-code"}>EN</span>
        </button>
      </Tooltip>
      {open && (
        <div className="popover lang-menu" role="menu" aria-label={x.language}>
          {LANGUAGE_OPTIONS.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === language}
              tabIndex={-1}
              className={["nav-item", o.value === language ? "selected" : "", i === active ? "active" : ""].filter(Boolean).join(" ")}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o.value)}
            >
              <span className="ellipsis">{o.label}</span>
            </button>
          ))}
        </div>
      )}
      <LanguageDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}

/**
 * Asks before switching to `pending`: the setting is saved first (the native side reads it when it starts), then
 * the app starts again in that language. Shared by this button and the «Язык» row on «Общие».
 */
export function LanguageDialog({ pending, onClose }: { pending: LanguageSetting | null; onClose: () => void }) {
  const close = useCallback(() => onClose(), [onClose]);
  const apply = async () => {
    if (pending === null) return;
    await settings.update({ language: pending });
    await invoke("restart_app").catch(() => onClose());
  };
  return (
    <Dialog
      open={pending !== null}
      title={x.languageTitle}
      onClose={close}
      width="440px"
      footer={
        <>
          <Button onClick={close}>{ru.common.cancel}</Button>
          <Button variant="accent" onClick={() => void apply()}>
            {x.languageRestart}
          </Button>
        </>
      }
    >
      <p className="reset-text">{x.languageText}</p>
    </Dialog>
  );
}
