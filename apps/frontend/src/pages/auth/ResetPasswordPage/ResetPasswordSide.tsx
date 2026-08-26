import { useTranslation } from "react-i18next";
import { FaKey } from "react-icons/fa";

export default function ResetPasswordSide() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-[#F7F7F8] md:min-h-full">
      <div className="flex flex-col items-center px-5 text-center sm:px-8 md:px-10">
        <div className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-[#EDE9FE] sm:h-[85px] sm:w-[85px] md:h-[100px] md:w-[100px]">
          <FaKey className="text-[30px] text-[#605BFF] sm:text-[36px] md:text-[42px]" />
        </div>

        <h2 className="font-nunito mt-4 text-center text-[20px] font-semibold text-[#030229] sm:mt-5 sm:text-[23px] md:mt-6 md:text-[25px]">
          {t("createNewPassword")}
        </h2>

        <p className="mt-2 max-w-[260px] text-center text-xs leading-5 text-gray-500 sm:max-w-[300px] sm:text-sm">
          {t("resetPasswordSideDescription")}
        </p>
      </div>
    </div>
  );
}