/**
 * Button Component
 * Story 1.1: Landing Page & Conference Selection
 * 
 * Simple, accessible button with variants and sizes.
 * Minimum 44×44px touch target for mobile.
 */

import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
};

const sizeClasses: Record<NonNullable<Props["size"]>, string> = {
  small: "h-11 px-4 text-sm",     // 44px min touch
  medium: "h-12 px-5 text-base",
  large: "h-14 px-6 text-base",
};

const variantClasses: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-[color:var(--accent)] text-[color:var(--obsidian)] hover:opacity-90",
  secondary: "bg-[color:var(--elevated)] text-[color:var(--primary)] hover:opacity-90",
  danger: "bg-red-600 text-white hover:opacity-90",
};

export const Button = React.memo(function Button({
  variant = "primary",
  size = "large",
  className = "",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-xl",
        "min-w-[44px] min-h-[44px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--obsidian)] focus-visible:ring-[color:var(--accent)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].join(" ")}
    />
  );
});
