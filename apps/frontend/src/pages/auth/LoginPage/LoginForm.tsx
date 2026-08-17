import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { loginUser } from "../../../services/authService";
import { useAuth } from "../../../context/AuthContext";
import { decodeJwtPayload } from "../../../services/jwt";
import LoginHeader from "./LoginHeader";
import LoginOptions from "./LoginOptions";
import SocialLogin from "../SocialLogin";
import AuthDivider from "../AuthDivider";
import LoginFields from "./LoginFields";

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

  const handleLogin = async (values: LoginValues) => {
    try {
      const response = await loginUser({
        email: values.email,
        password: values.password,
      });

      const claims = decodeJwtPayload<{
        sub: string;
        email: string;
        isOwner: boolean;
      }>(response.accessToken);

      login(response.accessToken, response.refreshToken, {
        id: claims?.sub ?? "",
        email: claims?.email ?? values.email,
        isOwner: claims?.isOwner ?? false,
      });

      navigate("/industry-selection");
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-4 sm:px-6 lg:px-10">
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
          <Form className="flex w-full flex-col gap-3">
            {/* Password  */}
            <LoginFields />

            {/* Remember Me + Forgot Password */}
            <LoginOptions />

            {/* Login Button */}
            <button
              type="submit"
              className="mt-2 h-[42px] w-full rounded-[10px] bg-[#605BFF] text-sm font-semibold text-white"
            >
              {t("login")}
            </button>
          </Form>
        </Formik>

        {/* Sign Up */}
        <p className="mt-5 text-xs text-gray-500">
          {t("dontHaveAccount")}{" "}
          <Link to="/register" className="font-semibold text-[#643ED7]">
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}