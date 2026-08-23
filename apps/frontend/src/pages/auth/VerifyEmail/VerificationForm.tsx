import logo from "../../../assets/Subtract.png";
import { FaEnvelope } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { resendVerification, verifyEmail } from "../../../services/authService";
import { useEffect, useState } from "react";
import OtpInput from "react-otp-input";
import { successAlert, errorAlert } from "../../../lib/swal";
import { getErrorMessage } from "../../../lib/errors";

export default function VerificationForm() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

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

      console.log("Email verified:", response);

      await successAlert({
        title: t("verifyEmailSuccessTitle"),
        text: t("verifyEmailSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/industry-selection", {
        state: { email, onboardingToken: response.onboardingToken },
      });
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
    <div className="w-full min-h-screen flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 py-8">
      <div className="w-full max-w-[500px] flex flex-col items-center">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-5">
          <img
            src={logo}
            alt="logo"
            className="w-[45px] h-[45px] sm:w-[50px] sm:h-[50px] md:w-[55px] md:h-[55px] object-contain"
          />

          <h1 className="font-nunito font-semibold text-[21px] sm:text-[23px] md:text-[25px] text-[#030229] mt-1 text-center">
            {t("verifyYourEmail")}
          </h1>
        </div>

        {/* Email Icon */}
        <div className="w-[60px] h-[60px] sm:w-[65px] sm:h-[65px] md:w-[70px] md:h-[70px] rounded-full bg-[#F0EDFF] flex items-center justify-center mb-5">
          <FaEnvelope size={28} className="text-[#605BFF]" />
        </div>

        {/* Description */}
        <h2 className="font-nunito font-semibold text-[18px] sm:text-[19px] md:text-[20px] text-[#030229] text-center">
          {t("checkYourEmail")}
        </h2>

        <p className="text-xs sm:text-sm text-gray-500 text-center max-w-[370px] leading-5 mt-2 px-2">
          {t("verificationDescription")}
        </p>

        <p className="text-xs sm:text-sm font-semibold text-[#030229] mt-2 text-center break-all px-2">
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
                  bg-[#F7F7F8]
                  border
                  border-transparent
                  text-center
                  text-lg
                  font-semibold
                  text-[#030229]
                  outline-none
                  transition-all
                  duration-200
                  focus:border-[#605BFF]
                  focus:bg-white
                  focus:shadow-[0_0_0_3px_rgba(96,91,255,0.08)]
                "
              />
            )}
          />
        </div>

        {/* Verify Button */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying || code.length !== 6}
          className="w-full
    h-[40px]
    sm:h-[42px]
    rounded-[10px]
    bg-[#605BFF]
    text-white
    text-sm
    font-semibold
    mt-6
    flex
    items-center
    justify-center
    cursor-pointer
    transition-all
    duration-200
    hover:bg-[#514cf0]
    hover:shadow-[0_6px_20px_rgba(96,91,255,0.35)]
    hover:-translate-y-[1px]
    active:translate-y-0
    active:scale-[0.98]
    disabled:opacity-60
    disabled:cursor-not-allowed
    disabled:hover:translate-y-0
    disabled:hover:shadow-none"
        >
          {isVerifying ? (
            <svg
              className="h-4 w-4 animate-spin text-white"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            t("verifyEmail")
          )}
        </button>

        {/* Resend Code */}
        <div className="flex flex-wrap items-center justify-center gap-1 mt-5 text-center">
          <span className="text-xs sm:text-sm text-gray-500">
            {t("didntReceiveCode")}
          </span>

          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-xs sm:text-sm font-semibold text-[#643ED7] cursor-pointer transition-colors duration-200 hover:text-[#514cf0] hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:no-underline"
          >
            {isResending ? t("resending") : t("resendCode")}
          </button>
        </div>

        {/* Change Email */}
        <button
          type="button"
          onClick={handleChangeEmail}
          className="text-sm text-gray-500 mt-4 cursor-pointer transition-colors duration-200 hover:text-[#643ED7]"
        >
          {t("changeEmail")}
        </button>
      </div>
    </div>
  );
}