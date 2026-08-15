import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import logo from "../../../assets/Subtract.png";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { registerUser } from "../../../services/authService";
import { useNavigate } from "react-router-dom";

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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

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
    <div className="flex min-h-screen w-full items-center justify-center px-4 sm:px-6 lg:px-10">
      <div className="flex w-full max-w-[500px] flex-col items-center">
        {/* Logo & Title */}
        <div className="mb-2 flex flex-col items-center gap-0">
          <img
            src={avatarPreview || logo}
            alt="avatar"
            className="h-[45px] w-[45px] rounded-full object-cover"
          />

          <h1 className="font-nunito text-[21px] font-semibold text-[#030229] sm:text-[23px]">
            {t("signUp")}
          </h1>
        </div>

        {/* Google & Facebook */}
        <div className="mb-2 flex w-full justify-center gap-2 sm:gap-3">
          <div className="rounded-[10px] bg-[#F7F7F8] px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2">
              <FcGoogle size={19} />

              <span className="text-sm text-[#030229]">
                {t("google")}
              </span>
            </div>
          </div>

          <div className="rounded-[10px] bg-[#F7F7F8] px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2">
              <FaFacebook size={19} className="text-[#385C8E]" />

              <span className="text-sm text-[#030229]">
                {t("facebook")}
              </span>
            </div>
          </div>
        </div>

        {/* OR */}
        <div className="mb-2 flex w-full items-center gap-2">
          <span className="h-px flex-1 bg-[#adadb6]" />

          <span className="text-xs text-[#030229]">
            {t("or")}
          </span>

          <span className="h-px flex-1 bg-[#adadb6]" />
        </div>

        {/* Form */}
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleRegister}
        >
          <Form className="flex w-full flex-col gap-1.5">
            {/* First Name */}
            <div className="flex w-full flex-col gap-0.5">
              <label
                htmlFor="firstName"
                className="text-xs font-semibold text-gray-700"
              >
                {t("firstName")}
              </label>

              <Field
                id="firstName"
                type="text"
                name="firstName"
                placeholder={t("enterFirstName")}
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
              />

              <ErrorMessage
                name="firstName"
                component="div"
                className="text-[10px] text-red-500"
              />
            </div>

            {/* Last Name */}
            <div className="flex w-full flex-col gap-0.5">
              <label
                htmlFor="lastName"
                className="text-xs font-semibold text-gray-700"
              >
                {t("lastName")}
              </label>

              <Field
                id="lastName"
                type="text"
                name="lastName"
                placeholder={t("enterLastName")}
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
              />

              <ErrorMessage
                name="lastName"
                component="div"
                className="text-[10px] text-red-500"
              />
            </div>

            {/* Email */}
            <div className="flex w-full flex-col gap-0.5">
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
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
              />

              <ErrorMessage
                name="email"
                component="div"
                className="text-[10px] text-red-500"
              />
            </div>

            {/* Password */}
            <div className="flex w-full flex-col gap-0.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-gray-700"
              >
                {t("password")}
              </label>

              <Field
                id="password"
                type="password"
                name="password"
                placeholder={t("enterPassword")}
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
              />

              <ErrorMessage
                name="password"
                component="div"
                className="text-[10px] text-red-500"
              />
            </div>

            {/* Company Name */}
            <div className="flex w-full flex-col gap-0.5">
              <label
                htmlFor="companyName"
                className="text-xs font-semibold text-gray-700"
              >
                {t("companyName")}
              </label>

              <Field
                id="companyName"
                type="text"
                name="companyName"
                placeholder={t("enterCompanyName")}
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
              />

              <ErrorMessage
                name="companyName"
                component="div"
                className="text-[10px] text-red-500"
              />
            </div>

            {/* Avatar */}
            <div className="flex w-full flex-col gap-0.5">
              <label
                htmlFor="avatar"
                className="text-xs font-semibold text-gray-700"
              >
                {t("avatar")}{" "}
                <span className="font-normal text-gray-400">
                  ({t("optional")})
                </span>
              </label>

              <input
                id="avatar"
                name="avatar"
                type="file"
                accept="image/*"
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 py-2 text-xs text-gray-500 outline-none"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] || null;

                  if (file) {
                    setAvatarPreview(URL.createObjectURL(file));
                  }
                }}
              />
            </div>

            {/* Phone */}
            <div className="flex w-full flex-col gap-0.5">
              <label
                htmlFor="phone"
                className="text-xs font-semibold text-gray-700"
              >
                {t("phone")}{" "}
                <span className="font-normal text-gray-400">
                  ({t("optional")})
                </span>
              </label>

              <Field
                id="phone"
                type="tel"
                name="phone"
                placeholder={t("enterPhone")}
                className="h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none"
              />

              <ErrorMessage
                name="phone"
                component="div"
                className="text-[10px] text-red-500"
              />
            </div>

            {/* Terms */}
            <div className="mt-1 flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#8969e8]"
              />

              <label
                htmlFor="terms"
                className="text-[10px] leading-3.5 text-gray-500"
              >
                {t("termsText")}{" "}
                <span className="font-medium text-[#643ed7]">
                  {t("termsOfUse")}
                </span>{" "}
                {t("andOur")}{" "}
                <span className="font-medium text-[#643ed7]">
                  {t("privacyPolicy")}
                </span>
                .
              </label>
            </div>

            {/* Button */}
            <button
              type="submit"
              className="mt-1 flex h-[40px] w-full items-center justify-center rounded-[10px] bg-[#605BFF] text-sm font-semibold text-white"
            >
              {t("createAccount")}
            </button>
          </Form>
        </Formik>
      </div>
    </div>
  );
}