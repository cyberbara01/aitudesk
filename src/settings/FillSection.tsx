// «Фон виджетов» on «Оформление»: the theme's background, a colour of one's own, or a gradient across the whole
// screen between two points placed by hand on a miniature of the screen with the widgets on it (each widget shows
// its part of the gradient). Ready-made ones first (src/lib/fill.ts, src/lib/theme.ts).
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "../components/Button";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Tooltip } from "../components/Tooltip";
import { extra } from "../i18n/ru.extra.shell";
import { FILL_PRESETS, fillCss, fillIsLight } from "../lib/fill";
import { FILL_MODES, settings, type FillMode, type FillStop, type WidgetFill } from "../lib/settings";
import { useDebounced } from "./shell/hooks";

const t = extra.fill;
const MODE_OPTIONS: readonly SegmentedOption<FillMode>[] = FILL_MODES.map((m) => ({ value: m, label: t.modes[m] }));

const same = (a: WidgetFill, b: Pick<WidgetFill, "mode" | "color" | "from" | "to">) =>
  a.mode === b.mode &&
  (a.mode === "color"
    ? a.color.toUpperCase() === b.color.toUpperCase()
    : a.from.color.toUpperCase() === b.from.color.toUpperCase() &&
      a.to.color.toUpperCase() === b.to.color.toUpperCase() &&
      Math.abs(a.from.x - b.from.x) < 1e-3 &&
      Math.abs(a.from.y - b.from.y) < 1e-3 &&
      Math.abs(a.to.x - b.to.x) < 1e-3 &&
      Math.abs(a.to.y - b.to.y) < 1e-3);

