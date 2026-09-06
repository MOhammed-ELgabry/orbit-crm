import { useState } from "react";
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

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
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

    // Real server-side logout (revokes the refresh-token session via
    // POST /auth/logout) followed by clearing local auth state — not a
    // client-only "clear and hope" logout. See AuthContext.logout.
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
        h-screen shrink-0
        border-r border-slate-100
        bg-white
        transition-all duration-300 ease-in-out
        ${isOpen ? "w-60" : "w-[72px]"}
      `}
    >
      <div className="flex h-full flex-col px-3 py-4">
        {/* Logo + Toggle */}
        <div
          className={`
            flex h-12 items-center
            ${isOpen ? "justify-between px-2" : "justify-center"}
          `}
        >
          {isOpen && <Logo />}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle sidebar"
            className="
              flex h-9 w-9 items-center justify-center
              rounded-lg
              text-slate-400
              transition-all duration-200
              hover:bg-blue-50
              hover:text-blue-500
            "
          >
            <FiMenu size={20} />
          </button>
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-slate-100" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
                title={!isOpen ? item.name : undefined}
                className={({ isActive }) => `
                  group relative flex h-11 items-center
                  rounded-xl
                  transition-all duration-200
                  ${isOpen ? "gap-3 px-3" : "justify-center px-0"}
                  ${
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-500 hover:bg-slate-50 hover:text-blue-500"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Active Indicator */}
                    <span
                      className={`
                        absolute left-0
                        top-1/2
                        -translate-y-1/2
                        rounded-r-full
                        bg-blue-500
                        transition-all duration-200
                        ${isActive ? "h-6 w-1" : "h-0 w-0"}
                      `}
                    />

                    {/* Icon Container */}
                    <span
                      className={`
                        flex h-8 w-8 shrink-0
                        items-center justify-center
                        rounded-lg
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

                    {/* Label */}
                    {isOpen && (
                      <span className="truncate text-[13px] font-medium">
                        {item.name}
                      </span>
                    )}

                    {/* Active Dot */}
                    {isActive && isOpen && (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section — real authenticated user + working logout */}
        <div className="mt-2 flex flex-col gap-1.5">
          <div
            className={`
              flex items-center rounded-xl
              bg-slate-50
              ${isOpen ? "gap-3 px-2.5 py-2" : "justify-center py-2"}
            `}
          >
            <div
              className="
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-full bg-blue-500 text-xs font-semibold text-white
                ring-2 ring-white
              "
              aria-hidden="true"
            >
              {initials || <FiUsers size={16} />}
            </div>

            {isOpen && (
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-slate-700">
                  {fullName || "—"}
                </p>

                <p className="truncate text-[10px] text-slate-400">
                  {user?.isOwner ? t("ownerBadge") : t("teamNavLabel")}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title={!isOpen ? t("logout") : undefined}
            className={`
              flex h-10 items-center rounded-xl
              text-slate-500
              transition-all duration-200
              hover:bg-red-50 hover:text-red-600
              ${isOpen ? "gap-3 px-3" : "justify-center px-0"}
            `}
          >
            <FiLogOut size={17} className="shrink-0" />
            {isOpen && (
              <span className="text-[13px] font-medium">{t("logout")}</span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}