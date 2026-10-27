import { Formik, Form, Field, ErrorMessage } from "formik";
import Button from "../../../Components/ui/Button";
import { inputClass } from "../../../Components/ui/styles";
import * as Yup from "yup";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrbitBrand from "../../../Components/ui/OrbitBrand";
import { forgotPassword } from "../../../services/authService";
import { successAlert, errorAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";
import { LuLock } from "react-icons/lu";

interface ForgotPasswordValues {
  email: string;
}

export default function ForgotPasswordForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const initialValues: ForgotPasswordValues = { email: "" };

  const validationSchema = Yup.object({
    email: Yup.string().email(t("invalidEmail")).required(t("emailRequired")),
  });

  const handleSubmit = async (
    values: ForgotPasswordValues,
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      // Always the same generic response whether or not the account
      // exists — see AuthService.forgotPassword. Nothing here branches
      // on the result beyond "the request went through".
      await forgotPassword({ email: values.email });

      await successAlert({
        title: t("forgotPasswordSuccessTitle"),
        text: t("forgotPasswordSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/login");
    } catch (error) {
      console.error("Forgot password request failed:", error);

      errorAlert({
        title: t("forgotPasswordFailedTitle"),
        text: getErrorMessage(error, t("forgotPasswordFailedMessage")),
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
          <OrbitBrand variant="auth" />

          <h1 className="font-nunito mt-1 text-center text-[22px] font-semibold text-ink sm:text-[25px]">
            {t("forgotPasswordTitle")}
          </h1>
        </div>

        {/* Lock Icon */}
        <div className="mb-5 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand-50 sm:h-[70px] sm:w-[70px]">
          <LuLock
            size={24}
            className="text-brand-600 sm:h-[28px] sm:w-[28px]"
          />
        </div>

        <p className="max-w-[360px] px-2 text-center text-xs leading-5 text-gray-500 sm:text-sm">
          {t("forgotPasswordDescription")}
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
                  htmlFor="email"
                  className="text-xs font-semibold text-gray-700"
                >
                  {t("email")}
                </label>

                <Field
                  id="email"
                  type="email"
                  name="email"
                  placeholder={t("enterEmail")}
                  className={inputClass}
                />

                <ErrorMessage
                  name="email"
                  component="div"
                  className="text-xs text-red-500"
                />
              </div>

              <Button
                type="submit"
                loading={isSubmitting}
                className="mt-2 w-full"
              >
                {t("sendResetLink")}
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