/** The ready-made backgrounds of a kind: little widgets in those colours. */
function Presets({ fill, mode, onPick }: { fill: WidgetFill; mode: FillMode; onPick: (f: WidgetFill) => void }) {
  return (
    <div className="fill-presets" role="radiogroup" aria-label={t.presets}>
      {FILL_PRESETS.filter((p) => p.fill.mode === mode).map((p) => {
        const on = same(fill, p.fill);
        const next = { ...fill, ...p.fill };
        return (
          <Tooltip key={p.id} text={t.names[p.id as keyof typeof t.names]}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t.names[p.id as keyof typeof t.names]}
              className={on ? "fill-preset on" : "fill-preset"}
              style={{ background: fillCss(next, 44, 32, 1) }}
              onClick={() => onPick(next)}
            >
              {on && <Icon name="checkmark" size={16} className={fillIsLight(next) ? "fill-check dark" : "fill-check"} />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** The main screen's proportions and its widgets (fractions of the screen), for the miniature. */
interface Desk {
  ratio: number;
  tiles: { x: number; y: number; w: number; h: number }[];
}
/** Until the app answers (or in a preview): the designed layout on a 16:9 screen. */
const DESK_DESIGNED: Desk = {
  ratio: 16 / 9,
  tiles: [
    { x: 0.03, y: 0.03, w: 0.37, h: 0.33 },
    { x: 0.03, y: 0.38, w: 0.15, h: 0.24 },
    { x: 0.42, y: 0.03, w: 0.15, h: 0.11 },
    { x: 0.42, y: 0.16, w: 0.15, h: 0.12 },
    { x: 0.42, y: 0.3, w: 0.15, h: 0.19 },
    { x: 0.67, y: 0.03, w: 0.15, h: 0.17 },
    { x: 0.67, y: 0.22, w: 0.15, h: 0.18 },
    { x: 0.83, y: 0.03, w: 0.15, h: 0.13 },
    { x: 0.83, y: 0.18, w: 0.15, h: 0.22 },
  ],
};

function useDesk(): Desk {
  const [desk, setDesk] = useState(DESK_DESIGNED);
  useEffect(() => {
    let alive = true;
    invoke<{ w: number; h: number; tiles: { x: number; y: number; w: number; h: number }[] } | null>("desk_shape").then(
      (d) => {
        if (!alive || !d || d.w <= 0 || d.h <= 0) return;
        setDesk({ ratio: d.w / d.h, tiles: d.tiles.map((r) => ({ x: r.x / d.w, y: r.y / d.h, w: r.w / d.w, h: r.h / d.h })) });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return desk;
}

/** The gradient's two points on the miniature of the screen: dragged by the pointer or moved by the arrow keys. */
function GradientEditor({ fill, onChange }: { fill: WidgetFill; onChange: (f: WidgetFill) => void }) {
  const desk = useDesk();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 160 });
  const [which, setWhich] = useState<"from" | "to">("from");
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const move = (key: "from" | "to", p: Partial<FillStop>) => onChange({ ...fill, [key]: { ...fill[key], ...p } });
  const at = (e: PointerEvent<HTMLElement>) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (key: "from" | "to") => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setWhich(key);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
  };
  const onMove = (key: "from" | "to") => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.buttons & 1 && e.currentTarget.hasPointerCapture(e.pointerId)) move(key, at(e));
  };
  const onKey = (key: "from" | "to") => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const s = fill[key];
    move(key, { x: Math.min(1, Math.max(0, s.x + d[0])), y: Math.min(1, Math.max(0, s.y + d[1])) });
  };
  const light = fillIsLight(fill);
  const point = (key: "from" | "to", label: string) => (
    <button
      type="button"
      className={which === key ? "fill-point on" : "fill-point"}
      style={{ left: `${fill[key].x * 100}%`, top: `${fill[key].y * 100}%`, background: fill[key].color }}
      aria-label={label}
      onPointerDown={onDown(key)}
      onPointerMove={onMove(key)}
      onFocus={() => setWhich(key)}
      onKeyDown={onKey(key)}
    >
      <span>{key === "from" ? 1 : 2}</span>
    </button>
  );
  return (
    <div className="fill-editor">
      <div
        ref={boxRef}
        className={light ? "fill-preview light" : "fill-preview"}
        style={{ aspectRatio: String(desk.ratio), background: fillCss(fill, size.w, size.h, 1) }}
      >
        {desk.tiles.map((r, i) => (
          <span
            key={i}
            className="fill-mini"
            aria-hidden="true"
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          />
        ))}
        <svg className="fill-line" aria-hidden="true">
          <line x1={`${fill.from.x * 100}%`} y1={`${fill.from.y * 100}%`} x2={`${fill.to.x * 100}%`} y2={`${fill.to.y * 100}%`} />
        </svg>
        {point("from", t.first)}
        {point("to", t.second)}
      </div>
      <p className="fill-hint">{t.editorHint}</p>
      <div className="fill-stops">
        {(["from", "to"] as const).map((key) => (
          <button key={key} type="button" className={which === key ? "fill-stop on" : "fill-stop"} aria-pressed={which === key} onClick={() => setWhich(key)}>
            <span className="fill-stop-dot" style={{ background: fill[key].color }} />
            {key === "from" ? t.first : t.second}
          </button>
        ))}
        <Button size="sm" icon="arrow_swap" onClick={() => onChange({ ...fill, from: { ...fill.from, color: fill.to.color }, to: { ...fill.to, color: fill.from.color } })}>
          {t.swap}
        </Button>
      </div>
      <ColorPicker key={which} value={fill[which].color} swatches={[]} customOpen onChange={(hex) => move(which, { color: hex })} />
    </div>
  );
}

export function FillSection({ fill }: { fill: WidgetFill }) {
  // The editors answer at once; the widgets get the change after a short pause (each change is a write).
  const [draft, setDraft] = useState<WidgetFill | null>(null);
  useEffect(() => {
    if (draft && JSON.stringify(draft) === JSON.stringify(fill)) setDraft(null);
  }, [draft, fill]);
  const commit = useDebounced((next: WidgetFill) => void settings.update({ fill: next }), 120);
  const shown = draft ?? fill;
  const change = useCallback(
    (next: WidgetFill) => {
      setDraft(next);
      commit(next);
    },
    [commit],
  );
  return (
    <Section title={t.title} description={t.hint}>
      <Row label={t.label}>
        <Segmented options={MODE_OPTIONS} value={shown.mode} onChange={(mode) => change({ ...shown, mode })} size="sm" ariaLabel={t.label} />
      </Row>
      {shown.mode !== "theme" && (
        <div className="row stack fill-row">
          <div className="row-text">
            <span className="row-label">{t.presets}</span>
          </div>
          <Presets fill={shown} mode={shown.mode} onPick={change} />
          {shown.mode === "color" ? (
            <div className="fill-own">
              <span className="row-label">{t.own}</span>
              <ColorPicker value={shown.color} swatches={[]} customOpen onChange={(hex) => change({ ...shown, color: hex })} />
            </div>
          ) : (
            <GradientEditor fill={shown} onChange={change} />
          )}
        </div>
      )}
    </Section>
  );
}
