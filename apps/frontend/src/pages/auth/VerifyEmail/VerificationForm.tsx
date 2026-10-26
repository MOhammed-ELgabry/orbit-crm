import logo from "../../../assets/Subtract.png";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { resendVerification, verifyEmail } from "../../../services/authService";
import { useEffect, useState } from "react";
import OtpInput from "react-otp-input";
import { successAlert, errorAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";
import { trackEvent } from "../../../lib/posthog";
import { useAuth } from "../../../context/AuthContext";
import { LuMail } from "react-icons/lu";
import Button from "../../../Components/ui/Button";

export default function VerificationForm() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const email = location.state?.email as string | undefined;

  // This page is meaningless without an email to verify — reachable
  // state (from Register) rather than a URL param, so it doesn't survive
  // e.g. a manual refresh. Send anyone who lands here without it back to
  // Register rather than showing a blank identity and letting a verify
  // attempt fire with an undefined email.
  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  if (!email) {
    return null;
  }

  const handleVerify = async () => {
    setIsVerifying(true);

    try {
      const response = await verifyEmail({
        email,
        code,
      });

      login(response.user);
      trackEvent("email_verified");

      console.log("Email verified:", response);

      await successAlert({
        title: t("verifyEmailSuccessTitle"),
        text: t("verifyEmailSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Verification failed:", error);

      errorAlert({
        title: t("verifyEmailFailedTitle"),
        text: getErrorMessage(error, t("verifyEmailFailedMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);

    try {
      await resendVerification({ email });

      await successAlert({
        title: t("resendCodeSuccessTitle"),
        text: t("resendCodeSuccessMessage"),
        confirmButtonText: t("ok"),
      });
    } catch (error) {
      console.error("Resend verification failed:", error);

      errorAlert({
        title: t("resendCodeFailedTitle"),
        text: getErrorMessage(error, t("resendCodeFailedMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeEmail = () => {
    navigate("/register");
  };

  return (
    <div className="flex w-full items-center justify-center">
      <div className="w-full max-w-[500px] flex flex-col items-center">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-5">
          <img
            src={logo}
            alt="logo"
            className="w-[45px] h-[45px] sm:w-[50px] sm:h-[50px] md:w-[55px] md:h-[55px] object-contain"
          />

          <h1 className="font-nunito font-semibold text-[21px] sm:text-[23px] md:text-[25px] text-ink mt-1 text-center">
            {t("verifyYourEmail")}
          </h1>
        </div>

        {/* Email Icon */}
        <div className="w-[60px] h-[60px] sm:w-[65px] sm:h-[65px] md:w-[70px] md:h-[70px] rounded-full bg-brand-50 flex items-center justify-center mb-5">
          <LuMail size={28} className="text-brand-600" />
        </div>

        {/* Description */}
        <h2 className="font-nunito font-semibold text-[18px] sm:text-[19px] md:text-[20px] text-ink text-center">
          {t("checkYourEmail")}
        </h2>

        <p className="text-xs sm:text-sm text-gray-500 text-center max-w-[370px] leading-5 mt-2 px-2">
          {t("verificationDescription")}
        </p>

        <p className="text-xs sm:text-sm font-semibold text-ink mt-2 text-center break-all px-2">
          {email}
        </p>

        {/* Verification Code */}
        <div className="flex justify-center gap-2 sm:gap-3 mt-6 w-full px-2">
          <OtpInput
            value={code}
            onChange={setCode}
            numInputs={6}
            shouldAutoFocus
            inputType="tel"
            renderSeparator={<span className="w-2 sm:w-3" />}
            renderInput={(props) => (
              <input
                {...props}
                className="
                  !w-[42px]
                  !h-[48px]
                  sm:!w-[48px]
                  sm:!h-[52px]
                  rounded-[10px]
                  bg-surface-muted
                  border
                  border-transparent
                  text-center
                  text-lg
                  font-semibold
                  text-ink
                  outline-none
                  transition-all
                  duration-200
                  focus:border-brand-600
                  focus:bg-white
                  focus:shadow-[0_0_0_3px_rgba(45,150,94,0.08)]
                "
              />
            )}
          />
        </div>

        {/* Verify Button */}
        <Button
          onClick={handleVerify}
          loading={isVerifying}
          disabled={code.length !== 6}
          className="mt-6 w-full"
        >
          {t("verifyEmail")}
        </Button>

        {/* Resend Code */}
        <div className="flex flex-wrap items-center justify-center gap-1 mt-5 text-center">
          <span className="text-xs sm:text-sm text-gray-500">
            {t("didntReceiveCode")}
          </span>

          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-xs sm:text-sm font-semibold text-brand-600 cursor-pointer transition-colors duration-200 hover:text-brand-700 hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:no-underline"
          >
            {isResending ? t("resending") : t("resendCode")}
          </button>
        </div>

        {/* Change Email */}
        <button
          type="button"
          onClick={handleChangeEmail}
          className="text-sm text-gray-500 mt-4 cursor-pointer transition-colors duration-200 hover:text-brand-600"
        >
          {t("changeEmail")}
        </button>
      </div>
    </div>
  );
}
