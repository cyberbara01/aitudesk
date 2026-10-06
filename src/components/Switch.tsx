import { useId } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name when the visible label is rendered elsewhere (e.g. by Row). */
  ariaLabel?: string;
}

/** On/off toggle. Looks like a Fluent ToggleSwitch, a macOS switch or a square rice toggle depending on the style. */
export function Switch({ checked, onChange, label, hint, disabled, className, ariaLabel }: SwitchProps) {
  const id = useId();
  const cls = ["switch", disabled ? "disabled" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <label className={cls} htmlFor={id}>
      <input
        id={id}
        className="switch-input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      {(label || hint) && (
        <span className="switch-text">
          {label && <span className="body">{label}</span>}
          {hint && <span className="switch-hint">{hint}</span>}
        </span>
      )}
    </label>
  );
}
