import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import DatePickerComponent from "./DatePicker";

import { dashboardPageTitles } from "./dashboardPageTitles";
import LanguageSwitcher from "../../shared/LanguageSwitcher";

export default function DashboardHeader() {
  const location = useLocation();
  const { t } = useTranslation();

  const titleKey = dashboardPageTitles[location.pathname] || "dashboard";

  return (
    <header
      className="
        flex w-full
        items-center justify-between
        gap-3
        border-b border-gray-100
        bg-white
        px-3 py-3
        sm:gap-4
        sm:px-4
        lg:px-5
      "
    >
      {/* Page Title */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {/* Active Indicator */}
        <div className="h-6 w-1 shrink-0 rounded-full bg-blue-600 sm:h-7" />

        {/* Title */}
        <div className="min-w-0">
          <h1
            className="
              truncate
              text-base
              font-bold
              tracking-tight
              text-gray-800
              sm:text-lg
              lg:text-[20px]
            "
          >
            {t(titleKey)}
          </h1>

          <p className="mt-0.5 hidden text-[11px] text-gray-400 sm:block">
            {t("manageDentalClinic")}
          </p>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Language */}
        <LanguageSwitcher />

        {/* Date */}
        <DatePickerComponent />
      </div>
    </header>
  );
}
