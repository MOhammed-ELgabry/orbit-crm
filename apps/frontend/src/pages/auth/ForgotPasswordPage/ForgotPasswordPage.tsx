import { motion, useReducedMotion } from "framer-motion";
import ForgotPasswordForm from "./ForgotPasswordForm";
import ForgotPasswordSide from "./ForgotPasswordSide";
import { fadeSlide } from "../../../lib/motion";

export default function ForgotPasswordPage() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Left Side */}
      <motion.div
        className="w-full lg:w-1/2 min-h-screen"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("left", !!shouldReduceMotion)}
      >
        <ForgotPasswordForm />
      </motion.div>

      {/* Right Side */}
      <motion.div
        className="hidden lg:block lg:w-1/2 min-h-screen"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("right", !!shouldReduceMotion)}
      >
        <ForgotPasswordSide />
      </motion.div>
    </div>
  );
}