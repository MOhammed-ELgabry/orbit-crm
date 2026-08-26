import { motion, useReducedMotion } from "framer-motion";
import ResetPasswordForm from "./ResetPasswordForm";
import ResetPasswordSide from "./ResetPasswordSide";
import { fadeSlide } from "../../../lib/motion";

export default function ResetPasswordPage() {
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
        <ResetPasswordForm />
      </motion.div>

      {/* Right Side */}
      <motion.div
        className="hidden lg:block lg:w-1/2 min-h-screen"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("right", !!shouldReduceMotion)}
      >
        <ResetPasswordSide />
      </motion.div>
    </div>
  );
}