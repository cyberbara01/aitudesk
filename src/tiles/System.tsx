import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { Icon } from "../components/Icon";
import { MaskedText, PrivacyScope, RevealButton, useRevealed } from "../components/Masked";
import { Tile } from "../components/Tile";
import { Tooltip } from "../components/Tooltip";
import { LANG } from "../i18n/lang";
import { ru } from "../i18n/ru";
import { useDesktopCovered } from "../lib/desktopCovered";
import { DENSITY_PAD, resolveLook } from "../lib/design";
import type { Settings, SystemSettings } from "../lib/settings";
import { IN_POPUP, useFolded, useTileView } from "../lib/tileView";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { useSystemInfo, useUserName, type BluetoothInfo, type PowerInfo, type SystemInfo, type WifiInfo } from "../lib/useSystemInfo";

/**
 * Icon state; each design language colours it in system.css. neutral: battery, desktop; on: connected;
 * off: no connection, adapter off, unknown level; caution / critical: battery at 40 % / 20 % or below.
 */
type Tone = "neutral" | "on" | "off" | "caution" | "critical";

interface RowSpec {
  id: "power" | "wifi" | "bluetooth";
  /** null while the first fetch is pending (an empty icon slot keeps the layout). */
  icon: string | null;
  tone: Tone;
  label: string;
  /** Digits of the value, set in --font-num (JetBrains Mono in Rice); never cut. */
  num?: string;
  /** Unit after the digits («%»), in the text font after a narrow no-break space. */
  unit?: string;
  /** Text part of the value (after the number, if any); the part that ellipsizes. */
  text?: string;
  /**
   * The text is a network or device name and hideNames is on: dots in its place, and the eye at the right end
   * of the row reveals this row only (components/Masked.tsx, as on the notes tile).
   */
  masked?: boolean;
  /** «+N» after device names; never cut, and shown only while the names are. */
  count?: string;
  /** Tooltip on the value. */
  hint?: string;
}

const NBSP = "\u00A0";
/** Narrow no-break space between a number and its unit in Russian («64 %»; a full space looks doubled next to mono
 *  digits); English writes "64%". */
const NNBSP = "\u202F";

/** Logical px; must match system.css (.sys-row) and --tile-pad in tokens.css. */
const ROW_H = 36;
const MIN_W = 220;
/** The default width (src-tauri/src/layout.rs). */
const SYSTEM_W = 280;

/** The device's own name: what an empty custom text or a missing account name falls back to. */
export const deviceName = (laptop: boolean) => (laptop ? ru.system.laptop : ru.system.desktopPc);

/**
 * Text at the start of the first row, per settings.system.labelMode: next to the charge on a laptop («Батарея»
 * by default), next to «От сети» on a PC («Стационарный ПК» by default).
 */
function firstLabel(s: SystemSettings, userName: string | null, laptop: boolean): string {
  const device = deviceName(laptop);
  if (s.labelMode === "user") return userName?.trim() || device;
  if (s.labelMode === "custom") return s.customLabel.trim() || device;
  if (s.labelMode === "device") return device;
  return laptop ? ru.system.battery : ru.system.desktopPc;
}

function batteryRow(p: PowerInfo | null, s: SystemSettings, userName: string | null): RowSpec {
  const id = "power";
  // Until the first answer it is not known whether this is a laptop: no label rather than a wrong one.
  if (!p) return { id, icon: null, tone: "neutral", label: "" };
  const label = firstLabel(s, userName, p.hasBattery);
  if (!p.hasBattery) return { id, icon: "desktop", tone: "neutral", label, text: ru.system.mains };
  const pct = p.percent;
  if (pct === null) return { id, icon: "battery_0", tone: "off", label, text: ru.system.none };
  const tone: Tone = pct <= 20 ? "critical" : pct <= 40 ? "caution" : "neutral";
  const level = Math.min(10, Math.max(0, Math.round(pct / 10)));
  const num = String(pct);
  const unit = "%";
  return p.charging
    ? { id, icon: "battery_charge", tone, label, num, unit, text: ru.system.charging }
    : { id, icon: `battery_${level}`, tone, label, num, unit };
}

