// «Общие»: «Все плитки» (every tile off the desktop and back with one button), the tiles one by one, desktop
// behaviour (lock layout), autostart, and the resets (tile layout, the whole customization).
import { useCallback, useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { onAutostartChange } from "../lib/autostart";
import { Button, IconButton } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { TILE_IDS, settings, type TileId } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useSettled, useTransient } from "./shell/hooks";
import { IconRow } from "./shell/IconRow";
import { TILE_ICONS, useNavigate } from "./shell/nav";

const g = ru.settings.general;
const x = extra.general;

// ---------------------------------------------------------------------------------------------
// «Все плитки» and autostart live outside the settings file. Both are read once when the settings
// window loads its code, so even the first visit to this page usually paints the real state in its first
// frame, and read again on every visit. A local change bumps `version`, so an older read cannot undo it.
// ---------------------------------------------------------------------------------------------

interface External {
  value: boolean | null;
  version: number;
  read: () => Promise<boolean>;
}

function external(read: () => Promise<boolean>): External {
  const e: External = {
    value: null,
    version: 0,
    read: () => {
      const started = e.version;
      return read().then((v) => {
        if (e.version === started) e.value = v;
        return e.value ?? v;
      });
    },
  };
  void e.read();
  return e;
}

const tilesVisible = external(() => invoke<boolean>("get_tiles_hidden").then((hidden) => !hidden, () => true));
const autostartOn = external(() => isEnabled().catch(() => false));
// Switched on the welcome page or on «Напоминания»: the first frame here shows that already.
onAutostartChange((on) => {
  autostartOn.version += 1;
  autostartOn.value = on;
});

/** Component state mirroring an External value: the last known value first, refreshed on mount. */
function useExternal(e: External): [boolean | null, (v: boolean) => void] {
  const [value, setValue] = useState(e.value);
  useEffect(() => {
    let alive = true;
    e.read().then((v) => {
      if (alive) setValue(v);
    });
    return () => {
      alive = false;
    };
  }, [e]);
  const set = useCallback(
    (v: boolean) => {
      e.version += 1;
      e.value = v;
      setValue(v);
    },
    [e],
  );
  return [value, set];
}

// ---------------------------------------------------------------------------------------------

type Outcome = "idle" | "done" | "failed";

/** Result of an action, next to its button. A polite live region that stays mounted (empty while idle). */
function ResultText({ outcome, done, failed }: { outcome: Outcome; done: string; failed: string }) {
  const cls = outcome === "done" ? "status-text ok" : outcome === "failed" ? "status-text fail" : "status-text";
  return (
    <span className={cls} role="status">
      {outcome === "done" ? done : outcome === "failed" ? failed : ""}
    </span>
  );
}

interface AllTilesProps {
  /** null until the native side has answered. */
  visible: boolean | null;
  /** False keeps transitions off while the first answer lands. */
  settled: boolean;
  onChange: (visible: boolean) => void;
}

/**
 * «Все плитки», first on the page: hidden tiles stay hidden after a restart, and the app then opens right here.
 * The state reads at a glance (the mark lit or out, one line of state) and there is one button; showing the
 * tiles again is the accent action. Nothing that depends on the state is drawn before it is known.
 */
function AllTiles({ visible, settled, onChange }: AllTilesProps) {
  const titleId = useId();
  const hidden = visible === false;
  const cls = ["section all-tiles", hidden ? "off" : "", visible === null ? "pending" : "", settled ? "" : "settling"].filter(Boolean).join(" ");
  return (
    <section className={cls} aria-labelledby={titleId}>
      <span className="all-tiles-mark" aria-hidden="true">
        <Icon name={hidden ? "eye_off" : "eye"} />
      </span>
      <div className="all-tiles-text">
        <span id={titleId} className="all-tiles-title">
          {x.allTiles}
        </span>
        <span className="all-tiles-state" role="status">
          {visible === null ? "" : hidden ? x.allTilesHidden : x.allTilesShown}
        </span>
      </div>
      <Button variant={hidden ? "accent" : "default"} disabled={visible === null} onClick={() => onChange(hidden)}>
        {hidden ? x.showAllTiles : x.hideAllTiles}
      </Button>
    </section>
  );
}

