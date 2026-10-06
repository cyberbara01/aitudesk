import { useId, type CSSProperties } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  /** Formats the readout; default = the number. */
  format?: (v: number) => string;
  disabled?: boolean;
  className?: string;
}

/** Range slider with label and tabular readout; accent fill up to the thumb. */
export function Slider({ value, min, max, step = 1, onChange, label, format, disabled, className }: SliderProps) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const style = { "--slider-pct": `${pct}%` } as CSSProperties;
  return (
    <div className={["slider", className ?? ""].filter(Boolean).join(" ")}>
      {(label || format) && (
        <div className="slider-head">
          {label && (
            <label className="slider-label" htmlFor={id}>
              {label}
            </label>
          )}
          <span className="slider-value">{format ? format(value) : value}</span>
        </div>
      )}
      <input
        id={id}
        className="slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
