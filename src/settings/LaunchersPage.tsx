import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../components/Button";
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
  builtInItem,
  cacheIconSvgs,
  customItem,
  hostOf,
  isBuiltInKey,
  isBuiltInOriginal,
  moveCustom,
  removeCustom,
  setBuiltIn,
  siteIconMissing,
  visibleLaunchers,
  type LauncherItem,
} from "../lib/launchers";
import { widgetInk } from "../lib/ink";
import { settings } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { iconSvgFor, trustedIconSvg } from "./launchers/iconCache";
import { LauncherEditor } from "./launchers/LauncherEditor";
import { LauncherIcon } from "./launchers/LauncherIcon";
import { LaunchersGrid } from "./launchers/LaunchersGrid";
import { InkWidgetSection } from "./InkSection";

interface Props {
  /** From ?edit= / settings-navigate: a custom launcher id or a built-in key opens its editor. */
  editId?: string | null;
}

/**
 * «Ярлыки»: live preview, built-in launchers (editor + switch), custom launchers (editor, order, delete),
 * display options, reset of the section. Built-in and custom launchers share one editor; a built-in one is
 * switched off instead of deleted.
 */
export function LaunchersPage({ editId }: Props) {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const ln = s.launchers;
  /** The open editor: item null = a new launcher. */
  const [editor, setEditor] = useState<{ item: LauncherItem | null } | null>(null);
  /** Launchers below the preview's rows: the hint then says the tile scrolls and how to make it bigger. */
  const [previewHidden, setPreviewHidden] = useState(0);
  const handledEdit = useRef<string | null>(null);

  // Deep link from the tile's context menu.
  useEffect(() => {
    if (!loaded || !editId || handledEdit.current === editId) return;
    handledEdit.current = editId;
    const now = settings.get().launchers;
    const custom = now.custom.find((c) => c.id === editId);
    if (custom) setEditor({ item: customItem(custom) });
    else if (isBuiltInKey(editId)) setEditor({ item: builtInItem(now, editId) });
  }, [loaded, editId]);

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

  const items = useMemo(() => visibleLaunchers(s), [s]);
  /** Every built-in as it shows now (edits applied, switched off or not), and whether it differs from the original. */
  const builtIns = useMemo(
    () =>
      BUILT_IN.map((b) => {
        const item = builtInItem(ln, b.id);
        return { key: b.id, item, changed: !isBuiltInOriginal(b.id, item) };
      }),
    [ln],
  );

  const openNew = () => setEditor({ item: null });
  // Stable: the Dialog re-registers in the Esc stack and re-focuses its first field whenever onClose changes.
  const closeEditor = useCallback(() => setEditor(null), []);

  return (
    <Page title={ru.settings.nav.launchers} description={extra.description}>
      {/* Live preview: the real tile (material, padding and grid of the chosen style) at the default tile
          size 280 x 184, so the cells and «Добавить» sit exactly as on a desktop tile of that size at rest. */}
      <div className="ln-preview-wrap">
        <div className="ln-stage">
          <div
            className={ln.background ? "tile tile-launchers ln-preview" : "tile tile-launchers no-bg ln-preview"}
            role="img"
            aria-label={ru.common.preview}
            {...widgetInk(s, "launchers")}
          >
            <LaunchersGrid items={items} showLabels={ln.showLabels} onHiddenChange={setPreviewHidden} />
          </div>
        </div>
        <p className="hint ln-preview-hint">{previewHidden > 0 ? extra.previewOverflow(previewHidden) : extra.preview}</p>
      </div>

      <Section title={ru.settings.launchers.builtIn} description={extra.builtInHint}>
        {builtIns.map(({ key, item, changed }) => {
          const on = ln.builtIn[key];
          return (
            <div key={key} className={on ? "row ln-row" : "row ln-row off"}>
              <LauncherIcon look={item} />
              {/* Host only (the full URL is in the editor), then a word when it differs from the original. */}
              <div className="row-text">
                <span className="row-label ellipsis">{item.name}</span>
                <span className="row-hint ellipsis">
                  <span className="mono">{hostOf(item.url)}</span>
                  {changed && ` · ${extra.changed}`}
                </span>
                {siteIconMissing(item.icon) && <span className="row-hint ln-warn">{ru.settings.launchers.iconFailed}</span>}
              </div>
              <div className="row-control">
                <Tooltip text={ru.common.edit}>
                  <IconButton icon="edit" label={ru.common.edit} variant="subtle" onClick={() => setEditor({ item })} />
                </Tooltip>
                <Switch checked={on} ariaLabel={item.name} onChange={(v) => void setBuiltIn(key, v)} />
              </div>
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
                      <IconButton icon="edit" label={ru.common.edit} variant="subtle" onClick={() => setEditor({ item: customItem(c) })} />
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

      <InkWidgetSection widget="launchers" />

      <ResetSection section="launchers" />
    </Page>
  );
}
