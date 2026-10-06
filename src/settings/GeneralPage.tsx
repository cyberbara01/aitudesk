// «Общие»: tiles on the desktop, desktop behaviour (show / lock / reset layout), autostart.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Button } from "../components/Button";
import { Page, Row, Section } from "../components/Section";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { TILE_IDS, settings, type TileId } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useSettled, useTransient } from "./shell/hooks";
import { IconRow } from "./shell/IconRow";
import { TILE_ICONS } from "./shell/nav";

const g = ru.settings.general;
const x = extra.general;

type ResetState = "idle" | "done" | "failed";

export function GeneralPage() {
  const s = useSettings();
  // Values that live outside the settings file arrive over IPC: null until known.
  const [visible, setVisible] = useState<boolean | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const visibleSettled = useSettled(visible !== null);
  const autostartSettled = useSettled(autostart !== null);
  const [reset, flashReset] = useTransient<ResetState>("idle");
  const [autostartFailed, flashAutostartFailed] = useTransient(false, 3500);

  useEffect(() => {
    let alive = true;
    invoke<boolean>("get_tiles_hidden")
      .then((hidden) => {
        if (alive) setVisible(!hidden);
      })
      .catch(() => {
        if (alive) setVisible(true);
      });
    isEnabled()
      .then((on) => {
        if (alive) setAutostart(on);
      })
      .catch(() => {
        if (alive) setAutostart(false);
      });
    return () => {
      alive = false;
    };
  }, []);

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
    invoke("reset_layout")
      .then(() => flashReset("done"))
      .catch(() => flashReset("failed"));
  };

  return (
    <Page title={ru.settings.nav.general} description={x.desc}>
      <Section title={g.tiles} description={g.tilesHint}>
        {TILE_IDS.map((id) => (
          <IconRow key={id} icon={TILE_ICONS[id]} label={ru.tiles[id]}>
            <Switch checked={s.tiles[id]} onChange={(on) => toggleTile(id, on)} />
          </IconRow>
        ))}
      </Section>

      <Section title={x.desktop}>
        <Row label={g.showAll} hint={x.showAllHint}>
          <span className={visibleSettled ? undefined : "settling"}>
            <Switch checked={visible ?? false} disabled={visible === null} onChange={toggleVisible} />
          </span>
        </Row>
        <Row label={g.lockLayout} hint={g.lockLayoutHint}>
          <Switch checked={s.lockLayout} onChange={(on) => void settings.update({ lockLayout: on })} />
        </Row>
        <Row label={x.layoutLabel} hint={g.arrangeHint} stack>
          {reset === "done" ? (
            <Button icon="checkmark" className="status-ok" disabled>
              {g.resetLayoutDone}
            </Button>
          ) : reset === "failed" ? (
            <Button icon="dismiss" variant="danger" disabled>
              {x.resetLayoutFailed}
            </Button>
          ) : (
            <Button icon="arrow_reset" onClick={resetLayout}>
              {g.resetLayout}
            </Button>
          )}
        </Row>
      </Section>

      <Section title={x.startup}>
        <Row label={g.autostart} hint={autostartFailed ? x.autostartFailed : g.autostartHint}>
          <span className={autostartSettled ? undefined : "settling"}>
            <Switch checked={autostart ?? false} disabled={autostart === null} onChange={toggleAutostart} />
          </span>
        </Row>
      </Section>
    </Page>
  );
}
