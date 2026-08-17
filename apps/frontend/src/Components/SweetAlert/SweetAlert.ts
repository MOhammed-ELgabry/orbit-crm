import Swal from "sweetalert2";

export const showSweetAlert = (
  icon: "success" | "error",
  title: string,
  text: string,
) => {
  return Swal.fire({
    icon,
    title,
    text,

    confirmButtonText: icon === "success" ? "Continue" : "Try Again",

    buttonsStyling: false,

    customClass: {
      popup: "alert-popup",
      icon: "alert-icon",
      title: "alert-title",
      htmlContainer: "alert-text",
      confirmButton: "alert-btn",
    },

    showClass: {
      popup: "alert-show",
    },

    hideClass: {
      popup: "alert-hide",
    },
  });
};
