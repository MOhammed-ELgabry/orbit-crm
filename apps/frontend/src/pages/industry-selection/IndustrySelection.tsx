import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import IndustryCard from "./IndustryCard";
import { industries } from "./industryData";

export default function IndustrySelection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);

  const handleContinue = () => {
    if (selectedIndustry !== "dentalClinic") return;

    navigate("/dashboard");
  };

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {industries.map((industry) => (
            <div
              key={industry.title}
              onClick={() => setSelectedIndustry(industry.title)}
              className="cursor-pointer"
            >
              <div
                className={
                  selectedIndustry === industry.title
                    ? "ring-2 ring-[#605BFF] rounded-[16px]"
                    : ""
                }
              >
                <IndustryCard
                  key={industry.title}
                  {...industry}
                  selected={selectedIndustry === industry.title}
                  onClick={() => setSelectedIndustry(industry.title)}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={selectedIndustry !== "dentalClinic"}
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
            disabled:opacity-50
            disabled:cursor-not-allowed
            disabled:hover:shadow-none
            disabled:hover:translate-y-0
          "
        >
          {t("continue")}
        </button>
      </div>
    </div>
  );
}
