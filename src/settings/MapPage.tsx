// Settings → «Карта» (brief §3.4): colour scheme cards with a static legend, tile background, labels and
// pictograms; controls (switch side, search field, zoom buttons); floors (default, remember last); the list of
// favourite rooms (colour, code, note, remove). The real tile on the desktop is the live preview.
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { IconButton } from "../components/Button";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { TextField } from "../components/TextField";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { FAVORITE_COLORS, MAP_SCHEMES } from "../lib/design";
import { settings, type MapFavorite, type MapScheme, type MapSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { floorOfRoom, isRoomCode, roomDisplayName } from "../map/rooms";

const T = ru.settings.map;

type FloorValue = "1" | "2" | "3";
type SwitchSide = MapSettings["switchSide"];

const FLOOR_OPTIONS: readonly SegmentedOption<FloorValue>[] = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
];

const SIDE_OPTIONS: readonly SegmentedOption<SwitchSide>[] = [
  { value: "left", label: ru.common.left },
  { value: "right", label: ru.common.right },
];

/** Legend squares of a scheme card: the four room types by data-name suffix. */
const LEGEND: readonly { type: "p" | "k" | "l" | "o"; letter: string }[] = [
  { type: "p", letter: "P" },
  { type: "k", letter: "K" },
  { type: "l", letter: "L" },
  { type: "o", letter: extra.legendOther },
];

const NOTE_MAX = 60;

export function MapPage() {
  const m = useSettings().map;
  const update = (p: Partial<MapSettings>) => void settings.updateMap(p);

  const favorites = [...m.favorites].sort(
    (a, b) => (floorOfRoom(a.room) ?? 9) - (floorOfRoom(b.room) ?? 9) || a.room.localeCompare(b.room, "ru"),
  );

  return (
    <Page title={ru.settings.nav.map} description={extra.pageDesc}>
      <Section title={T.look}>
        <Row label={T.scheme} stack>
          <div className="grid-4 map-scheme-grid" role="radiogroup" aria-label={T.scheme}>
            {MAP_SCHEMES.map((id) => (
              <SchemeCard key={id} id={id} selected={m.scheme === id} onSelect={() => update({ scheme: id })} />
            ))}
          </div>
        </Row>
        <Row label={T.background} hint={T.backgroundHint}>
          <Switch checked={m.background} onChange={(v) => update({ background: v })} />
        </Row>
        <Row label={T.labels} hint={extra.labelsHint}>
          <Switch checked={m.showLabels} onChange={(v) => update({ showLabels: v })} />
        </Row>
        <Row label={T.icons} hint={extra.iconsHint}>
          <Switch checked={m.showIcons} onChange={(v) => update({ showIcons: v })} />
        </Row>
      </Section>

      <Section title={T.controls} description={extra.gestures}>
        <Row label={T.switchSide} hint={extra.switchSideHint}>
          <Segmented options={SIDE_OPTIONS} value={m.switchSide} onChange={(v) => update({ switchSide: v })} ariaLabel={T.switchSide} />
        </Row>
        <Row label={T.showSearch} hint={extra.showSearchHint}>
          <Switch checked={m.showSearch} onChange={(v) => update({ showSearch: v })} />
        </Row>
        <Row label={T.showZoom} hint={extra.showZoomHint}>
          <Switch checked={m.showZoom} onChange={(v) => update({ showZoom: v })} />
        </Row>
      </Section>

      <Section title={T.floors}>
        <Row label={T.defaultFloor} hint={m.rememberFloor ? extra.defaultFloorHint : undefined}>
          <Segmented
            options={FLOOR_OPTIONS}
            value={String(m.defaultFloor) as FloorValue}
            onChange={(v) => update({ defaultFloor: Number(v) as 1 | 2 | 3 })}
            ariaLabel={T.defaultFloor}
          />
        </Row>
        <Row label={T.rememberFloor} hint={extra.rememberFloorHint}>
          <Switch checked={m.rememberFloor} onChange={(v) => update({ rememberFloor: v })} />
        </Row>
      </Section>

      <Section title={T.favorites} description={favorites.length ? extra.favoritesCount(favorites.length) : T.favoritesHint}>
        {favorites.length === 0 ? (
          <div className="map-fav-empty">
            <Icon name="star" size={24} />
            <span>{ru.map.noFavorites}</span>
          </div>
        ) : (
          favorites.map((f) => <FavoriteRow key={f.room} fav={f} />)
        )}
      </Section>
    </Page>
  );
}

function SchemeCard({ id, selected, onSelect }: { id: MapScheme; selected: boolean; onSelect: () => void }) {
  const hintKey = `${id}Hint` as const;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={selected ? "option-card selected" : "option-card"}
      onClick={() => {
        if (!selected) onSelect();
      }}
    >
      <span className="card-preview map-legend" data-map-scheme={id} aria-hidden="true">
        {LEGEND.map((l) => (
          <span key={l.type} className="map-legend-sw" data-type={l.type}>
            {l.letter}
          </span>
        ))}
      </span>
      <span className="card-title">{T.schemes[id]}</span>
      <span className="card-hint">{T.schemes[hintKey]}</span>
    </button>
  );
}

function FavoriteRow({ fav }: { fav: MapFavorite }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState(fav.note ?? "");

  // Note changed elsewhere (another window): resync the field.
  useEffect(() => {
    setNote(fav.note ?? "");
  }, [fav.note]);

  const patch = (p: Partial<MapFavorite>) =>
    void settings.updateMap({ favorites: settings.get().map.favorites.map((f) => (f.room === fav.room ? { ...f, ...p } : f)) });
  const remove = () => void settings.updateMap({ favorites: settings.get().map.favorites.filter((f) => f.room !== fav.room) });

  const saveNote = () => {
    const text = note.trim().slice(0, NOTE_MAX);
    if (text !== (fav.note ?? "")) patch({ note: text || undefined });
  };
  const onNoteKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    else if (e.key === "Escape") {
      setNote(fav.note ?? "");
      e.currentTarget.blur();
    }
  };

  const floor = floorOfRoom(fav.room);
  const name = roomDisplayName(fav.room);

  return (
    <div className="row map-fav-row">
      <div className="map-fav-main">
        <button
          type="button"
          className={pickerOpen ? "map-fav-dot open" : "map-fav-dot"}
          style={{ "--fav": fav.color } as CSSProperties}
          aria-label={ru.menu.favoriteColor}
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
        />
        <div className="row-text map-fav-text">
          <span className={isRoomCode(fav.room) ? "row-label mono ellipsis" : "row-label ellipsis"} title={name}>
            {name}
          </span>
          {floor !== null && <span className="row-hint">{ru.map.floorN(floor)}</span>}
        </div>
        <TextField
          className="map-fav-note"
          value={note}
          placeholder={ru.map.notePlaceholder}
          maxLength={NOTE_MAX}
          onChange={setNote}
          onBlur={saveNote}
          onKeyDown={onNoteKey}
        />
        <IconButton icon="delete" label={ru.common.remove} variant="subtle" onClick={remove} />
      </div>
      {pickerOpen && (
        <div className="map-fav-picker">
          <ColorPicker value={fav.color} onChange={(hex) => patch({ color: hex })} swatches={FAVORITE_COLORS} />
        </div>
      )}
    </div>
  );
}
