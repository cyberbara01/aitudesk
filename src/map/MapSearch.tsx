// Room search field (§3 text field, width 200, Cascadia Mono because it holds a room code). Esc clears it.
import type { KeyboardEvent } from "react";
import { ru } from "../i18n/ru";

interface Props {
  value: string;
  /** Raw text from the field; the owner normalises or rejects it. */
  onChange: (raw: string) => void;
  onClear: () => void;
  className?: string;
}

export function MapSearch({ value, onChange, onClear, className }: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClear();
    }
  };

  const cls = ["map-search", className ?? ""].filter(Boolean).join(" ");
  return (
    <input
      className={cls}
      type="text"
      value={value}
      placeholder={ru.map.searchPlaceholder}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
