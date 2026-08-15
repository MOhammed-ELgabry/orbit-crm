import logo from "../../../assets/Subtract.png";
import { FaEnvelope } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { verifyEmail } from "../../../services/authService";
import { useState } from "react";

export default function VerificationForm() {
  const location = useLocation();
  const navigate = useNavigate();

  const [code, setCode] = useState(["", "", "", "", "", ""]);

  const email = location.state?.email;

  const handleVerify = async () => {
    try {
      const response = await verifyEmail({
        email,
        code: code.join(""),
      });

      console.log("Email verified:", response);

      navigate("/login");
    } catch (error) {
      console.error("Verification failed:", error);
    }
  };

  const { t } = useTranslation();

  return (
    <div className="w-full h-full flex items-center justify-center px-10">
      <div className="w-full max-w-[500px] flex flex-col items-center">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-5">
          <img
            src={logo}
            alt="logo"
            className="w-[55px] h-[55px] object-contain"
          />

          <h1 className="font-nunito font-semibold text-[25px] text-[#030229] mt-1">
            {t("verifyYourEmail")}
          </h1>
        </div>

        {/* Email Icon */}
        <div className="w-[70px] h-[70px] rounded-full bg-[#F0EDFF] flex items-center justify-center mb-5">
          <FaEnvelope size={28} className="text-[#605BFF]" />
        </div>

        {/* Description */}
        <h2 className="font-nunito font-semibold text-[20px] text-[#030229]">
          {t("checkYourEmail")}
        </h2>

        <p className="text-sm text-gray-500 text-center max-w-[370px] leading-5 mt-2">
          {t("verificationDescription")}
        </p>

        <p className="text-sm font-semibold text-[#030229] mt-2">{email}</p>

        {/* Verification Code */}
        <div className="flex gap-3 mt-6">
          {code.map((digit, index) => (
            <input
              key={index}
              type="text"
              maxLength={1}
              value={digit}
              onChange={(e) => {
                const value = e.target.value;

                if (!/^\d?$/.test(value)) return;

                const newCode = [...code];
                newCode[index] = value;

                setCode(newCode);
              }}
              className="w-[48px] h-[52px] rounded-[10px] bg-[#F7F7F8] text-center text-lg font-semibold text-[#030229] outline-none"
            />
          ))}
        </div>

        {/* Verify Button */}
        <button
          type="button"
          onClick={handleVerify}
          className="w-full h-[40px] rounded-[10px] bg-[#605BFF] text-white text-sm font-semibold mt-6"
        >
          Verify Email
        </button>

        {/* Resend Code */}
        <div className="flex items-center gap-1 mt-5">
          <span className="text-sm text-gray-500">{t("didntReceiveCode")}</span>

          <button
            type="button"
            className="text-sm font-semibold text-[#643ED7]"
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
