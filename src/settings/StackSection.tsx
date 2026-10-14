// «Стопки виджетов» on «Виджеты»: what stacks are and «Новая стопка», then a card per stack: its name, which way it
// pages, its widgets in their order (dragged by the handle, or Alt+arrows on it), each taken out with one button,
// «Добавить» with the widgets that could go in, and «Удалить стопку». The stacks on the desktop follow at once
// (src/stack/StackHost.tsx, src-tauri/src/stacks.rs).
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Select, type SelectOption } from "../components/Select";
import { TextField } from "../components/TextField";
import { Tooltip } from "../components/Tooltip";
import { extra as shell } from "../i18n/ru.extra.shell";
import { extra as st } from "../i18n/ru.extra.stack";
import { popupMenu } from "../lib/nativeMenu";
import { settings, STACK_AXES, STACK_MAX, STACK_NAME_MAX, stackLabel, TILE_VIEWS, type Settings, type StackAxis, type StackDef, type TileView } from "../lib/settings";
import { useDragReorder } from "../lib/useDragReorder";
import {
  addable,
  addItems,
  deleteStack,
  newStack,
  removeFromStack,
  renameStack,
  setStackAxis,
  setStackOrder,
  stackName,
  switchedOn,
  widgetIcon,
  widgetName,
} from "../stack/actions";

const t = st.settings;
const AXIS_OPTIONS: readonly SegmentedOption<StackAxis>[] = STACK_AXES.map((a) => ({ value: a, label: t.axes[a] }));
const VIEW_OPTIONS: readonly SelectOption<TileView>[] = TILE_VIEWS.map((tv) => ({ value: tv, label: shell.views[tv] }));
/** A name is written once the typing pauses (each write renames the window too). */
const NAME_COMMIT_MS = 400;

/** The name field: answers at once, writes after a pause and when it loses the focus. */
function NameField({ def, placeholder }: { def: StackDef; placeholder: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef(0);
  const commit = useCallback(
    (v: string) => {
      window.clearTimeout(timer.current);
      timer.current = 0;
      if (v !== def.name) void renameStack(def.id, v).finally(() => setDraft((d) => (d === v ? null : d)));
      else setDraft(null);
    },
    [def.id, def.name],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <TextField
      value={draft ?? def.name}
      placeholder={placeholder}
      maxLength={STACK_NAME_MAX}
      ariaLabel={t.nameLabel}
      onChange={(v) => {
        setDraft(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => commit(v), NAME_COMMIT_MS);
      }}
      onBlur={() => {
        if (draft !== null) commit(draft);
      }}
    />
  );
}

/** One stack: its name, «Листать», its widgets, «Добавить» and «Удалить стопку». */
function StackCard({ s, def }: { s: Settings; def: StackDef }) {
  const members = def.members;
  const listRef = useRef<HTMLDivElement>(null);
  const onMove = useCallback(
    (id: string, before: string | null) => {
      const rest = members.filter((m) => m !== id);
      const at = before ? rest.indexOf(before) : rest.length;
      rest.splice(at < 0 ? rest.length : at, 0, id);
      void setStackOrder(def.id, rest);
    },
    [members, def.id],
  );
  const reorder = useDragReorder(listRef, { ids: members, onMove });
  const name = stackName(s, def);
  const openAdd = () => {
    invoke("activate_tile").catch(() => undefined);
    void popupMenu(addItems(s, def.id, `set-add-${def.id}`)).catch(() => undefined);
  };
  return (
    <Section title={name} description={t.count(members.length)}>
      <Row label={t.nameLabel}>
        <NameField def={def} placeholder={name} />
      </Row>
      <Row label={t.axis} hint={t.axisHint}>
        <Segmented options={AXIS_OPTIONS} value={def.axis} onChange={(a) => void setStackAxis(def.id, a)} size="sm" ariaLabel={t.axis} />
      </Row>
      <Row label={shell.views.stackSize} hint={shell.views.hint}>
        <Select
          options={VIEW_OPTIONS}
          value={s.tileViews[stackLabel(def.id)] ?? "manual"}
          onChange={(tv) => void settings.setTileView(stackLabel(def.id), tv)}
          ariaLabel={shell.views.stackSize}
          className="tile-size"
          icon="resize"
        />
      </Row>
      {members.length === 0 ? (
        <p className="stack-set-empty">{t.empty}</p>
      ) : (
        <div ref={listRef} className="stack-set-list" role="list" onPointerDown={reorder.onPointerDown} onKeyDown={reorder.onKeyDown}>
          {members.map((m) => {
            const widget = widgetName(s, m);
            const on = switchedOn(s, m);
            return (
              <div key={m} className={on ? "row stack-set-row" : "row stack-set-row off"} role="listitem" data-reorder-id={m}>
                {members.length > 1 && (
                  <Tooltip text={t.order} className="stack-set-grip">
                    <button type="button" className="stack-set-grip-btn" aria-label={t.order} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-drag-handle>
                      <Icon name="re_order_dots_vertical" size={16} />
                    </button>
                  </Tooltip>
                )}
                <span className="row-icon" data-icon={widgetIcon(m)} aria-hidden="true">
                  <Icon name={widgetIcon(m)} />
                </span>
                <div className="row-text">
                  <span className="row-label ellipsis">{widget}</span>
                  {!on && <span className="row-hint">{t.off}</span>}
                </div>
                <div className="row-control">
                  <Button size="sm" icon="arrow_exit" onClick={() => void removeFromStack(m)} aria-label={`${t.remove}: ${widget}`}>
                    {t.remove}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="cw-foot">
        <Button variant={members.length === 0 ? "accent" : "default"} icon="stack_add" onClick={openAdd} disabled={addable(s).length === 0}>
          {t.add}
        </Button>
        <Tooltip text={t.deleteHint}>
          <Button icon="stack_off" onClick={() => void deleteStack(def.id)}>
            {t.delete}
          </Button>
        </Tooltip>
        {members.length > 1 && <span className="cw-hint">{t.order}</span>}
      </div>
    </Section>
  );
}

export function StackSection({ s }: { s: Settings }) {
  const full = s.stacks.length >= STACK_MAX;
  return (
    <>
      <Section title={t.title} description={t.desc}>
        <div className="cw-foot">
          <Button variant={s.stacks.length === 0 ? "accent" : "default"} icon="add" onClick={() => void newStack()} disabled={full}>
            {t.newStack}
          </Button>
          <span className="cw-hint">{s.stacks.length === 0 ? t.none : t.newHint(STACK_MAX)}</span>
        </div>
      </Section>
      {s.stacks.map((def) => (
        <StackCard key={def.id} s={s} def={def} />
      ))}
    </>
  );
}
