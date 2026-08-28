import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";

import RegisterForm from "./RegisterForm";
import RegisterSide from "./RegisterSide";

import { fadeSlide } from "../../../lib/motion";
import LanguageSwitcher from "../../../Components/shared/LanguageSwitcher";

export default function RegisterPage() {
  const { i18n } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      dir={i18n.language === "ar" ? "rtl" : "ltr"}
      className="relative flex min-h-screen flex-col overflow-hidden bg-white lg:flex-row"
    >
      {/* Language Switcher */}
      <div className="absolute end-4 top-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Register Form */}
      <motion.div
        className="min-h-screen w-full lg:w-1/2"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("left", !!shouldReduceMotion)}
      >
        <RegisterForm />
      </motion.div>

      {/* Register Side */}
      <motion.div
        className="min-h-screen w-full lg:w-1/2"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("right", !!shouldReduceMotion)}
      >
        <RegisterSide />
      </motion.div>
    </div>
  );
}
