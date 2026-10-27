import { Formik, Form } from "formik";
import Button from "../../../Components/ui/Button";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { registerUser } from "../../../services/authService";

import RegisterHeader from "./RegisterHeader";
import RegisterFields from "./RegisterFields";
import RegisterOptions from "./RegisterOptions";

import SocialLogin from "../SocialLogin";
import AuthDivider from "../AuthDivider";
import { successAlert, errorAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";
import { trackEvent } from "../../../lib/posthog";

interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  phone: string;
  avatar: Blob | null;
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

    avatar: Yup.mixed<Blob>().nullable(),
  });

  const handleRegister = async (
    values: RegisterValues,
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      const data = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone,
        companyName: values.companyName,
      };

      const response = await registerUser(data, values.avatar);

      trackEvent("user_registered", { method: "email" });

      console.log("Register successful:", response);

      await successAlert({
        title: t("registerSuccessTitle"),
        text: t("registerSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/verify-email", {
        state: {
          email: values.email,
        },
      });
    } catch (error) {
      console.error("Register failed:", error);

      errorAlert({
        title: t("registerFailedTitle"),
        text: getErrorMessage(error, t("registerFailedMessage")),
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
        <RegisterHeader />

        {/* Google & Microsoft */}
        <SocialLogin />

        {/* Divider */}
        <AuthDivider />

        {/* Form */}
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleRegister}
        >
          {({ isSubmitting }) => (
            <Form className="flex w-full flex-col gap-3">
              {/* Fields */}
              <RegisterFields />

              {/* Terms + Sign In */}
              <RegisterOptions />

              {/* Register Button */}
              <Button
                type="submit"
                loading={isSubmitting}
                className="mt-1 w-full"
              >
                {t("createAccount")}
              </Button>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}
