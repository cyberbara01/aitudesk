import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { TextField } from "../components/TextField";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.system";
import { settings, type SystemSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useSystemInfo, useUserName } from "../lib/useSystemInfo";
import { SystemRows } from "../tiles/System";

type LabelMode = SystemSettings["labelMode"];

const LABEL_MAX = 40;
/** Typing in the custom label is written to disk after this pause (and on blur / Enter / leaving the page). */
const COMMIT_DELAY = 400;

const T = ru.settings.system;
const X = extra.settings.system;

const MODE_OPTIONS: readonly SegmentedOption<LabelMode>[] = [
  { value: "default", label: T.labelDefault },
  { value: "user", label: T.labelUser },
  { value: "custom", label: T.labelCustom },
];

/** Settings → «Система»: live preview, rows, privacy, first-row label, tile background. */
export function SystemPage() {
  const s = useSettings();
  const sys = s.system;
  const info = useSystemInfo();
  const userName = useUserName(sys.labelMode === "user");

  // The custom label is edited locally and committed with a short delay so every keystroke does not hit the disk.
  const [draft, setDraft] = useState(sys.customLabel);
  const latest = useRef(draft);
  const dirty = useRef(false);
  const timer = useRef(0);

  useEffect(() => {
    if (!dirty.current) {
      latest.current = sys.customLabel;
      setDraft(sys.customLabel);
    }
  }, [sys.customLabel]);

  const commit = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    void settings.updateSystem({ customLabel: latest.current.slice(0, LABEL_MAX) });
  }, []);

  // Leaving the page flushes a pending edit.
  useEffect(() => () => commit(), [commit]);

  const onDraft = (v: string) => {
    const next = v.slice(0, LABEL_MAX);
    latest.current = next;
    dirty.current = true;
    setDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, COMMIT_DELAY);
  };

  /** What the tile will show, including the label being typed right now. */
  const preview: SystemSettings = draft === sys.customLabel ? sys : { ...sys, customLabel: draft };

  const update = (p: Partial<SystemSettings>) => void settings.updateSystem(p);

  return (
    <Page title={ru.settings.nav.system} description={X.pageDesc}>
      <div className="sys-preview">
        <div className="sys-stage">
          <div className={sys.background ? "tile tile-system" : "tile tile-system no-bg"} role="img" aria-label={ru.common.preview}>
            <SystemRows info={info} settings={preview} />
          </div>
        </div>
        <p className="hint sys-preview-hint">{X.previewHint}</p>
      </div>

      <Section title={T.rows} description={X.rowsHint}>
        <Row label={T.showWifi} hint={X.showWifiHint}>
          <Switch checked={sys.showWifi} onChange={(v) => update({ showWifi: v })} />
        </Row>
        <Row label={T.showBluetooth} hint={X.showBluetoothHint}>
          <Switch checked={sys.showBluetooth} onChange={(v) => update({ showBluetooth: v })} />
        </Row>
      </Section>

      <Section title={T.privacy}>
        <Row label={T.hideNames} hint={T.hideNamesHint}>
          <Switch checked={sys.hideNames} onChange={(v) => update({ hideNames: v })} />
        </Row>
      </Section>

      <Section title={T.label} description={X.labelHint}>
        <Row label={X.labelMode} stack>
          <Segmented fill options={MODE_OPTIONS} value={sys.labelMode} onChange={(m) => update({ labelMode: m })} ariaLabel={T.label} />
        </Row>
        {sys.labelMode === "custom" && (
          <Row label={T.labelCustom} hint={draft.trim() ? undefined : X.customEmptyHint} stack>
            <TextField
              className="sys-field"
              inputClassName="sys-label-input"
              value={draft}
              onChange={onDraft}
              placeholder={T.labelPlaceholder}
              maxLength={LABEL_MAX}
              suffix={`${draft.length}/${LABEL_MAX}`}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
              }}
            />
          </Row>
        )}
        {sys.labelMode === "user" && (
          <Row label={T.labelUser} hint={userName === "" ? X.userNameUnavailable : X.userNameHint}>
            <span className="sys-user">
              <Icon name="person" />
              <span className="ellipsis">{userName === null ? "…" : userName || ru.system.desktopPc}</span>
            </span>
          </Row>
        )}
      </Section>

      <Section title={X.look}>
        <Row label={T.background} hint={X.backgroundHint}>
          <Switch checked={sys.background} onChange={(v) => update({ background: v })} />
        </Row>
      </Section>
    </Page>
  );
}
