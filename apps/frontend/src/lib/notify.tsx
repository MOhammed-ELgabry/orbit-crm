import type { ReactElement } from "react";
import toast from "react-hot-toast";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";

/**
 * Orbit's one entry point for Dashboard feedback toasts (react-hot-toast).
 *
 * Scope:
 * - Dashboard only. The <Toaster> is mounted by DashboardLayout, so a toast
 *   fired while the sign-in pages are on screen has nowhere to render. Auth
 *   flows (login, register, verify, reset, forgot, OAuth) keep SweetAlert2.
 * - Operation results only (saved, failed, ...). Destructive confirmations
 *   stay on SweetAlert2's `confirmAlert`, which waits for a decision.
 *
 * The call shape mirrors the SweetAlert2 helpers in `lib/swal.ts`
 * (`{ title, text }`) so a call site changes by its function name only.
 *
 * Duplicates: the toast id is derived from the kind + message, so the same
 * message fired again while it is still on screen refreshes that toast
 * instead of stacking a second copy.
 */
export interface NotifyOptions {
  title: string;
  text?: string;
}

type Kind = "success" | "error" | "warning" | "info";

const DURATION: Record<Kind, number> = {
  success: 3000,
  info: 3500,
  warning: 4500,
  error: 5000,
};

function body({ title, text }: NotifyOptions): ReactElement {
  // Callers often pass the same fallback string as both title and text.
  const detail = text && text !== title ? text : null;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-semibold">{title}</span>
      {detail && (
        <span className="text-xs font-normal opacity-80">{detail}</span>
      )}
    </span>
  );
}

function show(kind: Kind, options: NotifyOptions): string {
  const id = `${kind}:${options.title}:${options.text ?? ""}`;
  const message = body(options);
  const common = {
    id,
    duration: DURATION[kind],
    // Errors interrupt screen readers; everything else waits its turn.
    ariaProps: {
      role: kind === "error" ? ("alert" as const) : ("status" as const),
      "aria-live":
        kind === "error" ? ("assertive" as const) : ("polite" as const),
    },
  };

  if (kind === "success") {
    return toast.success(message, common);
  }

  if (kind === "error") {
    return toast.error(message, common);
  }

  return toast(message, {
    ...common,
    icon:
      kind === "warning" ? (
        <LuTriangleAlert size={20} className="text-amber-500" aria-hidden />
      ) : (
        <LuInfo size={20} className="text-sky-600" aria-hidden />
      ),
  });
}

export const notifySuccess = (options: NotifyOptions) =>
  show("success", options);
export const notifyError = (options: NotifyOptions) => show("error", options);
export const notifyWarning = (options: NotifyOptions) =>
  show("warning", options);
export const notifyInfo = (options: NotifyOptions) => show("info", options);
