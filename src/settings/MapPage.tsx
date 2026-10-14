// Settings → «Карта»: «Внешний вид» (scheme cards with legends, «Фон карты», codes, pictograms,
// the next lesson's room), «Прозрачность» (how see-through the map is, and under the pointer), «Элементы управления»
// (floor switch side and visibility, search field, zoom buttons), «Этажи»,
// «Отмеченные кабинеты» (colour, code, note, remove) and the section reset. The tile on the desktop is the
// live preview. Marked-room edits go through src/map/favorites.ts (functional updates of the store).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { IconButton } from "../components/Button";
import { ColorPicker } from "../components/ColorPicker";
import { EmptyState } from "../components/EmptyState";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Slider } from "../components/Slider";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { formatPercent } from "../lib/clock";
import { FAVORITE_COLORS, MAP_CODE_WEIGHTS, MAP_SCHEMES, accentNow, mapVars } from "../lib/design";
import { settings, type MapCodeWeight, type MapFavorite, type MapScheme, type MapSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { recolorRoom, setRoomNote, unmarkRoom } from "../map/favorites";
import { onRadioGroupKeyDown } from "../lib/radioGroup";
import { floorOfRoom, isRoomCode, roomDisplayName } from "../map/rooms";
import { LOCALE } from "../i18n/lang";
import { InkWidgetSection } from "./InkSection";

const T = ru.settings.map;

type FloorValue = "1" | "2" | "3";

const FLOOR_OPTIONS: readonly SegmentedOption<FloorValue>[] = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
];

const SIDE_OPTIONS: readonly SegmentedOption<MapSettings["switchSide"]>[] = [
  { value: "left", label: ru.common.left },
  { value: "right", label: ru.common.right },
];

/**
 * «Фон карты»: one choice over the two stored flags. Стекло = the glass tile; Подложка = no glass, a soft
 * silhouette under the building; Нет = nothing behind the plan at all.
 */
type Backdrop = "glass" | "silhouette" | "none";

const CODE_WEIGHT_OPTIONS: readonly SegmentedOption<MapCodeWeight>[] = MAP_CODE_WEIGHTS.map((w) => ({ value: w, label: extra.codeWeights[w] }));
type CodeColorMode = "scheme" | "custom";
const CODE_COLOR_OPTIONS: readonly SegmentedOption<CodeColorMode>[] = [
  { value: "scheme", label: extra.codeColors.scheme },
  { value: "custom", label: extra.codeColors.custom },
];
const TINT_OPTIONS: readonly SegmentedOption<"accent" | "custom">[] = [
  { value: "accent", label: extra.colorModes.accent },
  { value: "custom", label: extra.colorModes.custom },
];
/** The first «Свой» colour of the codes: white on dark palettes, near black on light ones. */
const firstCodeColor = () => (document.documentElement.dataset.scheme === "light" ? "#1F2937" : "#FFFFFF");

const BACKDROP_OPTIONS: readonly SegmentedOption<Backdrop>[] = [
  { value: "glass", label: extra.backdropGlass },
  { value: "silhouette", label: extra.backdropSilhouette },
  { value: "none", label: extra.backdropNone },
];

const BACKDROP_PATCH: Record<Backdrop, Partial<MapSettings>> = {
  glass: { background: true },
  silhouette: { background: false, silhouette: true },
  none: { background: false, silhouette: false },
};

const backdropOf = (m: MapSettings): Backdrop => (m.background ? "glass" : m.silhouette ? "silhouette" : "none");

const MODE_OPTIONS: readonly SegmentedOption<MapSettings["switchMode"]>[] = [
  { value: "always", label: extra.switchAlways },
  { value: "hover", label: extra.switchHover },
];

/** Legend of a scheme card: the four room types by data-name suffix, then the gym and coworking, toilets, exits. */
const LEGEND: readonly { type: string; text: string }[] = [
  { type: "p", text: "P" },
  { type: "k", text: "K" },
  { type: "l", text: "L" },
  { type: "o", text: extra.legendOther },
  { type: "x", text: "" },
  { type: "wc", text: "" },
  { type: "exit", text: "" },
];

const NOTE_MAX = 60;
/** A colour dragged in the custom editor is written once it rests this long (ms), not on every pointer move. */
const COLOR_COMMIT_MS = 150;
/** A slider being dragged reaches the store (and the map on the desktop) at most this often (ms). */
const LIVE_COMMIT_MS = 120;

const byFloorThenCode = (a: MapFavorite, b: MapFavorite) =>
  (floorOfRoom(a.room) ?? 9) - (floorOfRoom(b.room) ?? 9) || a.room.localeCompare(b.room, LOCALE);