export function GeneralPage() {
  const s = useSettings();
  const [visible, setVisible] = useExternal(tilesVisible);
  // The tiles' state as the app reports it after every change («tiles-hidden»), so this card always tells the truth.
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void listen<boolean>("tiles-hidden", (e) => setVisible(!e.payload)).then((u) => {
      if (alive) off = u;
      else u();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [setVisible]);
  const [autostart, setAutostart] = useExternal(autostartOn);
  const visibleSettled = useSettled(visible !== null);
  const autostartSettled = useSettled(autostart !== null);
  const [autostartFailed, flashAutostartFailed] = useTransient(false, 4000);
  const [layoutReset, flashLayoutReset] = useTransient<Outcome>("idle");
  const [lookReset, flashLookReset] = useTransient<Outcome>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);
  const navigate = useNavigate();

  const toggleTile = (id: TileId, enabled: boolean) => {
    void settings.update((cur) => ({ tiles: { ...cur.tiles, [id]: enabled } }));
    invoke("set_tile_enabled", { label: id, enabled }).catch(() => undefined);
  };

  const toggleVisible = (on: boolean) => {
    setVisible(on);
    invoke("set_tiles_hidden", { hidden: !on }).catch(() => setVisible(!on));
  };

  const toggleAutostart = (on: boolean) => {
    setAutostart(on);
    (on ? enable() : disable()).catch(() => {
      setAutostart(!on);
      flashAutostartFailed(true);
    });
  };

  const resetLayout = () => {
    invoke("reset_layout").then(
      () => flashLayoutReset("done"),
      () => flashLayoutReset("failed"),
    );
  };

  const resetLook = () => {
    setConfirmOpen(false);
    settings.resetCustomization().then(
      () => flashLookReset("done"),
      () => flashLookReset("failed"),
    );
  };

  return (
    <Page title={ru.settings.nav.general} description={x.desc}>
      <AllTiles visible={visible} settled={visibleSettled} onChange={toggleVisible} />

      {/* Each tile: what it shows, on or off, and a way into its own settings (switch plus chevron, as in Windows).
          While every tile is hidden the switches still work; the hint says when they take effect. */}
      <Section title={g.tiles} description={visible === false ? x.tilesWhileHidden(x.showAllTiles) : g.tilesHint}>
        {TILE_IDS.map((id) => (
          <IconRow key={id} icon={TILE_ICONS[id]} label={ru.tiles[id]} hint={x.tileHints[id]}>
            <Switch checked={s.tiles[id]} onChange={(on) => toggleTile(id, on)} ariaLabel={ru.tiles[id]} />
            <IconButton icon="chevron_right" variant="subtle" label={x.tileSettings(ru.tiles[id])} onClick={() => navigate(id)} />
          </IconRow>
        ))}
      </Section>

      <Section title={x.desktop} description={g.arrangeHint}>
        <Row label={g.lockLayout} hint={g.lockLayoutHint}>
          <Switch checked={s.lockLayout} onChange={(on) => void settings.update({ lockLayout: on })} ariaLabel={g.lockLayout} />
        </Row>
      </Section>

      <Section title={x.startup}>
        <IconRow label={g.autostart} hint={g.autostartHint} error={autostartFailed ? x.autostartFailed : undefined}>
          <span className={autostartSettled ? undefined : "settling"}>
            <Switch checked={autostart ?? false} disabled={autostart === null} onChange={toggleAutostart} ariaLabel={g.autostart} />
          </span>
        </IconRow>
      </Section>

      <Section title={x.reset}>
        <Row label={x.layoutLabel} hint={x.layoutHint} stack>
          <span className="inline">
            <Button icon="arrow_reset" onClick={resetLayout}>
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
      </Section>

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
    </Page>
  );
}
