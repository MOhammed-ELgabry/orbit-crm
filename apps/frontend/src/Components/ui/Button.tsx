import type { ButtonHTMLAttributes } from "react";

import Spinner from "./Spinner";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./styles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the spinner in place of the label and disables the button. */
  loading?: boolean;
}

/**
 * Orbit's standard button. `type` defaults to "button" so it can never
 * submit a form by accident; pass type="submit" explicitly.
 */
export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}
