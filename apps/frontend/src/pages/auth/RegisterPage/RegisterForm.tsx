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

interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  phone: string;
  avatar: File | null;
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
        avatar: null,
      };

      const response = await registerUser(data);

      console.log("Register successful:", response);

      navigate("/verify-email", {
        state: {
          email: values.email,
        },
      });
    } catch (error) {
      console.error("Register failed:", error);
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
              className="w-full h-[40px] rounded-[10px] bg-[#605BFF] text-white text-sm font-semibold mt-1 flex items-center justify-center"
            >
              {t("createAccount")}
            </button>
          </Form>
        </Formik>
      </div>
    </div>
  );
}