export function MapPage() {
  const all = useSettings();
  const m = all.map;
  const schedulePrivate = all.schedule.privacy;
  const update = (p: Partial<MapSettings>) => void settings.updateMap(p);
  const marked = [...m.favorites].sort(byFloorThenCode);
  const backdrop = backdropOf(m);

  return (
    <Page title={ru.settings.nav.map} description={extra.pageDesc}>
      <Section title={T.look}>
        <Row label={T.scheme} stack>
          <div className="grid-3 map-scheme-grid" role="radiogroup" aria-label={T.scheme} onKeyDown={onRadioGroupKeyDown}>
            {MAP_SCHEMES.map((id) => (
              <SchemeCard key={id} id={id} look={m} selected={m.scheme === id} onSelect={() => update({ scheme: id })} />
            ))}
          </div>
        </Row>
        {m.scheme === "tint" && (
          <Row label={extra.color} hint={extra.colorHint}>
            <Segmented
              options={TINT_OPTIONS}
              value={m.color ? "custom" : "accent"}
              onChange={(v) => update({ color: v === "custom" ? accentNow() : "" })}
              ariaLabel={extra.color}
            />
          </Row>
        )}
        {m.scheme === "tint" && m.color !== "" && <MapColorRow label={extra.colorPick} value={m.color} field="color" />}
        <Row label={extra.backdrop} hint={extra.backdropHints[backdrop]}>
          <Segmented options={BACKDROP_OPTIONS} value={backdrop} onChange={(v) => update(BACKDROP_PATCH[v])} ariaLabel={extra.backdrop} />
        </Row>
        <Row label={T.labels} hint={extra.labelsHint}>
          <Switch checked={m.showLabels} onChange={(v) => update({ showLabels: v })} ariaLabel={T.labels} />
        </Row>
        <Row label={extra.labelsWhenZoomed} hint={extra.labelsWhenZoomedHint}>
          <Switch
            checked={m.labelsWhenZoomed}
            disabled={!m.showLabels}
            onChange={(v) => update({ labelsWhenZoomed: v })}
            ariaLabel={extra.labelsWhenZoomed}
          />
        </Row>
        {/* The codes' weight and colour: greyed out while the codes are off (map.css .map-fieldset). */}
        <Row label={extra.codeWeight} hint={extra.codeWeightHint}>
          <fieldset className="map-fieldset" disabled={!m.showLabels}>
            <Segmented options={CODE_WEIGHT_OPTIONS} value={m.codeWeight} onChange={(v) => update({ codeWeight: v })} ariaLabel={extra.codeWeight} />
          </fieldset>
        </Row>
        <Row label={extra.codeColor} hint={extra.codeColorHint}>
          <fieldset className="map-fieldset" disabled={!m.showLabels}>
            <Segmented
              options={CODE_COLOR_OPTIONS}
              value={m.codeColor ? "custom" : "scheme"}
              onChange={(v) => update({ codeColor: v === "custom" ? firstCodeColor() : "" })}
              ariaLabel={extra.codeColor}
            />
          </fieldset>
        </Row>
        {m.codeColor !== "" && m.showLabels && <MapColorRow label={extra.codeColorPick} value={m.codeColor} field="codeColor" />}
        <Row label={T.icons} hint={extra.iconsHint}>
          <Switch checked={m.showIcons} onChange={(v) => update({ showIcons: v })} ariaLabel={T.icons} />
        </Row>
        <Row label={extra.nextLesson} hint={schedulePrivate ? extra.nextLessonPrivate : extra.nextLessonHint}>
          <Switch
            checked={m.showNextLesson && !schedulePrivate}
            disabled={schedulePrivate}
            onChange={(v) => update({ showNextLesson: v })}
            ariaLabel={extra.nextLesson}
          />
        </Row>
      </Section>

      <Section title={extra.opacityTitle} description={extra.opacityDesc}>
        <OpacityRows map={m} />
      </Section>

      <Section title={T.controls} description={extra.gestures}>
        <Row label={T.switchSide} hint={extra.switchSideHint}>
          <Segmented options={SIDE_OPTIONS} value={m.switchSide} onChange={(v) => update({ switchSide: v })} ariaLabel={T.switchSide} />
        </Row>
        <Row label={extra.switchMode} hint={extra.switchModeHint}>
          <Segmented options={MODE_OPTIONS} value={m.switchMode} onChange={(v) => update({ switchMode: v })} ariaLabel={extra.switchMode} />
        </Row>
        <Row label={T.showSearch} hint={extra.showSearchHint}>
          <Switch checked={m.showSearch} onChange={(v) => update({ showSearch: v })} ariaLabel={T.showSearch} />
        </Row>
        <Row label={T.showZoom} hint={extra.showZoomHint}>
          <Switch checked={m.showZoom} onChange={(v) => update({ showZoom: v })} ariaLabel={T.showZoom} />
        </Row>
      </Section>

      <Section title={T.floors}>
        <Row label={T.defaultFloor} hint={m.rememberFloor ? extra.defaultFloorHint : undefined}>
          {/* Unused while the last floor is remembered: the fieldset disables the segmented control (map.css greys it). */}
          <fieldset className="map-fieldset" disabled={m.rememberFloor}>
            <Segmented
              options={FLOOR_OPTIONS}
              value={String(m.defaultFloor) as FloorValue}
              onChange={(v) => update({ defaultFloor: Number(v) as 1 | 2 | 3 })}
              ariaLabel={T.defaultFloor}
            />
          </fieldset>
        </Row>
        <Row label={T.rememberFloor} hint={extra.rememberFloorHint}>
          <Switch checked={m.rememberFloor} onChange={(v) => update({ rememberFloor: v })} ariaLabel={T.rememberFloor} />
        </Row>
      </Section>

      <Section title={extra.marked} description={extra.markedDesc}>
        {marked.length === 0 ? (
          <EmptyState title={extra.markedEmpty} hint={extra.markedEmptyHint} />
        ) : (
          marked.map((f) => <MarkedRow key={f.room} fav={f} />)
        )}
      </Section>

      <InkWidgetSection widget="map" />

      <ResetSection section="map" />
    </Page>
  );
}

