import VerificationForm from "./VerificationForm";
import VerificationSide from "./VerificationSide";

export default function VerifyEmail() {
  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Left Side */}
      <div className="w-1/2 min-h-screen">
        <VerificationForm />
      </div>

      {/* Right Side */}
      <div className="w-1/2 min-h-screen">
        <VerificationSide />
      </div>
    </div>
  );
}
