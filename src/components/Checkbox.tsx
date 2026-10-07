import { useId } from "react";
import CHECK_MARK from "../icons/checkmark_12_filled.svg?raw";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** 20x20 checkbox with Fluent's 12 px check mark, drawn at its own size in the middle, fading in (167 ms). */
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
        <span className="checkbox-mark" dangerouslySetInnerHTML={{ __html: CHECK_MARK }} />
      </span>
      <span className="body">{label}</span>
    </label>
  );
}
