/**
 * Shared class recipes for Orbit's controls.
 *
 * These are plain Tailwind class strings (built on the tokens in
 * index.css) so existing markup can adopt them without being rewritten.
 * Hover is only ever applied to things that DO something: `card` is a
 * static container, `cardInteractive` is for cards that are clickable.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex select-none items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-all duration-200 ease-[var(--ease-orbit)] focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 hover:shadow-[0_6px_20px_rgba(37,128,79,0.3)] motion-safe:hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:hover:translate-y-0 disabled:hover:bg-brand-600 disabled:hover:shadow-none",
  secondary:
    "border border-line bg-white text-ink hover:border-brand-200 hover:bg-brand-50 active:scale-[0.98] disabled:hover:border-line disabled:hover:bg-white",
  ghost:
    "text-slate-600 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.98] disabled:hover:bg-transparent disabled:hover:text-slate-600",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] disabled:hover:bg-red-600",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3",
  md: "h-[42px] px-4",
  lg: "h-11 px-5",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${extra}`.trim();
}

/** Text input / select / textarea at the standard auth + form height. */
export const inputClass =
  "h-[42px] w-full rounded-[10px] border border-transparent bg-surface-muted px-3 text-sm text-slate-700 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-brand-200 focus:border-brand-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(45,150,94,0.12)]";

/** A static surface. No hover: it is not clickable. */
export const cardClass = "rounded-2xl border border-line bg-white shadow-card";

/** A surface that is itself a button/link: the lift tells people so. */
export const cardInteractiveClass = `${cardClass} cursor-pointer transition-all duration-200 ease-[var(--ease-orbit)] hover:border-brand-200 hover:shadow-card-hover motion-safe:hover:-translate-y-0.5`;

/** Small icon-only action (edit, delete, close...). */
export const iconActionClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-brand-500";
