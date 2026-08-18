// import { Formik, Form } from "formik";
// import * as Yup from "yup";
// import { useTranslation } from "react-i18next";
// import { useNavigate } from "react-router-dom";

// import { registerUser } from "../../../services/authService";

// import RegisterHeader from "./RegisterHeader";
// import RegisterFields from "./RegisterFields";
// import RegisterOptions from "./RegisterOptions";

// import SocialLogin from "../SocialLogin";
// import AuthDivider from "../AuthDivider";

// interface RegisterValues {
//   firstName: string;
//   lastName: string;
//   email: string;
//   password: string;
//   companyName: string;
//   phone: string;
//   avatar: File | null;
// }

// export default function RegisterForm() {
//   const { t } = useTranslation();
//   const navigate = useNavigate();

//   const initialValues: RegisterValues = {
//     firstName: "",
//     lastName: "",
//     email: "",
//     password: "",
//     companyName: "",
//     phone: "",
//     avatar: null,
//   };

//   const validationSchema = Yup.object({
//     firstName: Yup.string().required(t("firstNameRequired")),

//     lastName: Yup.string().required(t("lastNameRequired")),

//     email: Yup.string().email(t("invalidEmail")).required(t("emailRequired")),

//     password: Yup.string()
//       .min(6, t("passwordMin"))
//       .required(t("passwordRequired")),

//     companyName: Yup.string().required(t("companyNameRequired")),

//     phone: Yup.string(),

//     avatar: Yup.mixed<File>().nullable(),
//   });

//   const handleRegister = async (values: RegisterValues) => {
//     try {
//       const data = {
//         firstName: values.firstName,
//         lastName: values.lastName,
//         email: values.email,
//         password: values.password,
//         phone: values.phone,
//         companyName: values.companyName,
//         avatar: null,
//       };

//       const response = await registerUser(data);

//       console.log("Register successful:", response);

//       navigate("/verify-email", {
//         state: {
//           email: values.email,
//         },
//       });
//     } catch (error) {
//       console.error("Register failed:", error);
//     }
//   };

//   return (
//     <div className="w-full h-full flex items-center justify-center px-10">
//       <div className="w-full max-w-[500px] flex flex-col items-center">
//         {/* Header */}
//         <RegisterHeader />

//         {/* Google & Facebook */}
//         <SocialLogin />

//         {/* Divider */}
//         <AuthDivider />

//         {/* Form */}
//         <Formik
//           initialValues={initialValues}
//           validationSchema={validationSchema}
//           onSubmit={handleRegister}
//         >
//           <Form className="w-full max-w-[500px] flex flex-col gap-1.5">
//             {/* Fields */}
//             <RegisterFields />

//             {/* Terms + Sign In */}
//             <RegisterOptions />

//             {/* Register Button */}
//             <button
//               type="submit"
//               className="w-full h-[40px] rounded-[10px] bg-[#605BFF] text-white text-sm font-semibold mt-1 flex items-center justify-center"
//             >
//               {t("createAccount")}
//             </button>
//           </Form>
//         </Formik>
//       </div>
//     </div>
//   );
// }


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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex w-full max-w-[500px] flex-col items-center">
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
          {({ isSubmitting }) => (
            <Form className="flex w-full flex-col gap-3">
              {/* Fields */}
              <RegisterFields />

              {/* Terms + Sign In */}
              <RegisterOptions />

              {/* Register Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 flex h-[42px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-[#605BFF] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#514cf0] hover:shadow-[0_6px_20px_rgba(96,91,255,0.35)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
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
                  t("createAccount")
                )}
              </button>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}