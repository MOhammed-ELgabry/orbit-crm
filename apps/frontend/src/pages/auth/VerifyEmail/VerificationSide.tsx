import { useTranslation } from "react-i18next";
import { FaEnvelope } from "react-icons/fa";

export default function VerificationSide() {
    const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-[#F7F7F8] flex items-center justify-center">
      <div className="flex flex-col items-center text-center px-8">
        {/* Email Icon */}
        <div className="w-[100px] h-[100px] rounded-full bg-[#EDE9FE] flex items-center justify-center">
          <FaEnvelope size={42} className="text-[#605BFF]" />
        </div>

        {/* Title */}
        <h2 className="font-nunito font-semibold text-[25px] text-[#030229] mt-6">
          {t("almostThere")}
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-500 max-w-[300px] mt-2 leading-5">
          {t("completeAccountSetup")}
        </p>
      </div>
    </div>
  );
}
