import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Select, type SelectOption } from "../components/Select";
import { Switch } from "../components/Switch";
import { TextField } from "../components/TextField";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.system";
import { widgetInk } from "../lib/ink";
import { settings, type SystemSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useSystemInfo, useUserName } from "../lib/useSystemInfo";
import { SystemRows, deviceName } from "../tiles/System";
import { InkWidgetSection } from "./InkSection";

type LabelMode = SystemSettings["labelMode"];

const LABEL_MAX = 40;
/** Typing in the custom label is written to disk after this pause (and on blur / Enter / leaving the page). */
const COMMIT_DELAY = 400;
/** A name revealed in the preview hides again this long after the pointer left it (as on the tile, Masked.tsx). */
const REVEAL_GRACE = 1500;

const T = ru.settings.system;
const X = extra.settings.system;

/** On a laptop the default is «Батарея» and «Ноутбук» is a choice of its own; on a PC both are «Стационарный ПК». */
const LAPTOP_OPTIONS: readonly SelectOption<LabelMode>[] = [
  { value: "default", label: ru.system.battery },
  { value: "device", label: ru.system.laptop },
  { value: "user", label: T.labelUser },
  { value: "custom", label: T.labelCustom },
];
const PC_OPTIONS: readonly SelectOption<LabelMode>[] = [
  { value: "default", label: T.labelDefault },
  { value: "user", label: T.labelUser },
  { value: "custom", label: T.labelCustom },
];

/** Settings → «Система»: live preview, rows, privacy, first-row label, tile background, section reset. */
export function SystemPage() {
  const s = useSettings();
  const sys = s.system;

  // The preview polls (through the window's shared poller) only while it is on screen.
  const deskRef = useRef<HTMLDivElement>(null);
  const [previewOnScreen, setPreviewOnScreen] = useState(true);
  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const io = new IntersectionObserver(([entry]) => setPreviewOnScreen(entry.isIntersecting));
    io.observe(desk);
    return () => io.disconnect();
  }, []);
  const info = useSystemInfo({ wifi: sys.showWifi, bluetooth: sys.showBluetooth, active: previewOnScreen });
  // Asked up front (once per window), so choosing «Имя учётной записи» shows the name right away.
  const userName = useUserName(true);

  // Hidden names: the eye works in the preview too. The tile hides a revealed name again once the pointer has
  // left its window for a moment; the preview is no window of its own, so here leaving the preview tile does it:
  // the rows are mounted afresh, every name back to dots.
  const [maskEpoch, setMaskEpoch] = useState(0);
  const revealTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(revealTimer.current), []);
  const onPreviewEnter = () => window.clearTimeout(revealTimer.current);
  const onPreviewLeave = () => {
    window.clearTimeout(revealTimer.current);
    if (sys.hideNames) revealTimer.current = window.setTimeout(() => setMaskEpoch((n) => n + 1), REVEAL_GRACE);
  };

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
  // The options follow this computer: a laptop has its charge in the first row, a PC «От сети».
  const laptop = info.power?.hasBattery === true;
  const fallback = deviceName(laptop);
  const mode: LabelMode = !laptop && sys.labelMode === "device" ? "default" : sys.labelMode;

  const update = (p: Partial<SystemSettings>) => void settings.updateSystem(p);

  return (
    <Page title={ru.settings.nav.system} description={X.pageDesc}>
      <div className="sys-stage">
        <div className="sys-stage-head">
          <span className="body-strong">{ru.common.preview}</span>
        </div>
        <div ref={deskRef} className="sys-desk">
          <div
            className={sys.background ? "tile tile-system" : "tile tile-system no-bg"}
            {...widgetInk(s, "system")}
            onPointerEnter={onPreviewEnter}
            onPointerLeave={onPreviewLeave}
          >
            <SystemRows key={maskEpoch} info={info} settings={preview} />
          </div>
        </div>
        <p className="hint sys-stage-hint">{X.previewHint}</p>
      </div>

      <Section title={T.rows} description={X.rowsHint}>
        <Row label={T.showWifi} hint={X.showWifiHint}>
          <Switch checked={sys.showWifi} onChange={(v) => update({ showWifi: v })} ariaLabel={T.showWifi} />
        </Row>
        <Row label={T.showBluetooth} hint={X.showBluetoothHint}>
          <Switch checked={sys.showBluetooth} onChange={(v) => update({ showBluetooth: v })} ariaLabel={T.showBluetooth} />
        </Row>
      </Section>

      <Section title={T.privacy}>
        <Row label={T.hideNames} hint={T.hideNamesHint}>
          <Switch checked={sys.hideNames} onChange={(v) => update({ hideNames: v })} ariaLabel={T.hideNames} />
        </Row>
      </Section>

      <Section title={T.label} description={X.labelHint}>
        <Row label={X.labelMode}>
          <Select
            options={laptop ? LAPTOP_OPTIONS : PC_OPTIONS}
            value={mode}
            onChange={(m) => update({ labelMode: m })}
            ariaLabel={X.labelMode}
          />
        </Row>
        {sys.labelMode === "custom" && (
          <div className="row stack sys-custom-row">
            <TextField
              className="sys-custom-field"
              inputClassName="sys-custom-input"
              label={T.labelCustom}
              value={draft}
              onChange={onDraft}
              placeholder={laptop ? T.labelPlaceholderLaptop : T.labelPlaceholder}
              maxLength={LABEL_MAX}
              suffix={`${draft.length}/${LABEL_MAX}`}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
              }}
            />
            {/* One hint for both states, so the field never jumps while typing. */}
            <span className="row-hint">{X.customEmptyHint(fallback)}</span>
          </div>
        )}
        {sys.labelMode === "user" && (
          <Row label={T.labelUser} hint={userName === "" ? X.userNameUnavailable(fallback) : X.userNameHint}>
            <span className="sys-user">
              <Icon name="person" />
              <span className="ellipsis">{userName === "" ? fallback : userName}</span>
            </span>
          </Row>
        )}
      </Section>

      <Section title={X.look}>
        <Row label={T.background} hint={X.backgroundHint}>
          <Switch checked={sys.background} onChange={(v) => update({ background: v })} ariaLabel={T.background} />
        </Row>
      </Section>

      <InkWidgetSection widget="system" />

      <ResetSection section="system" />
    </Page>
  );
}