/** 5/4 bars → wifi_1 (full), 3 → wifi_2, 2 → wifi_3, 1/0 → wifi_4; unknown → full. */
function wifiIcon(bars: number | null): string {
  if (bars === null || bars >= 4) return "wifi_1";
  if (bars === 3) return "wifi_2";
  if (bars === 2) return "wifi_3";
  return "wifi_4";
}

function wifiRow(w: WifiInfo | null, hideNames: boolean): RowSpec {
  const id = "wifi";
  const label = ru.system.wifi;
  if (!w) return { id, icon: null, tone: "neutral", label };
  if (!w.connected) return { id, icon: "wifi_off", tone: "off", label, text: ru.system.notConnected };
  const icon = wifiIcon(w.bars);
  const ssid = w.ssid?.trim() ?? "";
  // Windows keeps the name to itself (no location access): nothing to hide, «подключено» and how to see the name.
  if (w.ssidHidden || ssid === "") return { id, icon, tone: "on", label, text: ru.system.connected, hint: ru.system.ssidHint };
  return { id, icon, tone: "on", label, text: ssid, masked: hideNames };
}

function bluetoothRow(b: BluetoothInfo | null, hideNames: boolean): RowSpec {
  const id = "bluetooth";
  const label = ru.system.bluetooth;
  if (!b) return { id, icon: null, tone: "neutral", label };
  if (!b.available) return { id, icon: "bluetooth_disabled", tone: "off", label, text: ru.system.btOff };
  const n = b.devices.length;
  if (n === 0) return { id, icon: "bluetooth", tone: "off", label, text: ru.system.noBtConnections };
  const shown = b.devices.slice(0, 2).join(", ");
  const rest = n - 2;
  return { id, icon: "bluetooth_connected", tone: "on", label, text: shown, masked: hideNames, count: rest > 0 ? ru.system.more(rest) : undefined };
}

/**
 * One status row: icon (tone colour) · label · value on the right in --text-2 · the eye, when the value is a
 * hidden name.
 * Which side gives way in a narrow tile depends on the row (system.css, data-row): in the first row the value is
 * short and stays whole while a long PC label shortens; in the Wi-Fi and Bluetooth rows the label is one short
 * word and the network or device names shorten. Within the value only the text shortens: the number and the «+N»
 * stay whole, and «· заряжается» steps aside in a narrow tile (the charge icon says the same).
 */
function StatusRow({ id, icon, tone, label, num, unit, text, masked, count, hint }: RowSpec) {
  // «+N» belongs to the names: while they are dots it would count names nobody can see (and squeeze the dots in a
  // narrow tile), so it comes back with them.
  const namesShown = useRevealed(id);
  const value = (
    <>
      {num && (
        <span className="sys-fixed">
          <span className="num">{num}</span>
          {unit && `${LANG === "ru" ? NNBSP : ""}${unit}`}
        </span>
      )}
      {text &&
        (masked ? (
          <MaskedText id={id} text={text} className="sys-text" />
        ) : (
          <span className={num ? "sys-text sys-more" : "sys-text"}>{num ? `${NBSP}· ${text}` : text}</span>
        ))}
      {count && (!masked || namesShown) && <span className="sys-fixed">{`${NBSP}${count}`}</span>}
    </>
  );
  return (
    <div className={masked ? "sys-row reveal-row" : "sys-row"} data-row={id} role="listitem">
      <span className={`sys-icon-wrap tone-${tone}`} aria-hidden="true">
        {icon && <Icon name={icon} className="sys-icon" />}
      </span>
      <span className="sys-label body">{label}</span>
      {hint ? (
        <Tooltip text={hint} className="sys-value body">
          {value}
        </Tooltip>
      ) : (
        <span className="sys-value body">{value}</span>
      )}
      {masked && <RevealButton id={id} />}
    </div>
  );
}

interface SystemRowsProps {
  info: SystemInfo;
  settings: SystemSettings;
}