/** A scheme with its legend, drawn with the map's own looks (the «Свой цвет» colour, the codes' weight and colour). */
function SchemeCard({ id, look, selected, onSelect }: { id: MapScheme; look: MapSettings; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      className={selected ? "option-card selected" : "option-card"}
      onClick={() => {
        if (!selected) onSelect();
      }}
    >
      <span className="card-preview map-legend" data-map-scheme={id} style={mapVars(look)} aria-hidden="true">
        {LEGEND.map((l) => (
          <span key={l.type} className="map-legend-sw" data-type={l.type}>
            {l.text}
          </span>
        ))}
      </span>
      <span className="card-text">
        <span className="card-title">{T.schemes[id]}</span>
        <span className="card-hint">{T.schemes[`${id}Hint` as const]}</span>
      </span>
    </button>
  );
}

/**
 * «Цвет карты» of «Свой цвет», or the codes' own colour. The picker answers at once; the colour is written
 * COLOR_COMMIT_MS after the last move (a drag across the palette would otherwise save the settings and redraw the
 * plan on every step), and at once when the page goes.
 */
function MapColorRow({ label, value, field }: { label: string; value: string; field: "color" | "codeColor" }) {
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const timer = useRef(0);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const hex = pending.current;
    pending.current = null;
    if (hex) void settings.updateMap({ [field]: hex }).finally(() => setDraft((d) => (d === hex ? null : d)));
  }, [field]);
  useEffect(() => () => flush(), [flush]);
  const pick = (hex: string) => {
    setDraft(hex);
    pending.current = hex;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, COLOR_COMMIT_MS);
  };
  return (
    <Row label={label} stack>
      <ColorPicker value={draft ?? value} onChange={pick} />
    </Row>
  );
}

type OpacityPatch = Partial<Pick<MapSettings, "opacity" | "hoverOpacity">>;

/**
 * «Непрозрачность», «Проявлять при наведении» and «Непрозрачность при наведении». The sliders answer at once, the
 * map on the desktop follows within LIVE_COMMIT_MS, and a value still pending is written when the page goes. Under
 * the pointer the map only ever gets more opaque: the second slider stops at the first one's value and is pushed
 * up by it.
 */
