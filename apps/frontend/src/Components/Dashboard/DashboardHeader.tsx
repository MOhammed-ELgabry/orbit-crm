import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import DatePickerComponent from "./DatePicker";
import { useAuth } from "../../context/AuthContext";
import { getBusinessTypeCopy } from "../../config/businessType";

export default function DashboardHeader() {
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

  // Contact detail pages (/dashboard/contacts/:id) fall through to the
  // Contacts label rather than a literal ID-shaped title.
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
    <header className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 sm:px-5">
      {/* Page Title */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-7 w-1 shrink-0 rounded-full bg-blue-600" />

        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-bold tracking-tight text-gray-800 sm:text-[20px]">
            {title}
          </h1>

          <p className="mt-0.5 truncate text-[11px] text-gray-400">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Date Picker */}
      <div className="flex shrink-0 items-center">
        <DatePickerComponent />
      </div>
    </header>
  );
}
