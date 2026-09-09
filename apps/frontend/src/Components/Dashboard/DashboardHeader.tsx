import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiMenu } from "react-icons/fi";

import DatePickerComponent from "./DatePicker";
import { useAuth } from "../../context/AuthContext";
import { getBusinessTypeCopy } from "../../config/businessType";

export default function DashboardHeader({
  onOpenNavigation,
}: {
  onOpenNavigation: () => void;
}) {
  const location = useLocation();
  const { t } = useTranslation();
  const { company } = useAuth();

  const businessCopy = getBusinessTypeCopy(company?.businessType);

  const pageTitleKeys: Record<string, string> = {
    "/dashboard": "dashboardNavLabel",
    "/dashboard/contacts": businessCopy.contactsLabel,
    "/dashboard/users": "teamNavLabel",
    "/dashboard/leads": "leadsNavLabel",
    "/dashboard/deals": "dealsNavLabel",
    "/dashboard/tasks": "tasksNavLabel",
    "/dashboard/calendar": "calendarNavLabel",
    "/dashboard/reports": "reportsNavLabel",
    "/dashboard/settings": "settingsNavLabel",
  };

  const matchedKey =
    pageTitleKeys[location.pathname] ??
    (location.pathname.startsWith("/dashboard/contacts")
      ? businessCopy.contactsLabel
      : "dashboardNavLabel");

  const title = t(matchedKey);

  const subtitle =
    location.pathname === "/dashboard"
      ? t(businessCopy.dashboardTagline)
      : t("dashboardSubtitle");

  return (
    <div className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
        >
          <FiMenu size={20} />
        </button>

        <div className="hidden h-7 w-1 shrink-0 rounded-full bg-indigo-500 sm:block" />

        <div className="min-w-0">
          <h1 className="truncate font-nunito text-[18px] font-bold tracking-tight text-slate-900 sm:text-[20px]">
            {title}
          </h1>

          <p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="hidden shrink-0 items-center sm:flex">
        <DatePickerComponent />
      </div>
    </div>
  );
}