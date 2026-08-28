import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiMenu } from "react-icons/fi";
import Logo from "../Logo";
import { sidebarItems } from "./sidebarItems";

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const { t } = useTranslation();

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
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
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
          {sidebarItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.key}
                to={item.path}
                end={item.path === "/dashboard"}
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
                        absolute start-0
                        top-1/2
                        -translate-y-1/2
                        rounded-e-full
                        bg-blue-500
                        transition-all duration-200
                        ${isActive ? "h-6 w-1" : "h-0 w-0"}
                      `}
                    />

                    {/* Icon */}
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
                        {t(item.key)}
                      </span>
                    )}

                    {/* Active Dot */}
                    {isActive && isOpen && (
                      <span className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Profile */}
        <div
          className={`
            mt-3 flex items-center rounded-xl
            bg-slate-50
            ${isOpen ? "gap-3 px-2.5 py-2" : "justify-center py-2"}
          `}
        >
          <img
            src="https://i.pravatar.cc/100?img=12"
            alt="Dr. Ali"
            className="
              h-9 w-9 shrink-0
              rounded-full
              object-cover
              ring-2 ring-white
            "
          />

          {isOpen && (
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-slate-700">
                Dr. Ali
              </p>

              <p className="truncate text-[10px] text-slate-400">
                {t("clinicAdmin")}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
