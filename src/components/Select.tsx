import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
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

/** The box a list must stay inside: the nearest scrolling ancestor (the settings page, a dialog's body), else the
 *  window. */
function boundsOf(el: HTMLElement): { top: number; bottom: number } {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") {
      const r = p.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

/**
 * Custom dropdown (button + popover list) with keyboard support; closes on outside click / Esc. The list opens
 * below the button, or above it when only there it has room (a row near the bottom of the page); otherwise the
 * page scrolls it into view. It opens scrolled to the chosen option, and keyboard moves keep the active one in view.
 */
export function Select<T extends string>({ options, value, onChange, label, ariaLabel, className, styledValue }: SelectProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  /** Opened upwards: the list's distance from the bottom of the select (px), above its button; null: below. */
  const [up, setUp] = useState<number | null>(null);
  const current = options.find((o) => o.value === value);
  /** Opens on the chosen option, so the list scrolls to it and not to an option hovered last time. */
  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  useLayoutEffect(() => {
    const pop = popRef.current;
    const btn = rootRef.current?.querySelector<HTMLElement>(".select-btn");
    if (!open || !pop || !btn) {
      setUp(null);
      return;
    }
    const b = btn.getBoundingClientRect();
    const box = boundsOf(rootRef.current!);
    const need = pop.offsetHeight + 4;
    const below = box.bottom - b.bottom;
    const above = b.top - box.top;
    const flip = need > below && above > below;
    // Above the button itself, not above a label over it.
    setUp(flip ? rootRef.current!.offsetHeight - btn.offsetTop + 4 : null);
    if (!flip && need > below) pop.scrollIntoView({ block: "nearest" });
    const chosen = pop.querySelector<HTMLElement>(".popover-item.selected");
    if (chosen) pop.scrollTop = Math.max(0, chosen.offsetTop - (pop.clientHeight - chosen.offsetHeight) / 2);
  }, [open]);

  useEffect(() => {
    if (open) popRef.current?.querySelector<HTMLElement>(".popover-item.active")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

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
        openList();
        return;
      }
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else openList();
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
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <span className="select-text" style={styledValue ? current?.style : undefined}>
          {current?.label ?? ""}
        </span>
        <Icon name={open ? "chevron_up" : "chevron_down"} size={16} />
      </button>
      {open && (
        <div
          ref={popRef}
          className="popover"
          role="listbox"
          aria-activedescendant={`${id}-opt-${active}`}
          style={up === null ? undefined : { top: "auto", bottom: up }}
        >
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
