/**
 * Select Component
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Native <select> to guarantee keyboard behavior and reduce bundle size.
 * Proper ARIA attributes for accessibility.
 */

import React from "react";

type Option = { label: string; value: string };

type Props = {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: Option[];
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  name?: string;
  error?: string;
};

export function Select({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  ariaLabel,
  name,
  error,
}: Props) {
  const id = React.useId();

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[color:var(--primary)]">
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>

      <select
        id={id}
        name={name}
        aria-label={ariaLabel ?? label}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full h-12 rounded-xl px-3",
          "bg-[color:var(--graphite)] text-[color:var(--primary)]",
          "border border-white/10",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]",
          "disabled:opacity-50",
        ].join(" ")}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {error ? (
        <p id={`${id}-err`} className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
