// Room search field (kit text field, width 200, mono because it holds a room code). Enter shows the found
// rooms (the map centres and zooms on them), Esc or the clear button empties it. With text that matches nothing
// on the floor the field shows «Ничего не найдено» under it. `pinned` keeps it visible without hover (the schedule
// tile asked for a room that is not on the plan).
import { useId, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";

interface Props {
  value: string;
  /** Raw text from the field; the owner normalises it. */
  onChange: (raw: string) => void;
  onClear: () => void;
  /** Enter: centre the map on the found rooms. */
  onSubmit: () => void;
  notFound: boolean;
  pinned?: boolean;
}

export function MapSearch({ value, onChange, onClear, onSubmit, notFound, pinned }: Props) {
  const msgId = useId();

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.key !== "Escape") return;
    if (value) {
      // This Esc only clears the search: paint mode (it checks defaultPrevented) stays on.
      e.preventDefault();
      onClear();
    } else {
      // Nothing to clear: leave the field, and the Esc goes on to end paint mode if it is active.
      e.currentTarget.blur();
    }
  };

  const cls = ["map-search", pinned ? "pinned" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} data-state={notFound ? "empty" : undefined}>
      <input
        className="map-search-input"
        type="text"
        value={value}
        maxLength={40}
        placeholder={ru.map.searchPlaceholder}
        aria-label={extra.searchLabel}
        aria-invalid={notFound}
        aria-describedby={notFound ? msgId : undefined}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button type="button" className="map-search-clear" aria-label={extra.clearSearch} onClick={onClear}>
          <Icon name="dismiss" size={16} />
        </button>
      )}
      {notFound && (
        <span id={msgId} className="map-search-msg" role="status">
          {ru.common.nothingFound}
        </span>
      )}
    </div>
  );
}
