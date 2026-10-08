// «Свои виджеты»: the user's own picture or animation on the desktop, one window per widget (`custom-<id>`, made
// by src-tauri/src/custom.rs). «Заполнить» covers the widget edge to edge, «Целиком» shows the whole picture; with
// the background off the picture lies right on the wallpaper (a PNG with transparency keeps its shape). An
// animation stands still on its first frame while Windows battery saver is on or a program fills the screen.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "../components/Icon";
import { Tile } from "../components/Tile";
import { extra as shell } from "../i18n/ru.extra.shell";
import { useDesktopCovered } from "../lib/desktopCovered";
import { customIdOf } from "../lib/settings";
import { useFolded } from "../lib/tileView";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { useSystemInfo } from "../lib/useSystemInfo";
import { mayMove, useWidgetImage } from "../lib/widgetImage";

const label = getCurrentWindow().label;
const id = customIdOf(label);
const c = shell.custom;

export function CustomTile() {
  const loaded = useSettingsLoaded();
  const widget = useSettings().customWidgets.find((w) => w.id === id);
  const file = widget?.file ?? null;
  const image = useWidgetImage(file);
  const folded = useFolded();
  // Only a picture that moves asks whether battery saver is on.
  const moving = file !== null && mayMove(file) && !folded;
  const saver = useSystemInfo({ wifi: false, bluetooth: false, active: moving }).power?.saver === true;
  const covered = useDesktopCovered();
  // Wait for the stored settings so the tile never flashes the defaults (or toggles the acrylic twice).
  if (!loaded || !widget) return null;
  const name = widget.name.trim() || c.unnamed;
  const ready = image !== null && image !== "missing";
  const art = ready ? <img className="custom-thumb" src={image.still} alt="" draggable={false} /> : <Icon name="image" size={24} />;
  return (
    <Tile label={label} className="tile-custom" background={widget.background} face={{ art, name }}>
      {image === "missing" ? (
        <div className="custom-missing">
          <Icon name="image" size={24} />
          <span className="caption">{c.pictureMissing}</span>
        </div>
      ) : (
        ready && (
          <img
            className="custom-picture"
            src={moving && !saver && !covered ? image.url : image.still}
            alt={name}
            draggable={false}
            style={{ objectFit: widget.fit }}
          />
        )
      )}
    </Tile>
  );
}
