import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "sm";
  /** Stretch to the container width. */
  fill?: boolean;
  role?: "tablist" | "radiogroup";
  ariaLabel?: string;
  className?: string;
}

/** Segmented control with a sliding indicator (167 ms, move curve). The look per design language is in base.css. */
export function Segmented<T extends string>({ options, value, onChange, size = "md", fill, role = "radiogroup", ariaLabel, className }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  // Re-measure when the options themselves change, not only their number (the schedule tile's day row can
  // swap one day for another and keep its length).
  const optionsKey = options.map((o) => `${o.value}:${o.label}`).join("|");

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      if (!el) return;
      setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, optionsKey, size]);

  const cls = ["segmented", size === "sm" ? "sm" : "", fill ? "fill" : "", className ?? ""].filter(Boolean).join(" ");
  const style = ind ? ({ "--seg-x": `${ind.x}px`, "--seg-w": `${ind.w}px` } as CSSProperties) : undefined;

  return (
    <div ref={ref} className={cls} role={role} aria-label={ariaLabel} style={style}>
      {ind && <span className="seg-indicator" aria-hidden="true" />}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            data-value={o.value}
            role={role === "tablist" ? "tab" : "radio"}
            aria-selected={role === "tablist" ? selected : undefined}
            aria-checked={role === "radiogroup" ? selected : undefined}
            className={selected ? "seg-item selected" : "seg-item"}
            onClick={() => {
              if (!selected) onChange(o.value);
            }}
          >
            {o.icon && <Icon name={o.icon} variant={selected ? "filled" : "regular"} size={16} />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
