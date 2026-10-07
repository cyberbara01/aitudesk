// Mini tiles for the live preview on «Оформление». Drawn with the real tokens, so they follow the
// selected style / theme / accent automatically; the clock additionally honours the clock settings.
import type { CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { DOTS } from "../../components/Masked";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.shell";
import { clockFont } from "../../lib/design";
import type { ClockSettings, Settings } from "../../lib/settings";

const DATE_FORMATS: Record<Exclude<ClockSettings["dateFormat"], "none">, Intl.DateTimeFormatOptions> = {
  long: { weekday: "long", day: "numeric", month: "long" },
  short: { weekday: "short", day: "numeric", month: "short" },
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  weekday: { weekday: "long" },
};

export function formatPreviewTime(d: Date, c: Pick<ClockSettings, "hour12" | "seconds">): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: c.hour12 };
  if (c.seconds) opts.second = "2-digit";
  return new Intl.DateTimeFormat("ru-RU", opts).format(d);
}

export function formatPreviewDate(d: Date, f: ClockSettings["dateFormat"]): string {
  if (f === "none") return "";
  return new Intl.DateTimeFormat("ru-RU", DATE_FORMATS[f]).format(d);
}

const ALIGN: Record<ClockSettings["align"], CSSProperties["alignItems"]> = { left: "flex-start", center: "center", right: "flex-end" };
const VALIGN: Record<ClockSettings["valign"], CSSProperties["justifyContent"]> = { top: "flex-start", center: "center", bottom: "flex-end" };

export function PreviewClock({ s, now }: { s: Settings; now: Date }) {
  const c = s.clock;
  const font = clockFont(c.font);
  const weight = Math.min(font.weights[1], Math.max(font.weights[0], c.weight));
  const color = c.color === "accent" ? "var(--accent)" : c.color === "custom" ? c.customColor : "var(--text)";
  const dateColor = c.dateColor === "accent" ? "var(--accent-text)" : c.dateColor === "text" ? "var(--text)" : "var(--text-2)";
  const date = formatPreviewDate(now, c.dateFormat);
  const row = c.datePosition === "right";
  const timeStyle: CSSProperties = {
    fontFamily: font.family,
    fontWeight: weight,
    fontStretch: font.width ? `${c.width}%` : undefined,
    fontSize: Math.round(Math.min(40, Math.max(18, c.size * 0.5))),
    letterSpacing: `${c.letterSpacing / 100}em`,
    fontVariantNumeric: c.tabular ? "tabular-nums" : "normal",
    color,
  };
  return (
    <div className={c.background ? "pv-tile" : "pv-tile no-bg"} aria-hidden="true">
      <div className="pv-clock" style={{ justifyContent: VALIGN[c.valign], alignItems: ALIGN[c.align] }}>
        <div
          className={row ? "pv-clock-body row" : "pv-clock-body"}
          style={{ flexDirection: row ? "row" : c.datePosition === "above" ? "column-reverse" : "column", alignItems: row ? "baseline" : ALIGN[c.align] }}
        >
          <span className="pv-time" style={timeStyle}>
            {formatPreviewTime(now, c)}
          </span>
          {date && (
            <span className="pv-date" style={{ color: dateColor }}>
              {date}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface SampleRow {
  icon: string;
  label: string;
  value: string;
  /** The value is a name hidden behind dots (settings.system.hideNames), as on the tile. */
  masked?: boolean;
}

export function PreviewSystem({ s }: { s: Settings }) {
  const sy = s.system;
  const rows: SampleRow[] = [{ icon: "battery_7", label: ru.system.battery, value: extra.appearance.sampleBattery }];
  const name = (value: string) => (sy.hideNames ? { value: DOTS, masked: true } : { value });
  if (sy.showWifi) rows.push({ icon: "wifi_1", label: ru.system.wifi, ...name(extra.appearance.sampleWifi) });
  if (sy.showBluetooth) rows.push({ icon: "bluetooth_connected", label: ru.system.bluetooth, ...name(extra.appearance.sampleDevice) });
  return (
    <div className={sy.background ? "pv-tile" : "pv-tile no-bg"} aria-hidden="true">
      <div className="pv-sys">
        {rows.map((r) => (
          <div key={r.icon} className="pv-row">
            <Icon name={r.icon} size={16} />
            <span className="pv-row-label">{r.label}</span>
            <span className={r.masked ? "pv-row-value masked-dots" : "pv-row-value"}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
