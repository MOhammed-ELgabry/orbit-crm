import RegisterForm from "./RegisterForm";
import RegisterSide from "./RegisterSide";
import { useTranslation } from "react-i18next";

export default function RegisterPage() {
  const { i18n } = useTranslation();

  return (
    <div
      dir={i18n.language === "ar" ? "rtl" : "ltr"}
      className="min-h-screen flex flex-col lg:flex-row bg-white"
    >
      {/* Register Form */}
      <div className="w-full lg:w-1/2 min-h-screen">
        <RegisterForm />
      </div>

      {/* Register Side */}
      <div className="w-full lg:w-1/2 min-h-screen">
        <RegisterSide />
      </div>
    </div>
  );
}