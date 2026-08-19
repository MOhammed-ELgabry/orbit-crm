import { motion, useReducedMotion } from "framer-motion";
import VerificationForm from "./VerificationForm";
import VerificationSide from "./VerificationSide";
import { fadeSlide } from "../../../lib/motion";

export default function VerifyEmail() {
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
        <VerificationForm />
      </motion.div>

      {/* Right Side */}
      <motion.div
        className="hidden lg:block lg:w-1/2 min-h-screen"
        initial="hidden"
        animate="visible"
        variants={fadeSlide("right", !!shouldReduceMotion)}
      >
        <VerificationSide />
      </motion.div>
    </div>
  );
}