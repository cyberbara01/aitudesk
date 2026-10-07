// Room search field (SPEC §3 text field, width 200, mono because it holds a room code). Esc clears it.
import type { KeyboardEvent } from "react";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";

interface Props {
  value: string;
  /** Raw text from the field; the owner normalises or rejects it. */
  onChange: (raw: string) => void;
  onClear: () => void;
  className?: string;
}

export function MapSearch({ value, onChange, onClear, className }: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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

  const cls = ["map-search", className ?? ""].filter(Boolean).join(" ");
  return (
    <input
      className={cls}
      type="text"
      value={value}
      placeholder={ru.map.searchPlaceholder}
      aria-label={extra.searchLabel}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
