// «Общие»: the program itself. «Запуск» (start with Windows, on from the first start), «Язык» (the same choice as
// the small «RU | EN» button in the bottom-left corner, src/settings/shell/LanguageSwitch.tsx), and the resets:
// the widgets' layout, the appearance, and everything («Сбросить всё», the app as right after installing).
// Everything about the widgets themselves is on «Виджеты» (WidgetsPage.tsx).
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Page, Row, Section } from "../components/Section";
import { Select, type SelectOption } from "../components/Select";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { disable, enable } from "../lib/autostart";
import { settings, type LanguageSetting } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { ResultText, autostartOn, useExternal, type Outcome } from "./shell/external";
import { useSettled, useTransient } from "./shell/hooks";
import { IconRow } from "./shell/IconRow";
import { LANGUAGE_OPTIONS, LanguageDialog } from "./shell/LanguageSwitch";

const g = ru.settings.general;
const x = extra.general;

const LANGUAGE_SELECT: readonly SelectOption<LanguageSetting>[] = LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

export function GeneralPage() {
  const s = useSettings();
  const [autostart, setAutostart] = useExternal(autostartOn);
  const autostartSettled = useSettled(autostart !== null);
  const [autostartFailed, flashAutostartFailed] = useTransient(false, 4000);
  /** The language picked in the row, waiting for «Перезапустить». */
  const [language, setLanguage] = useState<LanguageSetting | null>(null);
  const [layoutReset, flashLayoutReset] = useTransient<Outcome>("idle");
  const [lookReset, flashLookReset] = useTransient<Outcome>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);
  const [everythingOpen, setEverythingOpen] = useState(false);
  const closeEverything = useCallback(() => setEverythingOpen(false), []);
  const [everythingFailed, flashEverythingFailed] = useTransient(false, 4000);

  const toggleAutostart = (on: boolean) => {
    setAutostart(on);
    (on ? enable() : disable()).catch(() => {
      setAutostart(!on);
      flashAutostartFailed(true);
    });
  };

  // Back to the first places and sizes: every widget «Вручную» again, at its default rect.
  const resetLayout = async () => {
    try {
      await settings.update({ tileViews: {} });
      await invoke("reset_layout");
      flashLayoutReset("done");
    } catch {
      flashLayoutReset("failed");
    }
  };

  const resetLook = () => {
    setConfirmOpen(false);
    settings.resetCustomization().then(
      () => flashLookReset("done"),
      () => flashLookReset("failed"),
    );
  };

  // «Сбросить всё»: the native side clears everything and starts the app again (this window closes with it).
  const resetEverything = () => {
    invoke("reset_everything").catch(() => {
      setEverythingOpen(false);
      flashEverythingFailed(true);
    });
  };

  return (
    <Page title={ru.settings.nav.general} description={x.desc}>
      <Section title={x.startup}>
        <IconRow icon="power" label={g.autostart} hint={g.autostartHint} error={autostartFailed ? x.autostartFailed : undefined}>
          <span className={autostartSettled ? undefined : "settling"}>
            <Switch checked={autostart ?? false} disabled={autostart === null} onChange={toggleAutostart} ariaLabel={g.autostart} />
          </span>
        </IconRow>
      </Section>

      <Section title={x.languageSection}>
        <IconRow icon="globe" label={x.language} hint={x.languageHint}>
          <Select
            options={LANGUAGE_SELECT}
            value={s.language}
            onChange={(v) => {
              if (v !== s.language) setLanguage(v);
            }}
            ariaLabel={x.language}
          />
        </IconRow>
      </Section>

      <Section title={x.reset}>
        <Row label={x.layoutLabel} hint={x.layoutHint} stack>
          <span className="inline">
            <Button icon="arrow_reset" onClick={() => void resetLayout()}>
              {g.resetLayout}
            </Button>
            <ResultText outcome={layoutReset} done={g.resetLayoutDone} failed={x.resetLayoutFailed} />
          </span>
        </Row>
        <Row label={x.appearanceLabel} hint={x.appearanceHint} stack>
          <span className="inline">
            <Button icon="arrow_reset" onClick={() => setConfirmOpen(true)}>
              {ru.common.resetAll}
            </Button>
            <ResultText outcome={lookReset} done={x.resetAllDone} failed={x.resetAllFailed} />
          </span>
        </Row>
        <Row label={x.everythingLabel} hint={x.everythingHint} stack>
          <span className="inline">
            <Button variant="danger" icon="arrow_reset" onClick={() => setEverythingOpen(true)}>
              {x.everything}
            </Button>
            <ResultText outcome={everythingFailed ? "failed" : "idle"} done="" failed={x.everythingFailed} />
          </span>
        </Row>
      </Section>

      <LanguageDialog pending={language} onClose={() => setLanguage(null)} />

      <Dialog
        open={confirmOpen}
        title={ru.common.resetAllTitle}
        onClose={closeConfirm}
        width="440px"
        footer={
          <>
            <Button onClick={closeConfirm}>{ru.common.cancel}</Button>
            <Button variant="accent" onClick={resetLook}>
              {ru.common.reset}
            </Button>
          </>
        }
      >
        <p className="reset-text">{ru.common.resetAllText}</p>
      </Dialog>

      <Dialog
        open={everythingOpen}
        title={x.everythingTitle}
        onClose={closeEverything}
        width="460px"
        footer={
          <>
            <Button onClick={closeEverything}>{ru.common.cancel}</Button>
            <Button variant="danger" className="solid" onClick={resetEverything}>
              {x.everything}
            </Button>
          </>
        }
      >
        <p className="reset-text">{x.everythingText}</p>
        <p className="reset-text reset-keep">{x.everythingKeep(ru.settings.nav.transfer)}</p>
      </Dialog>
    </Page>
  );
}
