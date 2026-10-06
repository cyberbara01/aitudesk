import { useId } from "react";
import { Icon } from "./Icon";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** 20x20 checkbox with a 12 px check mark that fades in (167 ms). */
export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  const id = useId();
  const cls = ["checkbox", disabled ? "disabled" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <label className={cls} htmlFor={id}>
      <input
        id={id}
        className="checkbox-input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="checkbox-box" aria-hidden="true">
        <span className="checkbox-mark">
          <Icon name="checkmark" variant="filled" size={16} className="icon-16" />
        </span>
      </span>
      <span className="body">{label}</span>
    </label>
  );
}
