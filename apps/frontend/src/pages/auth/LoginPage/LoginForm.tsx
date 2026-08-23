import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { loginUser } from "../../../services/authService";
import { useAuth } from "../../../context/AuthContext";
import LoginHeader from "./LoginHeader";
import LoginOptions from "./LoginOptions";
import SocialLogin from "../SocialLogin";
import AuthDivider from "../AuthDivider";
import LoginFields from "./LoginFields";
import { errorAlert, successAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";

interface LoginValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

export default function LoginForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const initialValues: LoginValues = {
    email: "",
    password: "",
    rememberMe: false,
  };

  const validationSchema = Yup.object({
    email: Yup.string().email(t("invalidEmail")).required(t("emailRequired")),

    password: Yup.string()
      .min(6, t("passwordMin"))
      .required(t("passwordRequired")),

    rememberMe: Yup.boolean(),
  });

  const handleLogin = async (
    values: LoginValues,
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      const response = await loginUser({
        email: values.email,
        password: values.password,
      });

      login(response.user);

      await successAlert({
        title: t("loginSuccessTitle"),
        text: t("loginSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/dashboard");
    } catch (error) {
      console.error("Login failed:", error);

      errorAlert({
        title: t("loginFailedTitle"),
        text: getErrorMessage(error, t("loginFailedMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10 lg:py-0">
      <div className="flex w-full max-w-[500px] flex-col items-center">
        {/* Header */}
        <LoginHeader />

        {/* Google & Facebook */}
        <SocialLogin />

        {/* Divider */}
        <AuthDivider />

        {/* Login Form */}
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleLogin}
        >
          {({ isSubmitting }) => (
            <Form className="flex w-full flex-col gap-3">
              {/* Password  */}
              <LoginFields />

              {/* Remember Me + Forgot Password */}
              <LoginOptions />

              {/* Login Button */}
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
                  t("login")
                )}
              </button>
            </Form>
          )}
        </Formik>

        {/* Sign Up */}
        <p className="mt-5 text-xs text-gray-500">
          {t("dontHaveAccount")}{" "}
          <Link
            to="/register"
            className="font-semibold text-[#643ED7] transition-colors duration-200 hover:text-[#514cf0] hover:underline"
          >
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}