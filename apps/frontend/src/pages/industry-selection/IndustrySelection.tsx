import { useTranslation } from "react-i18next";
import IndustryCard from "./IndustryCard";
import { industries } from "./industryData";

export default function IndustrySelection() {
    const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full bg-[#F7F7F8] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[850px]">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-nunito font-bold text-[28px] sm:text-[32px] text-[#030229]">
           {t("welcomeToOrbit")}
          </h1>

          <h2 className="font-nunito font-semibold text-[20px] sm:text-[22px] text-[#030229] mt-2">
            {t("chooseBusinessIndustry")}
          </h2>

          <p className="text-sm text-gray-500 mt-2 max-w-[450px] mx-auto">
            {t("chooseWorkspaceDescription")}
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {industries.map((industry) => (
            <IndustryCard
              key={industry.title}
              {...industry}
            />
          ))}
        </div>

        {/* Continue */}
        <button
          type="button"
          className="
            block
            w-full
            sm:w-[300px]
            mx-auto
            h-[42px]
            mt-8
            rounded-[10px]
            bg-[#605BFF]
            text-white
            text-sm
            font-semibold
            cursor-pointer
            transition-all
            duration-200
            hover:bg-[#514cf0]
            hover:shadow-[0_6px_20px_rgba(96,91,255,0.3)]
            hover:-translate-y-[1px]
            active:scale-[0.98]
          "
        >
        {t("continue")}
        </button>

      </div>
    </div>
  );
}