function OpacityRows({ map }: { map: MapSettings }) {
  const [draft, setDraft] = useState<OpacityPatch>({});
  const pending = useRef<OpacityPatch | null>(null);
  const timer = useRef(0);
  // Each write lets go of the draft values it carried (also a write that changed nothing, so a later reset of the
  // section shows through); a value dragged further meanwhile stays.
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    void settings.updateMap(p).finally(() =>
      setDraft((d) => {
        const keys = Object.keys(d) as (keyof OpacityPatch)[];
        const left = keys.filter((k) => d[k] !== p[k]);
        return left.length === keys.length ? d : (Object.fromEntries(left.map((k) => [k, d[k]])) as OpacityPatch);
      }),
    );
  }, []);
  useEffect(() => flush, [flush]);
  const opacity = draft.opacity ?? map.opacity;
  const hover = Math.max(draft.hoverOpacity ?? map.hoverOpacity, opacity);
  const patch = (p: OpacityPatch) => {
    setDraft((d) => ({ ...d, ...p }));
    pending.current = { ...(pending.current ?? {}), ...p };
    if (!timer.current) timer.current = window.setTimeout(flush, LIVE_COMMIT_MS);
  };
  const whole = opacity === 100;
  // Not seen at all and never coming forward: the place on the desktop still takes the clicks.
  const unseen = opacity === 0 && !map.hoverReveal;
  return (
    <>
      <Row label={extra.opacity} hint={unseen ? extra.opacityUnseen : extra.opacityHint}>
        <Slider
          className="map-opacity"
          min={0}
          max={100}
          value={opacity}
          ariaLabel={extra.opacity}
          format={formatPercent}
          onChange={(v) => patch(v > hover ? { opacity: v, hoverOpacity: v } : { opacity: v })}
        />
      </Row>
      <Row label={extra.hoverReveal} hint={whole ? extra.hoverRevealWhole : extra.hoverRevealHint}>
        <Switch
          checked={map.hoverReveal}
          disabled={whole}
          onChange={(v) => void settings.updateMap({ hoverReveal: v })}
          ariaLabel={extra.hoverReveal}
        />
      </Row>
      {map.hoverReveal && !whole && (
        <Row label={extra.hoverOpacity} hint={extra.hoverOpacityHint}>
          <Slider
            className="map-opacity"
            min={0}
            max={100}
            value={hover}
            ariaLabel={extra.hoverOpacity}
            format={formatPercent}
            onChange={(v) => patch({ hoverOpacity: Math.max(v, opacity) })}
          />
        </Row>
      )}
    </>
  );
}

/** One marked room: colour dot (opens the picker), code or area name with its floor, note, remove. */
function MarkedRow({ fav }: { fav: MapFavorite }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState(fav.note ?? "");
  const [color, setColor] = useState(fav.color);
  /** Set by Esc: the blur that follows must not save the text being discarded. */
  const discard = useRef(false);
  /** A colour picked but not yet written (see COLOR_COMMIT_MS). */
  const pending = useRef<string | null>(null);
  const timer = useRef(0);
  const room = fav.room;

  // Changed elsewhere (the tile, another window): resync, unless the user is in the middle of an edit here.
  useEffect(() => setNote(fav.note ?? ""), [fav.note]);
  useEffect(() => {
    if (pending.current === null) setColor(fav.color);
  }, [fav.color]);

  const flushColor = useCallback(() => {
    window.clearTimeout(timer.current);
    const hex = pending.current;
    pending.current = null;
    if (hex) void recolorRoom(room, hex);
  }, [room]);

  // Leaving the page with a colour still pending writes it at once.
  useEffect(() => () => flushColor(), [flushColor]);

  const pickColor = (hex: string) => {
    setColor(hex);
    pending.current = hex;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flushColor, COLOR_COMMIT_MS);
  };

  const togglePicker = () => {
    if (pickerOpen) flushColor();
    setPickerOpen((v) => !v);
  };

  const saveNote = () => {
    if (discard.current) {
      discard.current = false;
      return;
    }
    const text = note.trim().slice(0, NOTE_MAX);
    if (text !== note) setNote(text);
    if (text !== (fav.note ?? "")) void setRoomNote(room, text);
  };

  const onNoteKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      discard.current = true;
      setNote(fav.note ?? "");
      e.currentTarget.blur();
    }
  };

  const floor = floorOfRoom(room);
  const name = roomDisplayName(room);

  return (
    <div className="row map-fav-row">
      <div className="map-fav-main">
        <button
          type="button"
          className={pickerOpen ? "map-fav-dot open" : "map-fav-dot"}
          style={{ "--fav": color } as CSSProperties}
          aria-label={extra.colorFor(name)}
          aria-expanded={pickerOpen}
          onClick={togglePicker}
        />
        <div className="row-text map-fav-text">
          <span className={isRoomCode(room) ? "row-label mono ellipsis" : "row-label ellipsis"} title={name}>
            {name}
          </span>
          {floor !== null && <span className="row-hint">{ru.map.floorN(floor)}</span>}
        </div>
        <div className="textfield map-fav-note">
          <div className="textfield-wrap">
            <input
              className="textfield-input"
              type="text"
              value={note}
              placeholder={ru.map.notePlaceholder}
              maxLength={NOTE_MAX}
              spellCheck={false}
              aria-label={extra.noteFor(name)}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              onKeyDown={onNoteKey}
            />
          </div>
        </div>
        <IconButton icon="delete" label={extra.unmarkRoom(name)} variant="danger" onClick={() => void unmarkRoom(room)} />
      </div>
      {pickerOpen && (
        <div className="map-fav-picker">
          <ColorPicker value={color} onChange={pickColor} swatches={FAVORITE_COLORS} />
        </div>
      )}
    </div>
  );
}
