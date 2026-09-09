import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiMenu,
  FiHome,
  FiUsers,
  FiSettings,
  FiLogOut,
} from "react-icons/fi";
import {
  FaBullseye,
  FaHandshake,
  FaTasks,
  FaCalendarAlt,
  FaChartBar,
  FaAddressBook,
} from "react-icons/fa";

import Logo from "./Logo";
import { useAuth } from "../../context/AuthContext";
import { getBusinessTypeCopy } from "../../config/businessType";
import { confirmAlert } from "../../lib/swal";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, company, logout } = useAuth();

  const businessCopy = getBusinessTypeCopy(company?.businessType);

  const menuItems = [
    { name: t("dashboardNavLabel"), path: "/dashboard", icon: FiHome },
    {
      name: t(businessCopy.contactsLabel),
      path: "/dashboard/contacts",
      icon: FaAddressBook,
    },
    { name: t("teamNavLabel"), path: "/dashboard/users", icon: FiUsers },
    { name: t("leadsNavLabel"), path: "/dashboard/leads", icon: FaBullseye },
    { name: t("dealsNavLabel"), path: "/dashboard/deals", icon: FaHandshake },
    { name: t("tasksNavLabel"), path: "/dashboard/tasks", icon: FaTasks },
    {
      name: t("calendarNavLabel"),
      path: "/dashboard/calendar",
      icon: FaCalendarAlt,
    },
    {
      name: t("reportsNavLabel"),
      path: "/dashboard/reports",
      icon: FaChartBar,
    },
    {
      name: t("settingsNavLabel"),
      path: "/dashboard/settings",
      icon: FiSettings,
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

  return (
    <aside
      className={`
        fixed inset-y-0 start-0 z-50 h-screen w-[280px] shrink-0
        border-r border-slate-200/70 bg-white shadow-2xl shadow-slate-900/10
        transition-transform duration-200 ease-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        md:static md:z-auto md:w-64 md:translate-x-0 md:shadow-none
      `}
    >
      <div className="flex h-full flex-col px-3 py-4">
        <div className="flex h-12 items-center justify-between px-2">
          <Logo />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:bg-blue-50 hover:text-blue-500 md:hidden"
          >
            <FiMenu size={20} />
          </button>
        </div>

        <div className="my-4 h-px bg-slate-100" />

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                end={item.path === "/dashboard"}
                className={({ isActive }) => `
                  group relative flex h-11 items-center gap-3 rounded-xl px-3
                  transition-all duration-200
                  ${
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-500 hover:bg-slate-50 hover:text-blue-500"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`
                        absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full
                        bg-blue-500 transition-all duration-200
                        ${isActive ? "h-6 w-1" : "h-0 w-0"}
                      `}
                    />

                    <span
                      className={`
                        flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                        transition-all duration-200
                        ${
                          isActive
                            ? "bg-white text-blue-600 shadow-sm"
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
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-2.5 py-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white ring-2 ring-white"
              aria-hidden="true"
            >
              {initials || <FiUsers size={16} />}
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

          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-slate-500 transition-all duration-200 hover:bg-red-50 hover:text-red-600"
          >
            <FiLogOut size={17} className="shrink-0" />
            <span className="text-[13px] font-medium">{t("logout")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}