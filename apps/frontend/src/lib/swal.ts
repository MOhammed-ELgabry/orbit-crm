import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.css";

/**
 * Centralized SweetAlert2 instance for Orbit CRM.
 *
 * Every operation-level dialog (auth success/failure, OAuth errors,
 * etc.) should go through these helpers instead of calling
 * `Swal.fire` directly, so every popup in the app shares the same
 * Orbit look — see the `.orbit-swal-*` rules in `src/index.css` for
 * the actual theming, which reuses the app's existing brand colors,
 * radii, and font.
 *
 * Field-level validation stays inline (Formik/Yup) — this is only
 * for operation-level feedback (see PART 14 of the design brief).
 */
const orbitSwal = Swal.mixin({
  buttonsStyling: false,
  customClass: {
    popup: "orbit-swal-popup",
    title: "orbit-swal-title",
    htmlContainer: "orbit-swal-text",
    confirmButton: "orbit-swal-confirm",
    cancelButton: "orbit-swal-cancel",
    actions: "orbit-swal-actions",
  },
});

interface AlertOptions {
  title: string;
  text?: string;
  confirmButtonText?: string;
}

export function successAlert({
  title,
  text,
  confirmButtonText,
}: AlertOptions) {
  return orbitSwal.fire({
    icon: "success",
    title,
    text,
    confirmButtonText: confirmButtonText ?? "OK",
  });
}

export function errorAlert({ title, text, confirmButtonText }: AlertOptions) {
  return orbitSwal.fire({
    icon: "error",
    title,
    text,
    confirmButtonText: confirmButtonText ?? "OK",
  });
}

export function warningAlert({
  title,
  text,
  confirmButtonText,
}: AlertOptions) {
  return orbitSwal.fire({
    icon: "warning",
    title,
    text,
    confirmButtonText: confirmButtonText ?? "OK",
  });
}

/**
 * Only use this for operations with no other in-UI loading
 * indicator to anchor to (e.g. a full-page async step). Most of the
 * app already shows loading state on the triggering button itself,
 * which is preferable to a blocking dialog.
 */
interface ConfirmAlertOptions extends AlertOptions {
  cancelButtonText?: string;
}

/** Resolves true only if the user actually clicked confirm (not the backdrop/escape). */
export async function confirmAlert({
  title,
  text,
  confirmButtonText,
  cancelButtonText,
}: ConfirmAlertOptions): Promise<boolean> {
  const result = await orbitSwal.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmButtonText ?? "OK",
    cancelButtonText: cancelButtonText ?? "Cancel",
  });

  return result.isConfirmed;
}

export function loadingAlert(title: string) {
  return orbitSwal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

export function closeAlert() {
  Swal.close();
}