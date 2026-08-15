import logo from "../../../assets/Subtract.png";
import { FaEnvelope } from "react-icons/fa";
import { useTranslation } from "react-i18next";

export default function VerificationHeader() {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col items-center mb-5">
        <img
          src={logo}
          alt="logo"
          className="w-[50px] h-[50px] sm:w-[55px] sm:h-[55px] object-contain"
        />

        <h1 className="font-nunito font-semibold text-[22px] sm:text-[25px] text-[#030229] mt-1 text-center">
          {t("verifyYourEmail")}
        </h1>
      </div>

      <div className="w-[60px] h-[60px] sm:w-[70px] sm:h-[70px] rounded-full bg-[#F0EDFF] flex items-center justify-center mb-5">
        <FaEnvelope
          size={24}
          className="text-[#605BFF] sm:w-[28px] sm:h-[28px]"
        />
      </div>
    </>
  );
}