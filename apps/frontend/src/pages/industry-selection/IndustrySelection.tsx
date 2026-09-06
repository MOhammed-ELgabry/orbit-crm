import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import IndustryCard from "./IndustryCard";
import { industries } from "./industryData";
import { setBusinessType, type BusinessType } from "../../services/authService";
import { successAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

export default function IndustrySelection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const onboardingToken = location.state?.onboardingToken as string | undefined;

  const [selectedIndustry, setSelectedIndustry] = useState<BusinessType | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  // Reachable only via VerificationForm or SocialLogin navigating here
  // with an onboarding token in route state (see ProtectedRoute's
  // comment on this page guarding itself) — not a URL anyone can type
  // in directly. Mirrors VerificationForm's identical guard for `email`.
  useEffect(() => {
    if (!onboardingToken) {
      navigate("/register", { replace: true });
    }
  }, [onboardingToken, navigate]);

  if (!onboardingToken) {
    return null;
  }

  const handleContinue = async () => {
    if (!selectedIndustry || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await setBusinessType({
        token: onboardingToken,
        businessType: selectedIndustry,
      });

      await successAlert({
        title: t("businessTypeSuccessTitle"),
        text: t("businessTypeSuccessMessage"),
        confirmButtonText: t("ok"),
      });

      // The onboarding token authorizes exactly this one action and
      // nothing else — it is not a session credential, so there is no
      // dashboard to land on yet. An explicit Login step is required
      // next (see ProtectedRoute's comment on this flow).
      navigate("/login", { replace: true });
    } catch (error) {
      errorAlert({
        title: t("businessTypeFailedTitle"),
        text: getErrorMessage(error, t("businessTypeFailedMessage")),
        confirmButtonText: t("ok"),
      });
    } finally {
      setIsSaving(false);
    }
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
              key={industry.value}
              onClick={() => setSelectedIndustry(industry.value)}
              className="cursor-pointer"
            >
              <div
                className={
                  selectedIndustry === industry.value
                    ? "ring-2 ring-[#605BFF] rounded-[16px]"
                    : ""
                }
              >
                <IndustryCard
                  title={industry.title}
                  description={industry.description}
                  icon={industry.icon}
                  selected={selectedIndustry === industry.value}
                  onClick={() => setSelectedIndustry(industry.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedIndustry || isSaving}
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
          {isSaving ? (
            <svg
              className="h-4 w-4 animate-spin text-white mx-auto"
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
