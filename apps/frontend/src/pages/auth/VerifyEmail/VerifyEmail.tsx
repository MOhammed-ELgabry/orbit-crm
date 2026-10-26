import AuthShell from "../AuthShell";
import VerificationForm from "./VerificationForm";

export default function VerifyEmail() {
  return (
    <AuthShell width="sm">
      <VerificationForm />
    </AuthShell>
  );
}
