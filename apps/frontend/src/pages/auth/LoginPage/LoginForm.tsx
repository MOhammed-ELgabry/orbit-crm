import { Formik, Form } from "formik";
import Button from "../../../Components/ui/Button";
import * as Yup from "yup";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { loginUser } from "../../../services/authService";
import { useAuth } from "../../../context/AuthContext";
import { trackEvent } from "../../../lib/posthog";
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
      trackEvent("login", { method: "email" });

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
    <div className="flex w-full items-center justify-center">
      <div className="flex w-full max-w-[500px] flex-col items-center">
        {/* Header */}
        <LoginHeader />

        {/* Google & Microsoft */}
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
              <Button
                type="submit"
                loading={isSubmitting}
                className="mt-2 w-full"
              >
                {t("login")}
              </Button>
            </Form>
          )}
        </Formik>

        {/* Sign Up */}
        <p className="mt-5 text-xs text-gray-500">
          {t("dontHaveAccount")}{" "}
          <Link
            to="/register"
            className="font-semibold text-brand-600 transition-colors duration-200 hover:text-brand-700 hover:underline"
          >
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