/**
 * The tile's rows for a given snapshot and settings (also drives the live preview on the settings page).
 * Battery always; Wi-Fi / Bluetooth per showWifi / showBluetooth; first row label per labelMode. With hideNames
 * the network and device names are dots, each of those rows with its own eye; the battery row is never hidden.
 * The rows are centred with even gaps when there is spare height and squeeze down when there is not (CSS).
 */
export function SystemRows({ info, settings }: SystemRowsProps) {
  const userName = useUserName(settings.labelMode === "user");
  const rows: RowSpec[] = [batteryRow(info.power, settings, userName)];
  if (settings.showWifi) rows.push(wifiRow(info.wifi, settings.hideNames));
  if (settings.showBluetooth) rows.push(bluetoothRow(info.bluetooth, settings.hideNames));
  return (
    <PrivacyScope masked={settings.hideNames}>
      <div className="sys-rows" role="list">
        {rows.map((r) => (
          <StatusRow key={r.id} {...r} />
        ))}
      </div>
    </PrivacyScope>
  );
}

interface RowsFit {
  /** Tile height with 36 px rows, on the 8 px grid: the minimum size in edit mode. */
  comfortable: number;
  /** Below this even rows squeezed to their minimum would not fit. */
  tight: number;
}

/** Heights (logical px) a tile with `rows` rows needs: rows, the padding of its density on both sides, 1 px border. */
function rowsFit(rows: number, s: Settings): RowsFit {
  const pad = DENSITY_PAD[resolveLook(s.style, s.look, s.theme).density];
  const rowMin = s.style === "pearl" ? 30 : s.style === "aqua" ? 28 : 24;
  const frame = 2 * pad + 2;
  return { comfortable: Math.ceil((rows * ROW_H + frame) / 8) * 8, tight: rows * rowMin + frame };
}

/**
 * Rows switched back on while the tile was made short for fewer rows: grow the window once to the comfortable
 * height and save it (keeps its position; the native side never saves a parked position), so nothing is clipped.
 */
function useGrowToFit({ comfortable, tight }: RowsFit, enabled: boolean) {
  useEffect(() => {
    if (!enabled || window.innerHeight >= tight) return;
    let cancelled = false;
    const win = getCurrentWindow();
    (async () => {
      const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
      // CSS px to physical: the monitor's scale times the tiles' zoom.
      const scale = window.devicePixelRatio;
      const h = Math.round(comfortable * scale);
      if (cancelled || size.height >= h) return;
      await win.setSize(new PhysicalSize(size.width, h));
      await invoke("save_rect", { label: "system", x: pos.x, y: pos.y, w: size.width, h });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [comfortable, tight, enabled]);
}

/**
 * «Система»: battery / Wi-Fi / Bluetooth rows on glass (or straight on the wallpaper). The only control on the
 * tile is the eye of a hidden name.
 */
export function SystemTile() {
  const loaded = useSettingsLoaded();
  const s = useSettings();
  const sys = s.system;
  // Folded to its icon, or with a program over the whole screen, nothing is read (the last values stay, and every
  // stale one is read again as soon as the desktop shows); only a size set by hand grows to fit its rows.
  const folded = useFolded();
  const covered = useDesktopCovered();
  const view = useTileView();
  const info = useSystemInfo({ wifi: sys.showWifi, bluetooth: sys.showBluetooth, active: loaded && !folded && !covered });
  const fit = rowsFit(1 + Number(sys.showWifi) + Number(sys.showBluetooth), s);
  // Only the tile itself grows (the pop-up keeps the size it opened with).
  useGrowToFit(fit, loaded && view === "manual" && !IN_POPUP);
  // Wait for the stored settings so the tile never flashes default rows (or toggles the acrylic twice).
  if (!loaded) return null;
  return (
    // Drawn for the default width and the height its rows need; a bigger widget shows bigger rows.
    <Tile
      label="system"
      className="tile-system"
      background={sys.background}
      minSize={{ w: MIN_W, h: fit.comfortable }}
      grow={{ w: SYSTEM_W, h: fit.comfortable }}
    >
      <SystemRows info={info} settings={sys} />
    </Tile>
  );
}
