import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { loginUser } from "../../../services/authService";
import LoginHeader from "./LoginHeader";
import LoginOptions from "./LoginOptions";
import SocialLogin from "../SocialLogin";
import AuthDivider from "../AuthDivider";
import LoginFields from "./LoginFields";
import axios from "axios";
import { showSweetAlert } from "../../../Components/SweetAlert/SweetAlert";
interface LoginValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

export default function LoginForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

      console.log("Login successful:", response);

      const result = await showSweetAlert(
        "success",
        "Welcome Back!",
        "You have logged in successfully.",
      );

      if (result.isConfirmed) {
        navigate("/industry-selection");
      }
    } catch (error: unknown) {
      console.error("Login failed:", error);

      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message;

        showSweetAlert(
          "error",
          "Login Failed",
          typeof message === "string"
            ? message
            : "Invalid email or password. Please try again.",
        );

        return;
      }

      showSweetAlert(
        "error",
        "Login Failed",
        "Something went wrong. Please try again.",
      );
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
              className="mt-2 h-[42px] w-full rounded-[10px] bg-[#605BFF] text-sm font-semibold text-white transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(96,91,255,0.25)] active:translate-y-0 cursor-pointer"
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
