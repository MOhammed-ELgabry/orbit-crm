import logo from "../../../assets/Subtract.png";
import { FaEnvelope } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { verifyEmail } from "../../../services/authService";
import { useState } from "react";
import OtpInput from "react-otp-input";

export default function VerificationForm() {
  const location = useLocation();
  const navigate = useNavigate();

  const [code, setCode] = useState("");

  const email = location.state?.email;

  const handleVerify = async () => {
    try {
      const response = await verifyEmail({
        email,
        code,
      });

      console.log("Email verified:", response);

      navigate("/login");
    } catch (error) {
      console.error("Verification failed:", error);
    }
  };

  const { t } = useTranslation();

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
          className="     w-full
    h-[40px]
    sm:h-[42px]
    rounded-[10px]
    bg-[#605BFF]
    text-white
    text-sm
    font-semibold
    mt-6
    cursor-pointer
    transition-all
    duration-200
    hover:bg-[#514cf0]
    hover:shadow-[0_6px_20px_rgba(96,91,255,0.35)]
    hover:-translate-y-[1px]
    active:translate-y-0
    active:scale-[0.98]"
        >
          Verify Email
        </button>

        {/* Resend Code */}
        <div className="flex flex-wrap items-center justify-center gap-1 mt-5 text-center">
          <span className="text-xs sm:text-sm text-gray-500">
            {t("didntReceiveCode")}
          </span>

          <button
            type="button"
            className="text-xs sm:text-sm font-semibold text-[#643ED7]"
          >
            {t("resendCode")}
          </button>
        </div>

        {/* Change Email */}
        <button
          type="button"
          className="text-sm text-gray-500 mt-4 hover:text-[#643ED7] transition"
        >
          {t("changeEmail")}
        </button>
      </div>
    </div>
  );
}
