import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import Logo from "./Logo";
import { useAuth } from "../../context/AuthContext";
import { confirmAlert } from "../../lib/swal";
import type { HelperId } from "../../lib/helperRegistry";
import Hint from "../ui/Hint";
import {
  LuBookUser,
  LuCalendarDays,
  LuChartColumn,
  LuHandshake,
  LuHouse,
  LuListChecks,
  LuLogOut,
  LuMenu,
  LuSettings,
  LuShield,
  LuTarget,
  LuUsers,
} from "react-icons/lu";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const menuItems: {
    name: string;
    path: string;
    icon: typeof LuHouse;
    helper: HelperId;
  }[] = [
    {
      name: t("dashboardNavLabel"),
      path: "/dashboard",
      icon: LuHouse,
      helper: "navDashboard",
    },
    {
      name: t("contacts"),
      path: "/dashboard/contacts",
      icon: LuBookUser,
      helper: "navContacts",
    },
    {
      name: t("teamNavLabel"),
      path: "/dashboard/users",
      icon: LuUsers,
      helper: "navTeam",
    },
    {
      name: t("leadsNavLabel"),
      path: "/dashboard/leads",
      icon: LuTarget,
      helper: "navLeads",
    },
    {
      name: t("dealsNavLabel"),
      path: "/dashboard/deals",
      icon: LuHandshake,
      helper: "navDeals",
    },
    {
      name: t("tasksNavLabel"),
      path: "/dashboard/tasks",
      icon: LuListChecks,
      helper: "navTasks",
    },
    {
      name: t("calendarNavLabel"),
      path: "/dashboard/calendar",
      icon: LuCalendarDays,
      helper: "navCalendar",
    },
    {
      name: t("reportsNavLabel"),
      path: "/dashboard/reports",
      icon: LuChartColumn,
      helper: "navReports",
    },
    // Owner-only entry (UX only: the backend enforces Owner access on every
    // /audit-logs request, and the route itself is wrapped in OwnerRoute).
    ...(user?.isOwner
      ? [
          {
            name: t("auditNavLabel"),
            path: "/dashboard/audit-log",
            icon: LuShield,
            helper: "navAudit" as const,
          },
        ]
      : []),
    {
      name: t("settingsNavLabel"),
      path: "/dashboard/settings",
      icon: LuSettings,
      helper: "navSettings",
    },
  ];

  const handleLogout = async () => {
    const confirmed = await confirmAlert({
      title: t("logoutConfirmTitle"),
      text: t("logoutConfirmMessage"),
      confirmButtonText: t("logout"),
      cancelButtonText: t("cancel"),
    });

    if (!confirmed) {
      return;
    }

    await logout();
    navigate("/login", { replace: true });
  };

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : "";
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  // `start-0` is the right edge under dir="rtl", but `-translate-x-full` is
  // physical (always leftwards), so the closed drawer must slide the other way
  // there: `rtl:translate-x-full`. That rule out-ranks plain `md:translate-x-0`
  // under rtl, so desktop needs its own `rtl:md:translate-x-0` to stay in place.
  return (
    <aside
      className={`
        fixed inset-y-0 start-0 z-50 h-screen w-[280px] shrink-0
        border-r border-slate-200/70 bg-white shadow-2xl shadow-slate-900/10
        transition-transform duration-200 ease-out
        ${isOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}
        md:static md:z-auto md:w-64 md:translate-x-0 rtl:md:translate-x-0 md:shadow-none
      `}
    >
      <div className="flex h-full flex-col px-3 py-4">
        <div className="flex h-12 items-center justify-between px-2">
          <Logo />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-500 md:hidden"
          >
            <LuMenu size={20} />
          </button>
        </div>

        <div className="my-4 h-px bg-slate-100" />

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <Hint key={item.path} id={item.helper} placement="side">
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  end={item.path === "/dashboard"}
                  className={({ isActive }) => `
                  group relative flex h-11 items-center gap-3 rounded-xl px-3
                  transition-all duration-200
                  ${
                    isActive
                      ? "bg-brand-100 text-brand-800"
                      : "text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                  }
                `}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`
                        absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full
                        bg-brand-500 transition-all duration-200
                        ${isActive ? "h-6 w-1" : "h-0 w-0"}
                      `}
                      />

                      <span
                        className={`
                        flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                        transition-all duration-200
                        ${
                          isActive
                            ? "bg-white text-brand-600 shadow-sm"
                            : "group-hover:bg-white"
                        }
                      `}
                      >
                        <Icon size={17} />
                      </span>

                      <span className="truncate text-[13px] font-medium">
                        {item.name}
                      </span>

                      {isActive && (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </>
                  )}
                </NavLink>
              </Hint>
            );
          })}
        </nav>

        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-2.5 py-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white ring-2 ring-white"
              aria-hidden="true"
            >
              {initials || <LuUsers size={16} />}
            </div>

            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-slate-700">
                {fullName || "—"}
              </p>

              <p className="truncate text-[10px] text-slate-400">
                {user?.isOwner ? t("ownerBadge") : t("teamNavLabel")}
              </p>
            </div>
          </div>

          <Hint id="logout" placement="top">
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 items-center gap-3 rounded-xl px-3 text-slate-500 transition-all duration-200 hover:bg-red-50 hover:text-red-600"
            >
              <LuLogOut size={17} className="shrink-0" />
              <span className="text-[13px] font-medium">{t("logout")}</span>
            </button>
          </Hint>
        </div>
      </div>
    </aside>
  );
}
