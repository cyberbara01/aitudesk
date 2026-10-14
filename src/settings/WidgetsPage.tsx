// «Виджеты»: everything about the widgets on the desktop in one place. «Все виджеты» (every widget off the desktop
// and back with one button), then each built-in widget with its size, its switch and a way into its own settings
// (the pages of a widget live inside this one: the sidebar keeps «Виджеты» lit and the title leads back), the own
// picture widgets (src/settings/custom/CustomWidgetEditor.tsx), and how the desktop behaves (lock the layout).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button, IconButton } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Select, type SelectOption } from "../components/Select";
import { Switch } from "../components/Switch";
import { Tooltip } from "../components/Tooltip";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { extra as stx } from "../i18n/ru.extra.stack";
import { CUSTOM_MAX, TILE_IDS, TILE_VIEWS, customLabel, settings, type CustomWidget, type TileId, type TileView } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { realignIfOn, setGridSnap } from "../lib/grid";
import { useWidgetImage } from "../lib/widgetImage";
import { CustomWidgetEditor } from "./custom/CustomWidgetEditor";
import { tilesVisible, useExternal } from "./shell/external";
import { useSettled } from "./shell/hooks";
import { IconRow } from "./shell/IconRow";
import { StackSection } from "./StackSection";
import { TILE_ICONS, useNavigate } from "./shell/nav";

const g = ru.settings.general;
const x = extra.general;
const v = extra.views;
const c = extra.custom;

/** «Размер» of a widget: by hand, or a preset (src/lib/tileView.ts). */
const VIEW_OPTIONS: readonly SelectOption<TileView>[] = TILE_VIEWS.map((tv) => ({ value: tv, label: v[tv] }));

/** The picture's format, under the widget's name. */
const FORMATS: Record<string, string> = { png: "PNG", jpg: "JPEG", gif: "GIF", webp: "WebP", bmp: "BMP" };
const formatOf = (file: string) => FORMATS[file.slice(file.lastIndexOf(".") + 1)] ?? "";

function SizeSelect({ label, name, value }: { label: string; name: string; value: TileView }) {
  return (
    <Select
      options={VIEW_OPTIONS}
      value={value}
      onChange={(tv) => void settings.setTileView(label, tv)}
      ariaLabel={v.sizeOf(name)}
      className="tile-size"
      icon="resize"
    />
  );
}

/** An own widget in the list: its picture (a still of the first frame), name, size, switch and editor. */
function CustomRow({ widget, view, stacked, onEdit }: { widget: CustomWidget; view: TileView; stacked: boolean; onEdit: () => void }) {
  const image = useWidgetImage(widget.file);
  const missing = image === "missing";
  const name = widget.name.trim() || c.unnamed;
  const toggle = (on: boolean) =>
    void settings.update((cur) => ({
      customWidgets: cur.customWidgets.map((w) => (w.id === widget.id ? { ...w, enabled: on } : w)),
    }));
  return (
    <div className={widget.enabled ? "row cw-row" : "row cw-row off"}>
      <span className="cw-thumb" aria-hidden="true">
        {image && !missing ? <img src={image.still} alt="" draggable={false} /> : <Icon name="image" />}
      </span>
      <div className="row-text">
        <span className="row-label ellipsis">{name}</span>
        <span className={missing ? "row-hint cw-warn" : "row-hint"}>
          {missing ? c.pictureMissing : stacked ? `${formatOf(widget.file)} · ${stx.settings.inStack}` : formatOf(widget.file)}
        </span>
      </div>
      <div className="row-control">
        <SizeSelect label={customLabel(widget.id)} name={name} value={view} />
        <Switch checked={widget.enabled} onChange={toggle} ariaLabel={name} />
        <Tooltip text={c.settingsOf(name)}>
          <IconButton icon="settings" variant="subtle" className="tile-gear" label={c.settingsOf(name)} onClick={onEdit} />
        </Tooltip>
      </div>
    </div>
  );
}

interface AllTilesProps {
  /** null until the native side has answered. */
  visible: boolean | null;
  /** False keeps transitions off while the first answer lands. */
  settled: boolean;
  onChange: (visible: boolean) => void;
}

/**
 * «Все виджеты», first on the page: hidden widgets stay hidden after a restart, and launching the app again then
 * opens right here. The state reads at a glance (the mark lit or out, one line of state) and there is one button;
 * showing the widgets again is the accent action. Nothing that depends on the state is drawn before it is known.
 */
function AllTiles({ visible, settled, onChange }: AllTilesProps) {
  const titleId = useId();
  const hidden = visible === false;
  const cls = ["section all-tiles", hidden ? "off" : "", visible === null ? "pending" : "", settled ? "" : "settling"].filter(Boolean).join(" ");
  return (
    <section className={cls} aria-labelledby={titleId}>
      <span className="all-tiles-mark" aria-hidden="true">
        <Icon name={hidden ? "eye_off" : "eye"} />
      </span>
      <div className="all-tiles-text">
        <span id={titleId} className="all-tiles-title">
          {x.allTiles}
        </span>
        <span className="all-tiles-state" role="status">
          {visible === null ? "" : hidden ? x.allTilesHidden : x.allTilesShown}
        </span>
      </div>
      <Button variant={hidden ? "accent" : "default"} disabled={visible === null} onClick={() => onChange(hidden)}>
        {hidden ? x.showAllTiles : x.hideAllTiles}
      </Button>
    </section>
  );
}

