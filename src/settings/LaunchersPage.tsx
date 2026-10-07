import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
import { ColorPicker } from "../components/ColorPicker";
import { EmptyState } from "../components/EmptyState";
import { hasIcon } from "../components/Icon";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Switch } from "../components/Switch";
import { Tooltip } from "../components/Tooltip";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.launchers";
import {
  BUILT_IN,
  cacheIconSvgs,
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
import { iconSvgFor, trustedIconSvg } from "./launchers/iconCache";
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

/**
 * «Ярлыки»: live preview, built-in launchers (switch + colour), custom launchers (editor dialog), display
 * options, reset of the section.
 */
export function LaunchersPage({ editId }: Props) {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const ln = s.launchers;
  const [editor, setEditor] = useState<{ item: CustomLauncher | null } | null>(null);
  const [colorOpen, setColorOpen] = useState<BuiltInLauncher | null>(null);
  const [draftColors, setDraftColors] = useState<DraftColors>({});
  /** Launchers the preview hides behind «+N»: the hint then explains how to make the tile bigger. */
  const [previewHidden, setPreviewHidden] = useState(0);
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
  // deep link put focus on its current swatch so «Цвет…» on the tile lands on something visibly changed.
  useEffect(() => {
    if (!colorOpen) return;
    const item = document.getElementById(itemDomId(colorOpen));
    item?.scrollIntoView({ block: "nearest" });
    if (!focusPopover.current) return;
    focusPopover.current = false;
    const pop = item?.querySelector<HTMLElement>(".ln-color-pop");
    (pop?.querySelector<HTMLElement>('.cp-swatch[aria-checked="true"]') ?? pop?.querySelector<HTMLElement>(".cp-swatch"))?.focus();
  }, [colorOpen]);

  // Launchers saved before the icon cache existed: store their icon markup once, so the desktop tile draws
  // them without loading the full icon set. The page shows these icons anyway, so this costs no extra load.
  useEffect(() => {
    if (!loaded) return;
    const names = new Set<string>();
    for (const c of settings.get().launchers.custom) {
      if (c.icon.kind === "fluent" && hasIcon(c.icon.name) && !trustedIconSvg(c.icon)) names.add(c.icon.name);
    }
    if (!names.size) return;
    let alive = true;
    void Promise.all([...names].map(async (n) => [n, await iconSvgFor(n)] as const)).then((pairs) => {
      const found = new Map<string, string>();
      for (const [n, svg] of pairs) if (svg) found.set(n, svg);
      if (alive && found.size) void cacheIconSvgs(found);
    });
    return () => {
      alive = false;
    };
  }, [loaded]);

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
      {/* Live preview: the real tile (material, padding and grid of the chosen style) at the default tile
          size 280 x 184, so «Добавить» and «+N» appear exactly as on a desktop tile of that size. */}
      <div className="ln-preview-wrap">
        <div className="ln-stage">
          <div className={ln.background ? "tile tile-launchers ln-preview" : "tile tile-launchers no-bg ln-preview"} role="img" aria-label={ru.common.preview}>
            <LaunchersGrid items={items} showLabels={ln.showLabels} onHiddenChange={setPreviewHidden} />
          </div>
        </div>
        <p className="hint ln-preview-hint">{previewHidden > 0 ? extra.previewOverflow(previewHidden) : extra.preview}</p>
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
          <EmptyState
            title={ru.settings.launchers.noCustom}
            hint={extra.noCustomHint}
            action={{ label: ru.settings.launchers.addLauncher, icon: "add", onClick: openNew }}
          />
        ) : (
          <>
            {ln.custom.map((c, i) => {
              const first = i === 0;
              const last = i === ln.custom.length - 1;
              return (
                <div key={c.id} className="row ln-row">
                  <LauncherIcon look={c} />
                  {/* Host only, like the built-ins: the full URL is in the editor. */}
                  <div className="row-text">
                    <span className="row-label ellipsis">{c.name}</span>
                    <span className="row-hint mono ellipsis">{hostOf(c.url)}</span>
                    {siteIconMissing(c.icon) && <span className="row-hint ln-warn">{ru.settings.launchers.iconFailed}</span>}
                  </div>
                  {/* Row actions as on every list page: quiet icon buttons, delete turns critical on hover. */}
                  <div className="row-control">
                    <Tooltip text={extra.moveUp} disabled={first}>
                      <IconButton icon="arrow_up" label={extra.moveUp} variant="subtle" disabled={first} onClick={() => void moveCustom(c.id, -1)} />
                    </Tooltip>
                    <Tooltip text={extra.moveDown} disabled={last}>
                      <IconButton icon="arrow_down" label={extra.moveDown} variant="subtle" disabled={last} onClick={() => void moveCustom(c.id, 1)} />
                    </Tooltip>
                    <Tooltip text={ru.common.edit}>
                      <IconButton icon="edit" label={ru.common.edit} variant="subtle" onClick={() => setEditor({ item: c })} />
                    </Tooltip>
                    <Tooltip text={ru.common.remove}>
                      <IconButton icon="delete" label={ru.common.remove} variant="danger" onClick={() => void removeCustom(c.id)} />
                    </Tooltip>
                  </div>
                </div>
              );
            })}
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

      <ResetSection section="launchers" />
    </Page>
  );
}
