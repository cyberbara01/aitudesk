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
import { LauncherCell, LauncherIcon, ServiceCell, type LauncherLook } from "./launchers/LauncherIcon";

interface Props {
  /** From ?edit= / settings-navigate: a custom id opens its editor, a built-in key opens its colour. */
  editId?: string | null;
}

/** Dragging in the colour picker emits on every pointer move; the store is written this long after the last one. */
const COLOR_COMMIT_MS = 120;

type DraftColors = Partial<Record<BuiltInLauncher, string>>;

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

  // Deep link from the tile's context menu.
  useEffect(() => {
    if (!loaded || !editId || handledEdit.current === editId) return;
    handledEdit.current = editId;
    const custom = settings.get().launchers.custom.find((c) => c.id === editId);
    if (custom) setEditor({ item: custom });
    else if (isBuiltInKey(editId)) setColorOpen(editId);
  }, [loaded, editId]);

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

  return (
    <Page title={ru.settings.nav.launchers} description={extra.description}>
      <div className="ln-preview-wrap" aria-label={ru.common.preview}>
        <div className={ln.background ? "ln-preview" : "ln-preview no-bg"}>
          {items.map((it) => (
            <LauncherCell key={it.id} look={it} showLabel={ln.showLabels} />
          ))}
          <ServiceCell variant="add" caption={ru.launchers.add} ariaLabel={ru.settings.launchers.addLauncher} showLabel={ln.showLabels} />
        </div>
        <span className="hint">{extra.preview}</span>
      </div>

      <Section title={ru.settings.launchers.builtIn} description={extra.builtInHint}>
        {BUILT_IN.map((b) => {
          const on = ln.builtIn[b.id];
          const color = draftColors[b.id] ?? ln.builtInColors[b.id];
          const open = colorOpen === b.id;
          const look: LauncherLook = { name: b.name, url: b.url, icon: { kind: "fluent", name: b.icon }, color };
          return (
            <div key={b.id} className={on ? "ln-item" : "ln-item off"}>
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
                  <Switch checked={on} onChange={(v) => void setBuiltIn(b.id, v)} />
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
          <Switch checked={ln.showLabels} onChange={(v) => void settings.updateLaunchers({ showLabels: v })} />
        </Row>
        <Row label={ru.settings.launchers.background} hint={extra.backgroundHint}>
          <Switch checked={ln.background} onChange={(v) => void settings.updateLaunchers({ background: v })} />
        </Row>
      </Section>

      {editor && <LauncherEditor item={editor.item} showLabels={ln.showLabels} onClose={() => setEditor(null)} />}
    </Page>
  );
}