interface Props {
  /** From ?edit= / settings-navigate (an own widget's «Настройки виджета»): the id of an own widget opens its editor. */
  editId?: string | null;
}

export function WidgetsPage({ editId }: Props) {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  /** The open editor of an own widget: null = a new one. */
  const [editor, setEditor] = useState<{ widget: CustomWidget | null } | null>(null);
  const closeEditor = useCallback(() => setEditor(null), []);
  const handledEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !editId || handledEdit.current === editId) return;
    handledEdit.current = editId;
    const widget = settings.get().customWidgets.find((w) => w.id === editId);
    if (widget) setEditor({ widget });
  }, [loaded, editId]);
  const full = s.customWidgets.length >= CUSTOM_MAX;
  const openNew = () => {
    if (!full) setEditor({ widget: null });
  };
  const [visible, setVisible] = useExternal(tilesVisible);
  // The widgets' state as the app reports it after every change («tiles-hidden»), so this card always tells the truth.
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void listen<boolean>("tiles-hidden", (e) => setVisible(!e.payload)).then((u) => {
      if (alive) off = u;
      else u();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [setVisible]);
  const visibleSettled = useSettled(visible !== null);
  const navigate = useNavigate();

  const toggleTile = (id: TileId, enabled: boolean) => {
    void settings.update((cur) => ({ tiles: { ...cur.tiles, [id]: enabled } }));
    invoke("set_tile_enabled", { label: id, enabled }).catch(() => undefined);
    // A widget switched on with the grid on takes its cells once it has appeared.
    if (enabled && settings.get().gridSnap) window.setTimeout(() => void realignIfOn(), 900);
  };

  /** In the stack now: shown there instead of in its own place. */
  const inStack = (label: string) => s.stacks.some((d) => d.members.includes(label));

  const toggleVisible = (on: boolean) => {
    setVisible(on);
    invoke("set_tiles_hidden", { hidden: !on }).catch(() => setVisible(!on));
  };

  return (
    <Page title={ru.settings.nav.widgets} description={x.widgetsDesc}>
      <AllTiles visible={visible} settled={visibleSettled} onChange={toggleVisible} />

      {/* Each widget: what it shows, its size, on or off, and a gear into its own settings (the own widgets' rows end
          with the same gear). While every widget is hidden the switches still work; the hint says when they take effect. */}
      <Section title={g.tiles} description={visible === false ? x.tilesWhileHidden(x.showAllTiles) : `${g.tilesHint}. ${v.hint}`}>
        {TILE_IDS.map((id) => (
          <IconRow key={id} icon={TILE_ICONS[id]} label={ru.tiles[id]} hint={inStack(id) ? `${x.tileHints[id]} · ${stx.settings.inStack}` : x.tileHints[id]}>
            <SizeSelect label={id} name={ru.tiles[id]} value={s.tileViews[id] ?? "manual"} />
            <Switch checked={s.tiles[id]} onChange={(on) => toggleTile(id, on)} ariaLabel={ru.tiles[id]} />
            <Tooltip text={x.tileSettings(ru.tiles[id])}>
              <IconButton icon="settings" variant="subtle" className="tile-gear" label={x.tileSettings(ru.tiles[id])} onClick={() => navigate(id)} />
            </Tooltip>
          </IconRow>
        ))}
      </Section>

      <StackSection s={s} />

      <Section title={c.title} description={c.desc}>
        {s.customWidgets.length === 0 ? (
          <EmptyState title={c.empty} hint={c.emptyHint} action={{ label: c.add, icon: "image_add", onClick: openNew }} />
        ) : (
          <>
            {s.customWidgets.map((w) => (
              <CustomRow
                key={w.id}
                widget={w}
                view={s.tileViews[customLabel(w.id)] ?? "manual"}
                stacked={inStack(customLabel(w.id))}
                onEdit={() => setEditor({ widget: w })}
              />
            ))}
            <div className="cw-foot">
              <Button variant="accent" icon="image_add" onClick={openNew} disabled={full}>
                {c.add}
              </Button>
              <span className="cw-hint">{full ? c.limit(CUSTOM_MAX) : c.addHint(CUSTOM_MAX)}</span>
            </div>
          </>
        )}
      </Section>

      <Section title={x.desktop} description={g.arrangeHint}>
        <IconRow icon="grid" label={extra.grid.label} hint={extra.grid.hint}>
          <Switch checked={s.gridSnap} onChange={(on) => void setGridSnap(on)} ariaLabel={extra.grid.label} />
        </IconRow>
        <Row label={g.lockLayout} hint={g.lockLayoutHint}>
          <Switch checked={s.lockLayout} onChange={(on) => void settings.update({ lockLayout: on })} ariaLabel={g.lockLayout} />
        </Row>
      </Section>

      {editor && <CustomWidgetEditor widget={editor.widget} onClose={closeEditor} />}
    </Page>
  );
}
