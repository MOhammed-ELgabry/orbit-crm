import { useEffect } from "react";
import Button from "../../../Components/ui/Button";
import { inputClass } from "../../../Components/ui/styles";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import logo from "../../../assets/Subtract.png";
import { resetPassword } from "../../../services/authService";
import { successAlert, errorAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";
import { LuKeyRound } from "react-icons/lu";

interface ResetPasswordValues {
  newPassword: string;
  confirmPassword: string;
}

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
    <div className="flex w-full items-center justify-center">
      <div className="flex w-full max-w-[420px] flex-col items-center">
        {/* Logo & Title */}
        <div className="mb-5 flex flex-col items-center">
          <img
            src={logo}
            alt="logo"
            className="h-[50px] w-[50px] object-contain sm:h-[55px] sm:w-[55px]"
          />

          <h1 className="font-nunito mt-1 text-center text-[22px] font-semibold text-ink sm:text-[25px]">
            {t("resetPasswordTitle")}
          </h1>
        </div>

        {/* Key Icon */}
        <div className="mb-5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand-50 sm:h-[70px] sm:w-[70px]">
          <LuKeyRound
            size={24}
            className="text-brand-600 sm:h-[28px] sm:w-[28px]"
          />
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

              <Button
                type="submit"
                loading={isSubmitting}
                className="mt-2 w-full"
              >
                {t("resetPassword")}
              </Button>
            </Form>
          )}
        </Formik>

        {/* Back to Login */}
        <p className="mt-5 text-xs text-gray-500">
          <Link
            to="/login"
            className="font-semibold text-brand-600 transition-colors duration-200 hover:text-brand-700 hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
