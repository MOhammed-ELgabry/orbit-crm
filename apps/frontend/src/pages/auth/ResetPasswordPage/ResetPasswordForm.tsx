import { useEffect } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import logo from "../../../assets/Subtract.png";
import { FaKey } from "react-icons/fa";
import { resetPassword } from "../../../services/authService";
import { successAlert, errorAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";

interface ResetPasswordValues {
  newPassword: string;
  confirmPassword: string;
}

const inputClass =
  "h-[42px] w-full rounded-[10px] border border-transparent bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-[#605BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(96,91,255,0.08)]";

export default function ResetPasswordForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") ?? undefined;

  // This page is meaningless without a reset token — it only ever
  // arrives via the link in the reset email (a fresh page load, not
  // in-app navigation), so it's read from the URL, not route state.
  // Same defensive pattern as VerificationForm: no token, no page.
  useEffect(() => {
    if (!token) {
      navigate("/forgot-password", { replace: true });
    }
  }, [token, navigate]);

  if (!token) {
    return null;
  }

  const initialValues: ResetPasswordValues = {
    newPassword: "",
    confirmPassword: "",
  };

  const validationSchema = Yup.object({
    newPassword: Yup.string()
      .min(8, t("passwordMinReset"))
      .required(t("passwordRequired")),

    confirmPassword: Yup.string()
      .oneOf([Yup.ref("newPassword")], t("passwordsMustMatch"))
      .required(t("confirmPasswordRequired")),
  });

  const handleSubmit = async (
    values: ResetPasswordValues,
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      await resetPassword({ token, newPassword: values.newPassword });

      await successAlert({
        title: t("resetPasswordSuccessTitle"),
        text: t("resetPasswordSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/login");
    } catch (error) {
      console.error("Password reset failed:", error);

      // Covers both "token invalid/expired" and "token already used" —
      // the backend's BadRequestException message surfaces directly.
      errorAlert({
        title: t("resetPasswordFailedTitle"),
        text: getErrorMessage(error, t("resetPasswordFailedMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10 lg:py-0">
      <div className="flex w-full max-w-[420px] flex-col items-center">
        {/* Logo & Title */}
        <div className="mb-5 flex flex-col items-center">
          <img
            src={logo}
            alt="logo"
            className="h-[50px] w-[50px] object-contain sm:h-[55px] sm:w-[55px]"
          />

          <h1 className="font-nunito mt-1 text-center text-[22px] font-semibold text-[#030229] sm:text-[25px]">
            {t("resetPasswordTitle")}
          </h1>
        </div>

        {/* Key Icon */}
        <div className="mb-5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#F0EDFF] sm:h-[70px] sm:w-[70px]">
          <FaKey size={24} className="text-[#605BFF] sm:h-[28px] sm:w-[28px]" />
        </div>

        <p className="max-w-[360px] px-2 text-center text-xs leading-5 text-gray-500 sm:text-sm">
          {t("resetPasswordDescription")}
        </p>

        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ isSubmitting }) => (
            <Form className="mt-6 flex w-full flex-col gap-3">
              <div className="flex w-full flex-col gap-1">
                <label
                  htmlFor="newPassword"
                  className="text-xs font-semibold text-gray-700"
                >
                  {t("newPassword")}
                </label>

                <Field
                  id="newPassword"
                  type="password"
                  name="newPassword"
                  placeholder={t("enterNewPassword")}
                  className={inputClass}
                />

                <ErrorMessage
                  name="newPassword"
                  component="div"
                  className="text-xs text-red-500"
                />
              </div>

              <div className="flex w-full flex-col gap-1">
                <label
                  htmlFor="confirmPassword"
                  className="text-xs font-semibold text-gray-700"
                >
                  {t("confirmPassword")}
                </label>

                <Field
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  placeholder={t("enterConfirmPassword")}
                  className={inputClass}
                />

                <ErrorMessage
                  name="confirmPassword"
                  component="div"
                  className="text-xs text-red-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex h-[42px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-[#605BFF] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#514cf0] hover:shadow-[0_6px_20px_rgba(96,91,255,0.35)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {isSubmitting ? (
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  t("resetPassword")
                )}
              </button>
            </Form>
          )}
        </Formik>

        {/* Back to Login */}
        <p className="mt-5 text-xs text-gray-500">
          <Link
            to="/login"
            className="font-semibold text-[#643ED7] transition-colors duration-200 hover:text-[#514cf0] hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}