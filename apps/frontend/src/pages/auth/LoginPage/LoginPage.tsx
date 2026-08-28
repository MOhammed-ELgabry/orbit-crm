import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";

import LoginForm from "./LoginForm";
import LoginSide from "./LoginSide";

import { fadeSlide } from "../../../lib/motion";
import LanguageSwitcher from "../../../Components/shared/LanguageSwitcher";

export default function LoginPage() {
  const { i18n } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-white lg:flex-row"
      dir={i18n.language === "ar" ? "rtl" : "ltr"}
    >
      {/* Language Switcher */}
      <div className="absolute end-4 top-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Login Side */}
      <motion.div
        className="min-h-screen w-full lg:w-1/2"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("left", !!shouldReduceMotion)}
      >
        <LoginForm />
      </motion.div>

      {/* Image Side */}
      <motion.div
        className="hidden min-h-screen w-full lg:block lg:w-1/2"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("right", !!shouldReduceMotion)}
      >
        <LoginSide />
      </motion.div>
    </div>
  );
}
