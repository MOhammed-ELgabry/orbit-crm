import { useTranslation } from "react-i18next";
import LoginForm from "./LoginForm";
import LoginSide from "./LoginSide";
import "animate.css";
export default function LoginPage() {
  const { i18n } = useTranslation();

  return (
    <div
      className="flex min-h-screen flex-col overflow-hidden bg-white lg:flex-row"
      dir={i18n.language === "ar" ? "rtl" : "ltr"}
    >
      {/* Login Side */}
      <div className="min-h-screen w-full lg:w-1/2 animate__animated animate__fadeInLeft">
        <LoginForm />
      </div>

      {/* Image Side */}
      <div className="hidden min-h-screen w-full lg:block lg:w-1/2 animate__animated animate__fadeInRight">
        <LoginSide />
      </div>
    </div>
  );
}
