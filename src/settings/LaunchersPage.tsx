import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.launchers";
import {
  BUILT_IN,
  hostOf,
  isBuiltInKey,
  moveCustom,
  removeCustom,
  setBuiltIn,
  setBuiltInColor,
  siteIconMissing,
  visibleLaunchers,
} from "../lib/launchers";
import { settings, type BuiltInLauncher, type CustomLauncher } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { LauncherEditor } from "./launchers/LauncherEditor";
import { LauncherIcon, type LauncherLook } from "./launchers/LauncherIcon";
import { LaunchersGrid } from "./launchers/LaunchersGrid";

interface Props {
  /** From ?edit= / settings-navigate: a custom id opens its editor, a built-in key opens its colour. */
  editId?: string | null;
}

/** Dragging in the colour picker emits on every pointer move; the store is written this long after the last one. */
const COLOR_COMMIT_MS = 120;

type DraftColors = Partial<Record<BuiltInLauncher, string>>;

const itemDomId = (key: BuiltInLauncher) => `ln-item-${key}`;

/** «Ярлыки»: live preview, built-in launchers (switch + colour), custom launchers (editor dialog), display options. */
export function LaunchersPage({ editId }: Props) {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const ln = s.launchers;
  const [editor, setEditor] = useState<{ item: CustomLauncher | null } | null>(null);
  const [colorOpen, setColorOpen] = useState<BuiltInLauncher | null>(null);
  const [draftColors, setDraftColors] = useState<DraftColors>({});
  const pending = useRef<{ key: BuiltInLauncher; hex: string; timer: number } | null>(null);
  const handledEdit = useRef<string | null>(null);
  /** Set by the deep link: once the colour popover is open, move focus into it (a mouse toggle keeps focus on the dot). */
  const focusPopover = useRef(false);

  // Deep link from the tile's context menu.
  useEffect(() => {
    if (!loaded || !editId || handledEdit.current === editId) return;
    handledEdit.current = editId;
    const custom = settings.get().launchers.custom.find((c) => c.id === editId);
    if (custom) setEditor({ item: custom });
    else if (isBuiltInKey(editId)) {
      focusPopover.current = true;
      setColorOpen(editId);
    }
  }, [loaded, editId]);

  // The opened colour popover sits below the preview and the section heads: bring it into view, and after a
  // deep link put focus on its current swatch so «Изменить» on the tile lands on something visibly changed.
  useEffect(() => {
    if (!colorOpen) return;
    const item = document.getElementById(itemDomId(colorOpen));
    item?.scrollIntoView({ block: "nearest" });
    if (!focusPopover.current) return;
    focusPopover.current = false;
    const pop = item?.querySelector<HTMLElement>(".ln-color-pop");
    (pop?.querySelector<HTMLElement>('.cp-swatch[aria-checked="true"]') ?? pop?.querySelector<HTMLElement>(".cp-swatch"))?.focus();
  }, [colorOpen]);

  // ---- Built-in colours: instant draft, debounced persistence ----
  const commitColor = useCallback((key: BuiltInLauncher, hex: string) => {
    const done = () =>
      setDraftColors((d) => {
        if (d[key] !== hex) return d; // a newer draft exists, keep it
        const next = { ...d };
        delete next[key];
        return next;
      });
    setBuiltInColor(key, hex).then(done, done);
  }, []);
  const flushColor = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    commitColor(p.key, p.hex);
  }, [commitColor]);
  const changeBuiltInColor = (key: BuiltInLauncher, hex: string) => {
    setDraftColors((d) => ({ ...d, [key]: hex }));
    if (pending.current) window.clearTimeout(pending.current.timer);
    const timer = window.setTimeout(() => {
      pending.current = null;
      commitColor(key, hex);
    }, COLOR_COMMIT_MS);
    pending.current = { key, hex, timer };
  };
  useEffect(() => () => flushColor(), [flushColor]);
  const toggleColor = (key: BuiltInLauncher) => {
    flushColor();
    setColorOpen((cur) => (cur === key ? null : key));
  };

  const items = useMemo(
    () =>
      visibleLaunchers(s).map((it) => {
        const draft = isBuiltInKey(it.id) ? draftColors[it.id] : undefined;
        return draft ? { ...it, color: draft } : it;
      }),
    [s, draftColors],
  );

  const openNew = () => setEditor({ item: null });
  // Stable: the Dialog re-registers in the Esc stack and re-focuses its first field whenever onClose changes.
  const closeEditor = useCallback(() => setEditor(null), []);

  return (
    <Page title={ru.settings.nav.launchers} description={extra.description}>
      {/* Live preview: the real tile material at the default tile size (280×184 → 3×2 cells), so the
          «Добавить» / «+N» rule is exercised exactly as on the desktop. */}
      <div className="ln-preview-wrap">
        <div className="ln-stage">
          <div className={ln.background ? "tile tile-launchers ln-preview" : "tile tile-launchers no-bg ln-preview"} role="img" aria-label={ru.common.preview}>
            <LaunchersGrid items={items} showLabels={ln.showLabels} />
          </div>
        </div>
        <p className="hint ln-preview-hint">{extra.preview}</p>
      </div>

      <Section title={ru.settings.launchers.builtIn} description={extra.builtInHint}>
        {BUILT_IN.map((b) => {
          const on = ln.builtIn[b.id];
          const color = draftColors[b.id] ?? ln.builtInColors[b.id];
          const open = colorOpen === b.id;
          const look: LauncherLook = { name: b.name, url: b.url, icon: { kind: "fluent", name: b.icon }, color };
          return (
            <div key={b.id} id={itemDomId(b.id)} className={on ? "ln-item" : "ln-item off"}>
              <div className="row ln-row">
                <LauncherIcon look={look} />
                <div className="row-text">
                  <span className="row-label ellipsis">{b.name}</span>
                  <span className="row-hint mono ellipsis">{hostOf(b.url)}</span>
                </div>
                <div className="row-control">
                  <button
                    type="button"
                    className={open ? "cp-swatch ln-dot selected" : "cp-swatch ln-dot"}
                    style={{ background: color }}
                    aria-label={extra.colorOf(b.name)}
                    aria-expanded={open}
                    onClick={() => toggleColor(b.id)}
                  />
                  <Switch checked={on} ariaLabel={b.name} onChange={(v) => void setBuiltIn(b.id, v)} />
                </div>
              </div>
              {open && (
                <div className="ln-color-pop">
                  <ColorPicker value={color} onChange={(hex) => changeBuiltInColor(b.id, hex)} />
                </div>
              )}
            </div>
          );
        })}
      </Section>

      <Section title={ru.settings.launchers.custom} description={extra.customHint}>
        {ln.custom.length === 0 ? (
          <div className="ln-empty">
            <span className="ln-empty-icon">
              <Icon name="apps" size={24} />
            </span>
            <span className="body-strong">{ru.settings.launchers.noCustom}</span>
            <span className="hint">{extra.noCustomHint}</span>
            <Button variant="accent" icon="add" onClick={openNew}>
              {ru.settings.launchers.addLauncher}
            </Button>
          </div>
        ) : (
          <>
            {ln.custom.map((c, i) => (
              <div key={c.id} className="row ln-row">
                <LauncherIcon look={c} />
                <div className="row-text">
                  <span className="row-label ellipsis">{c.name}</span>
                  <span className="row-hint mono ellipsis">{c.url}</span>
                  {siteIconMissing(c.icon) && <span className="row-hint ln-warn">{ru.settings.launchers.iconFailed}</span>}
                </div>
                <div className="row-control">
                  <IconButton icon="arrow_up" label={extra.moveUp} variant="subtle" disabled={i === 0} onClick={() => void moveCustom(c.id, -1)} />
                  <IconButton
                    icon="arrow_down"
                    label={extra.moveDown}
                    variant="subtle"
                    disabled={i === ln.custom.length - 1}
                    onClick={() => void moveCustom(c.id, 1)}
                  />
                  <Button onClick={() => setEditor({ item: c })}>{ru.common.edit}</Button>
                  <Button variant="danger" onClick={() => void removeCustom(c.id)}>
                    {ru.common.remove}
                  </Button>
                </div>
              </div>
            ))}
            <div className="ln-foot">
              <Button variant="accent" icon="add" onClick={openNew}>
                {ru.settings.launchers.addLauncher}
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title={extra.display}>
        <Row label={ru.settings.launchers.showLabels} hint={extra.showLabelsHint}>
          <Switch checked={ln.showLabels} ariaLabel={ru.settings.launchers.showLabels} onChange={(v) => void settings.updateLaunchers({ showLabels: v })} />
        </Row>
        <Row label={ru.settings.launchers.background} hint={extra.backgroundHint}>
          <Switch checked={ln.background} ariaLabel={ru.settings.launchers.background} onChange={(v) => void settings.updateLaunchers({ background: v })} />
        </Row>
      </Section>

      {editor && <LauncherEditor item={editor.item} showLabels={ln.showLabels} onClose={closeEditor} />}
    </Page>
  );
}
