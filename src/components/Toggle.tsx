import type { ReactNode } from "react";

interface Props {
  checked: boolean;
  disabled?: boolean;
  label: ReactNode;
  description?: ReactNode;
  compact?: boolean;
  plain?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ checked, disabled, label, description, compact, plain, onChange }: Props) {
  return <label className={`toggle-row${compact ? " compact-toggle" : ""}${plain ? " plain-toggle" : ""}${disabled ? " disabled" : ""}`}>
    <span className={compact ? "sr-only" : "toggle-copy"}><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input type="checkbox" aria-label={typeof label === "string" ? label : undefined} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span className="toggle-track" aria-hidden="true"><span /></span>
  </label>;
}
