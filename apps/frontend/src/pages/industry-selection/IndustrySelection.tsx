import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import IndustryCard from "./IndustryCard";
import { industries } from "./industryData";
import { setBusinessType, type BusinessType } from "../../services/authService";
import { successAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import logo from "../../assets/Subtract.png";

export default function IndustrySelection() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const onboardingToken = location.state?.onboardingToken as
    | string
    | undefined;

  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deliberately not a ProtectedRoute (session-based) — a normal-flow user
  // has no session yet at this point by design (see OnboardingToken's doc
  // comment on the backend). This page guards itself instead: no ticket,
  // no reason to be here. Also covers the new-vs-existing social path,
  // since only a brand-new social user is ever navigated in with one.
  useEffect(() => {
    if (!onboardingToken) {
      navigate("/login", { replace: true });
    }
  }, [onboardingToken, navigate]);

  if (!onboardingToken) {
    return null;
  }

  const handleContinue = async () => {
    if (!selected) {
      return;
    }

    setIsSubmitting(true);

    try {
      await setBusinessType({ token: onboardingToken, businessType: selected });

      await successAlert({
        title: t("businessTypeSuccessTitle"),
        text: t("businessTypeSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      navigate("/login");
    } catch (error) {
      console.error("Business type selection failed:", error);

      errorAlert({
        title: t("businessTypeFailedTitle"),
        text: getErrorMessage(error, t("businessTypeFailedMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-10 py-10">
      <div className="w-full max-w-[760px] flex flex-col items-center">
        <div className="flex flex-col items-center mb-8">
          <img
            src={logo}
            alt="logo"
            className="w-[50px] h-[50px] object-contain"
          />

          <p className="text-sm font-semibold text-[#605BFF] mt-2">
            {t("welcomeToOrbit")}
          </p>

          <h1 className="font-nunito font-semibold text-[23px] sm:text-[25px] text-[#030229] mt-1 text-center">
            {t("chooseBusinessIndustry")}
          </h1>

          <p className="text-sm text-gray-500 text-center mt-2 max-w-[440px]">
            {t("chooseWorkspaceDescription")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          {industries.map((industry) => (
            <IndustryCard
              key={industry.value}
              title={t(industry.title)}
              description={t(industry.description)}
              icon={industry.icon}
              selected={selected === industry.value}
              onClick={() => setSelected(industry.value)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected || isSubmitting}
          className="w-full
            max-w-[300px]
            h-[40px]
            sm:h-[42px]
            rounded-[10px]
            bg-[#605BFF]
            text-white
            text-sm
            font-semibold
            mt-8
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
          {isSubmitting ? (
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
            t("continue")
          )}
        </button>
      </div>
    </div>
  );
}