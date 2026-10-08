// Welcome page: shown instead of «Общие» the first time the settings window opens, and later from
// «Как пользоваться». Six calm steps, each beside a small picture drawn with the real kit (tokens, the tile
// menu's own classes, the style cards) or beside real shortcuts to the pages it mentions, then «Начать»,
// which marks the page as seen and opens «Общие». The last step switches autostart on right here: right after
// installing, that is the one setting that decides whether the tiles are still there after a restart.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { autostartChanged, disable, enable, isEnabled } from "../../lib/autostart";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Page } from "../../components/Section";
import { Switch } from "../../components/Switch";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.shell";
import { STYLES, THEMES } from "../../lib/design";
import { useSettings } from "../../lib/useSettings";
import { useRootAttribute } from "./hooks";
import { useNavigate } from "./nav";

const w = extra.welcome;
const nav = ru.settings.nav;
const styleNames = ru.settings.appearance.styles;

interface StepProps {
  n: number;
  title: string;
  text: string;
  /** A small picture beside the text (decorative: the text says everything). */
  picture?: ReactNode;
  /** Controls in the picture's place (real buttons, so they stay visible to assistive tech). */
  aside?: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
}

function Step({ n, title, text, picture, aside, actions }: StepProps) {
  return (
    <li className="section ob-step">
      <div className="ob-step-text">
        <span className="ob-num" aria-hidden="true">
          {n}
        </span>
        <h2 className="ob-step-title">{title}</h2>
        <p className="ob-p">{text}</p>
        {actions && <div className="inline ob-actions">{actions}</div>}
      </div>
      {picture && (
        <div className="ob-picture" aria-hidden="true">
          {picture}
        </div>
      )}
      {aside && <div className="ob-picture">{aside}</div>}
    </li>
  );
}

/** A corner of the desktop: the clock and a list tile in the right column, the map along the bottom. */
function DeskPicture({ desk }: { desk: CSSProperties }) {
  return (
    <div className="ob-desk" style={desk}>
      <span className="ob-tile ob-clock">
        <span className="ob-time">{extra.appearance.sampleTime}</span>
      </span>
      <span className="ob-tile ob-list">
        <span className="ob-bar accent" />
        <span className="ob-bar" />
        <span className="ob-bar short" />
      </span>
      <span className="ob-tile ob-map">
        <span className="ob-room" />
        <span className="ob-room" />
        <span className="ob-room wide" />
        <span className="ob-room" />
      </span>
    </div>
  );
}

/** The tile menu itself (the real menu classes), with the first item under the pointer. */
function MenuPicture() {
  return (
    <div className="ctx-menu ob-menu">
      <div className="ctx-item ob-hot">
        <Icon name="arrow_move" />
        <span>{ru.menu.moveResize}</span>
      </div>
      <div className="ctx-item ob-sub">
        <Icon name="resize" />
        <span>{extra.views.size}</span>
        <Icon name="chevron_right" size={16} />
      </div>
      <div className="ctx-item">
        <Icon name="settings" />
        <span>{ru.menu.settings}</span>
      </div>
      <div className="ctx-item">
        <Icon name="eye_off" />
        <span>{ru.menu.hide}</span>
      </div>
    </div>
  );
}

/** The map tile: the search field with a room number, that room found on the plan, the floor switch. */
function MapPicture({ desk }: { desk: CSSProperties }) {
  const sample = w.mapSample;
  return (
    <div className="ob-desk" style={desk}>
      <span className="ob-tile ob-maptile">
        <span className="ob-plan">
          <span className="ob-search">
            <Icon name="search" size={16} />
            {sample.search}
          </span>
          {sample.rooms.map((room) => (
            <span key={room} className={room === sample.search ? "ob-room ob-code found" : "ob-room ob-code"}>
              {room}
            </span>
          ))}
        </span>
        <span className="ob-floors">
          <span>3</span>
          <span className="on">2</span>
          <span>1</span>
        </span>
      </span>
    </div>
  );
}

/** The three design languages as on the style cards of «Оформление». */
function StylesPicture({ desk }: { desk: CSSProperties }) {
  return (
    <div className="ob-styles">
      {STYLES.map(({ id }) => (
        <div key={id} className="ob-style">
          <div className="sp" data-sp={id} style={desk}>
            <span className="sp-tile">
              <span className="sp-time">{extra.appearance.sampleTime}</span>
              <span className="sp-bar" />
              <span className="sp-bar short" />
              <span className="sp-switch" />
            </span>
          </div>
          <span className="ob-style-name">{styleNames[id]}</span>
        </div>
      ))}
    </div>
  );
}

/** «Запускать вместе с Windows», the same switch as in «Общие» (the Run value of src-tauri/src/autostart.rs). */
function AutostartSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    isEnabled().then(
      (v) => alive && setOn(v),
      () => alive && setOn(false),
    );
    return () => {
      alive = false;
    };
  }, []);
  const toggle = (v: boolean) => {
    setOn(v);
    (v ? enable() : disable()).then(
      () => autostartChanged(v),
      () => setOn(!v),
    );
  };
  return <Switch checked={on ?? false} disabled={on === null} onChange={toggle} label={ru.settings.general.autostart} />;
}

export function WelcomePage() {
  const navigate = useNavigate();
  const { onboarded } = useSettings();
  // The pictures sit on the wallpaper of the palette in use, like the previews on «Оформление».
  const applied = useRootAttribute("data-theme");
  const desk = { "--desk": (THEMES.find((t) => t.id === applied) ?? THEMES[0]).swatch.bg } as CSSProperties;

  return (
    <Page title={onboarded ? extra.shell.help : w.title} description={w.desc}>
      <ol className="ob-steps" aria-label={w.stepsLabel}>
        <Step n={1} title={w.tilesTitle} text={w.tilesText(nav.general)} picture={<DeskPicture desk={desk} />} />
        <Step
          n={2}
          title={w.menuTitle}
          text={w.menuText(ru.menu.moveResize, ru.menu.settings, ru.common.done, extra.views.size)}
          picture={<MenuPicture />}
        />
        <Step n={3} title={w.mapTitle} text={w.mapText} picture={<MapPicture desk={desk} />} />
        <Step
          n={4}
          title={w.dataTitle}
          text={w.dataText}
          aside={
            <div className="ob-links">
              <Button icon="calendar_ltr" onClick={() => navigate("schedule")}>
                {nav.schedule}
              </Button>
              <Button icon="note" onClick={() => navigate("notes")}>
                {nav.notes}
              </Button>
              <Button icon="apps" onClick={() => navigate("launchers")}>
                {nav.launchers}
              </Button>
            </div>
          }
        />
        <Step
          n={5}
          title={w.lookTitle}
          text={w.lookText(nav.appearance, styleNames.fluent, styleNames.aqua, styleNames.rice)}
          picture={<StylesPicture desk={desk} />}
          actions={
            <Button icon="paint_brush" onClick={() => navigate("appearance")}>
              {nav.appearance}
            </Button>
          }
        />
        <Step
          n={6}
          title={w.startTitle}
          text={w.startText(nav.reminders)}
          actions={
            <>
              <AutostartSwitch />
              <Button icon="alert" onClick={() => navigate("reminders")}>
                {nav.reminders}
              </Button>
            </>
          }
        />
      </ol>
      <div className="ob-foot">
        <p className="hint ob-foot-text">{w.footer(extra.shell.help)}</p>
        <Button variant="accent" onClick={() => navigate("general")}>
          {w.start}
        </Button>
      </div>
    </Page>
  );
}
