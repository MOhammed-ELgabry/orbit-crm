import { useTranslation } from "react-i18next";
import { FaEnvelope } from "react-icons/fa";

export default function VerificationSide() {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full min-h-[300px] md:min-h-full bg-[#F7F7F8] flex items-center justify-center">
      <div className="flex flex-col items-center text-center px-5 sm:px-8 md:px-10">
        {/* Email Icon */}
        <div
          className=" w-[70px]
            h-[70px]
            sm:w-[85px]
            sm:h-[85px]
            md:w-[100px]
            md:h-[100px]
            rounded-full
            bg-[#EDE9FE]
            flex
            items-center
            justify-center"
        >
          <FaEnvelope
            size={42}
            className=" text-[#605BFF]
              text-[30px]
              sm:text-[36px]
              md:text-[42px]"
          />
        </div>

        {/* Title */}
        <h2
          className=" font-nunito
            font-semibold
            text-[20px]
            sm:text-[23px]
            md:text-[25px]
            text-[#030229]
            mt-4
            sm:mt-5
            md:mt-6
            text-center"
        >
          {t("almostThere")}
        </h2>

        {/* Description */}
        <p
          className=" text-xs
            sm:text-sm
            text-gray-500
            max-w-[260px]
            sm:max-w-[300px]
            mt-2
            leading-5
            text-center"
        >
          {t("completeAccountSetup")}
        </p>
      </div>
    </div>
  );
}
