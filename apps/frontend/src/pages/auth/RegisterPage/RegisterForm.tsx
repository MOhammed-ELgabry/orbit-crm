import { Formik, Form } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { registerUser } from "../../../services/authService";

import RegisterHeader from "./RegisterHeader";
import RegisterFields from "./RegisterFields";
import RegisterOptions from "./RegisterOptions";

import SocialLogin from "../SocialLogin";
import AuthDivider from "../AuthDivider";

import { showSweetAlert } from "../../../Components/SweetAlert/SweetAlert";

import axios from "axios";

interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  phone: string;
  avatar: File | null;
  terms: boolean;
}

export default function RegisterForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const initialValues: RegisterValues = {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    companyName: "",
    phone: "",
    avatar: null,
    terms: false,
  };

  const validationSchema = Yup.object({
    firstName: Yup.string().required(t("firstNameRequired")),

    lastName: Yup.string().required(t("lastNameRequired")),

    email: Yup.string().email(t("invalidEmail")).required(t("emailRequired")),

    password: Yup.string()
      .min(6, t("passwordMin"))
      .required(t("passwordRequired")),

    companyName: Yup.string().required(t("companyNameRequired")),

    phone: Yup.string(),

    avatar: Yup.mixed<File>().nullable(),

    terms: Yup.boolean().oneOf([true], t("termsRequired")),
  });

  const handleRegister = async (values: RegisterValues) => {
    try {
      const data = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone,
        companyName: values.companyName,
        avatar: values.avatar,
      };

      const response = await registerUser(data);

      console.log("Register successful:", response);

      const result = await showSweetAlert(
        "success",
        "Welcome to Orbit CRM",
        "Your account has been created successfully.",
      );

      if (result.isConfirmed) {
        navigate("/verify-email", {
          state: {
            email: values.email,
          },
        });
      }
    } catch (error: unknown) {
      console.error("Register failed:", error);

      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message;

        showSweetAlert(
          "error",
          "Registration Failed",
          typeof message === "string"
            ? message
            : "Something went wrong. Please try again.",
        );

        return;
      }

      showSweetAlert(
        "error",
        "Registration Failed",
        "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center px-10">
      <div className="w-full max-w-[500px] flex flex-col items-center">
        {/* Header */}
        <RegisterHeader />

        {/* Google & Facebook */}
        <SocialLogin />

        {/* Divider */}
        <AuthDivider />

        {/* Form */}
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleRegister}
        >
          <Form className="w-full max-w-[500px] flex flex-col gap-1.5">
            {/* Fields */}
            <RegisterFields />

            {/* Terms + Sign In */}
            <RegisterOptions />

            {/* Register Button */}
            <button
              type="submit"
              className="mt-2 h-[42px] w-full rounded-[10px] bg-[#605BFF] text-sm font-semibold text-white transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(96,91,255,0.25)] active:translate-y-0 cursor-pointer"
            >
              {t("createAccount")}
            </button>
          </Form>
        </Formik>
      </div>
    </div>
  );
}
