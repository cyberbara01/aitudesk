import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ru } from "../i18n/ru";
import { SWATCHES, hexToRgb, hsvToRgb, isHex, rgbToHex, rgbToHsv, type HSV } from "../lib/design";
import { TextField } from "./TextField";

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  swatches?: readonly string[];
  /** Show the HSV square + RGB/HEX fields (default true). */
  allowCustom?: boolean;
  /** Start with the custom editor expanded. */
  customOpen?: boolean;
  className?: string;
}

/** Swatch grid plus a custom HSV picker with R/G/B and HEX inputs. Always emits #RRGGBB. */
export function ColorPicker({ value, onChange, swatches = SWATCHES, allowCustom = true, customOpen, className }: ColorPickerProps) {
  const inSwatches = swatches.some((s) => s.toUpperCase() === value.toUpperCase());
  const [custom, setCustom] = useState(Boolean(customOpen) || (allowCustom && !inSwatches));
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value)));
  const [hexText, setHexText] = useState(value.toUpperCase());
  const svRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value.toUpperCase());

  // External value changed (another swatch, reset): resync the editor.
  useEffect(() => {
    if (value.toUpperCase() !== lastEmitted.current) {
      lastEmitted.current = value.toUpperCase();
      setHsv(rgbToHsv(hexToRgb(value)));
      setHexText(value.toUpperCase());
    }
  }, [value]);

  const emit = (next: HSV) => {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    lastEmitted.current = hex;
    setHexText(hex);
    onChange(hex);
  };

  const pickSv = (e: PointerEvent<HTMLDivElement>) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    emit({ ...hsv, s, v });
  };

  const onSvDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickSv(e);
  };
  const onSvMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.buttons & 1) pickSv(e);
  };

  const rgb = hsvToRgb(hsv);
  const setChannel = (k: "r" | "g" | "b", text: string) => {
    const n = Math.min(255, Math.max(0, Math.round(Number(text) || 0)));
    const next = { ...rgb, [k]: n };
    emit(rgbToHsv(next));
  };
  const setHex = (text: string) => {
    const t = text.startsWith("#") ? text : `#${text}`;
    setHexText(t.toUpperCase());
    if (isHex(t)) emit(rgbToHsv(hexToRgb(t)));
  };

  const hueHex = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const current = rgbToHex(rgb);

  return (
    <div className={["cp", className ?? ""].filter(Boolean).join(" ")}>
      <div className="cp-swatches" role="radiogroup" aria-label={ru.common.color}>
        {swatches.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s.toUpperCase() === value.toUpperCase()}
            aria-label={s}
            className={s.toUpperCase() === value.toUpperCase() ? "cp-swatch selected" : "cp-swatch"}
            style={{ background: s }}
            onClick={() => {
              lastEmitted.current = s.toUpperCase();
              setHsv(rgbToHsv(hexToRgb(s)));
              setHexText(s.toUpperCase());
              onChange(s.toUpperCase());
            }}
          />
        ))}
        {allowCustom && (
          <button
            type="button"
            className={custom ? "cp-swatch custom selected" : "cp-swatch custom"}
            aria-label={ru.common.custom}
            aria-pressed={custom}
            onClick={() => setCustom((c) => !c)}
          />
        )}
      </div>
      {allowCustom && custom && (
        <div className="cp-custom">
          <div>
            <div
              ref={svRef}
              className="cp-sv"
              style={{ "--cp-hue": hueHex } as CSSProperties}
              onPointerDown={onSvDown}
              onPointerMove={onSvMove}
              role="presentation"
            >
              <span className="cp-sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
            </div>
            <input
              className="cp-hue"
              type="range"
              min={0}
              max={360}
              step={1}
              value={Math.round(hsv.h)}
              aria-label={ru.common.hue}
              onChange={(e) => emit({ ...hsv, h: Number(e.target.value) })}
            />
          </div>
          <div className="cp-fields">
            <TextField label={ru.common.red} type="number" min={0} max={255} value={String(Math.round(rgb.r))} onChange={(t) => setChannel("r", t)} />
            <TextField label={ru.common.green} type="number" min={0} max={255} value={String(Math.round(rgb.g))} onChange={(t) => setChannel("g", t)} />
            <TextField label={ru.common.blue} type="number" min={0} max={255} value={String(Math.round(rgb.b))} onChange={(t) => setChannel("b", t)} />
            <TextField className="hex" label={ru.common.hex} mono value={hexText} maxLength={7} onChange={setHex} />
            <div className="cp-preview hex" style={{ background: current }} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
