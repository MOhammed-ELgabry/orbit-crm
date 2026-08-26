import { useLocation } from "react-router-dom";
import DatePickerComponent from "./DatePicker";

export default function DashboardHeader() {
  const location = useLocation();

  const pageTitles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/companies": "Companies",
    "/dashboard/users": "Users",
    "/dashboard/leads": "Leads",
    "/dashboard/deals": "Deals",
    "/dashboard/tasks": "Tasks",
    "/dashboard/calendar": "Calendar",
    "/dashboard/reports": "Reports",
    "/dashboard/settings": "Settings",
  };

  const title = pageTitles[location.pathname] || "Dashboard";

  return (
    <header className="w-full flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-7 rounded-full bg-blue-600" />

        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-gray-800">
            {title}
          </h1>

          <p className="text-[11px] text-gray-400 mt-0.5">
            Manage your dental clinic
          </p>
        </div>
      </div>

      {/* Date Picker */}
      <div className="flex items-center">
        <DatePickerComponent />
      </div>
    </header>
  );
}
