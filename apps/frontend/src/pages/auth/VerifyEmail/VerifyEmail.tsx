import VerificationForm from "./VerificationForm";
import VerificationSide from "./VerificationSide";

export default function VerifyEmail() {
  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Left Side */}
      <div className="w-full lg:w-1/2 min-h-screen animate__animated animate__fadeInLeft">
        <VerificationForm />
      </div>

      {/* Right Side */}
      <div className="hidden lg:block lg:w-1/2 min-h-screen animate__animated animate__fadeInRight">
        <VerificationSide />
      </div>
    </div>
  );
}
