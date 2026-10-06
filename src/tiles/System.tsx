import { Icon } from "../components/Icon";
import { Tile } from "../components/Tile";
import { Tooltip } from "../components/Tooltip";
import { ru } from "../i18n/ru";
import type { SystemSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import {
  useSystemInfo,
  useUserName,
  type BluetoothInfo,
  type PowerInfo,
  type SystemInfo,
  type WifiInfo,
} from "../lib/useSystemInfo";

/** Icon colour: --text, --text-3 (no connection), --caution / --critical (battery thresholds). */
type Tone = "text" | "text-3" | "caution" | "critical";

interface RowSpec {
  id: "power" | "wifi" | "bluetooth";
  /** null while the first fetch is pending (renders an empty icon slot). */
  icon: string | null;
  tone: Tone;
  label: string;
  value: string;
  /** Tooltip on the value. */
  hint?: string;
}

const NBSP = " ";

/** Label of the first row on a machine without a battery, per settings.system.labelMode. */
function pcLabel(s: SystemSettings, userName: string | null): string {
  if (s.labelMode === "user") return userName?.trim() || ru.system.desktopPc;
  if (s.labelMode === "custom") return s.customLabel.trim() || ru.system.desktopPc;
  return ru.system.desktopPc;
}

function batteryRow(p: PowerInfo | null, noBatteryLabel: string): RowSpec {
  const id = "power";
  if (!p) return { id, icon: null, tone: "text", label: ru.system.battery, value: "" };
  if (!p.hasBattery) return { id, icon: "desktop", tone: "text", label: noBatteryLabel, value: ru.system.none };
  const pct = p.percent;
  if (pct === null) return { id, icon: "battery_0", tone: "text", label: ru.system.battery, value: ru.system.none };
  const tone: Tone = pct <= 20 ? "critical" : pct <= 40 ? "caution" : "text";
  const level = Math.min(10, Math.max(0, Math.round(pct / 10)));
  const percent = `${pct}${NBSP}%`;
  return p.charging
    ? { id, icon: "battery_charge", tone, label: ru.system.battery, value: `${percent} · ${ru.system.charging}` }
    : { id, icon: `battery_${level}`, tone, label: ru.system.battery, value: percent };
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
  if (!w) return { id, icon: null, tone: "text", label, value: "" };
  if (!w.connected) return { id, icon: "wifi_off", tone: "text-3", label, value: ru.system.notConnected };
  const icon = wifiIcon(w.bars);
  const ssid = w.ssid?.trim() ?? "";
  const hiddenByWindows = w.ssidHidden || ssid === "";
  // The user asked not to see names: say «подключено» and skip the «how to reveal the SSID» hint.
  if (hideNames) return { id, icon, tone: "text", label, value: ru.system.connected };
  if (hiddenByWindows) return { id, icon, tone: "text", label, value: ru.system.connected, hint: ru.system.ssidHint };
  return { id, icon, tone: "text", label, value: ssid };
}

function bluetoothRow(b: BluetoothInfo | null, hideNames: boolean): RowSpec {
  const id = "bluetooth";
  const label = ru.system.bluetooth;
  if (!b) return { id, icon: null, tone: "text", label, value: "" };
  if (!b.available) return { id, icon: "bluetooth_disabled", tone: "text-3", label, value: ru.system.btOff };
  const n = b.devices.length;
  if (n === 0) return { id, icon: "bluetooth", tone: "text-3", label, value: ru.system.noBtConnections };
  if (hideNames) return { id, icon: "bluetooth_connected", tone: "text", label, value: ru.system.devices(n) };
  const shown = b.devices.slice(0, 2).join(", ");
  const rest = n - 2;
  return { id, icon: "bluetooth_connected", tone: "text", label, value: rest > 0 ? `${shown} ${ru.system.more(rest)}` : shown };
}

/**
 * One 36 px status row: icon 20 (tone colour) · label body · value body in --font-num, tabular, --text-2.
 * Grid columns: icon · label (keeps its width, truncates only when nothing else can give) · value (ellipsis).
 */
function Row({ icon, tone, label, value, hint }: RowSpec) {
  const valueCls = "sys-value body";
  return (
    <div className="sys-row" role="listitem">
      <span className={`sys-icon-wrap tone-${tone}`} aria-hidden="true">
        {icon && <Icon name={icon} className="sys-icon" />}
      </span>
      <span className="sys-label body">{label}</span>
      {hint ? (
        <Tooltip text={hint} className={valueCls}>
          {value}
        </Tooltip>
      ) : (
        <span className={valueCls}>{value}</span>
      )}
    </div>
  );
}

interface SystemRowsProps {
  info: SystemInfo;
  settings: SystemSettings;
}

/**
 * The tile's rows for a given snapshot and settings (also drives the live preview on the settings page).
 * Battery always; Wi‑Fi / Bluetooth per showWifi / showBluetooth; names per hideNames; first row label per labelMode.
 * The group is centred vertically with even gaps when there is spare height, otherwise it starts at the top (CSS).
 */
export function SystemRows({ info, settings }: SystemRowsProps) {
  const userName = useUserName(settings.labelMode === "user");
  const rows: RowSpec[] = [batteryRow(info.power, pcLabel(settings, userName))];
  if (settings.showWifi) rows.push(wifiRow(info.wifi, settings.hideNames));
  if (settings.showBluetooth) rows.push(bluetoothRow(info.bluetooth, settings.hideNames));
  return (
    <div className="sys-rows" role="list">
      {rows.map((r) => (
        <Row key={r.id} {...r} />
      ))}
    </div>
  );
}

/** «Система»: battery / Wi‑Fi / Bluetooth, non-interactive rows on glass (or straight on the wallpaper). */
export function SystemTile() {
  const s = useSettings();
  const info = useSystemInfo();
  return (
    <Tile label="system" className="tile-system" background={s.system.background}>
      <SystemRows info={info} settings={s.system} />
    </Tile>
  );
}
