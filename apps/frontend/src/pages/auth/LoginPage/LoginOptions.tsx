import RememberMe from "./RememberMe";
import ForgotPassword from "./ForgotPassword";

export default function LoginOptions() {
  return (
    <div className="mt-1 flex w-full items-center justify-between gap-3">
      <RememberMe />
      <ForgotPassword />
    </div>
  );
}