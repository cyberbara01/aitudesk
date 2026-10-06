import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
  /** Inline style for the option label (e.g. a font preview). */
  style?: React.CSSProperties;
}

interface SelectProps<T extends string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  ariaLabel?: string;
  className?: string;
  /** Apply the selected option's style to the button text too (font previews). */
  styledValue?: boolean;
}

/** Custom dropdown (button + popover list) with keyboard support; closes on outside click / Esc. */
export function Select<T extends string>({ options, value, onChange, label, ariaLabel, className, styledValue }: SelectProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const choose = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={["select", className ?? ""].filter(Boolean).join(" ")}>
      {label && (
        <label className="select-label" htmlFor={id}>
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        className="select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
      >
        <span className="select-text" style={styledValue ? current?.style : undefined}>
          {current?.label ?? ""}
        </span>
        <Icon name={open ? "chevron_up" : "chevron_down"} size={16} />
      </button>
      {open && (
        <div className="popover" role="listbox" aria-activedescendant={`${id}-opt-${active}`}>
          {options.map((o, i) => (
            <button
              key={o.value}
              id={`${id}-opt-${i}`}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={["popover-item", o.value === value ? "selected" : "", i === active ? "active" : ""].filter(Boolean).join(" ")}
              style={o.style}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.icon && <Icon name={o.icon} size={16} />}
              <span className="ellipsis">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
