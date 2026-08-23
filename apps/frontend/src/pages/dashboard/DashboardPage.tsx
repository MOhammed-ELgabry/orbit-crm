import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FaAddressBook, FaBuilding, FaSignOutAlt, FaUsers } from "react-icons/fa";
import type { IconType } from "react-icons";

import { useAuth } from "../../context/AuthContext";
import { getDashboardStats, type DashboardStats } from "../../services/dashboardService";
import logo from "../../assets/Subtract.png";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: IconType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 flex items-center gap-4 shadow-[0_1px_0_rgba(3,2,41,0.06)]">
      <div className="w-12 h-12 rounded-full bg-[#F0EDFF] flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-[#605BFF]" />
      </div>

      <div>
        <p className="text-2xl font-nunito font-semibold text-[#030229]">
          {value}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getDashboardStats()
      .then((result) => {
        if (!cancelled) {
          setStats(result);
        }
      })
      .catch((error) => {
        // Non-fatal — the dashboard itself doesn't depend on these
        // numbers loading; the cards below just fall back to a dash.
        console.error("Failed to load dashboard stats:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingStats(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    // AuthContext.logout() already swallows its own errors (a session
    // that's already gone still satisfies "log me out"), so this never
    // needs a try/catch here.
    await logout();
    navigate("/login");
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  return (
    <div className="min-h-screen bg-[#F7F7F8]">
      <header className="flex items-center justify-between bg-white px-4 sm:px-6 lg:px-10 py-4 shadow-[0_1px_0_rgba(3,2,41,0.06)]">
        <div className="flex items-center gap-2">
          <img
            src={logo}
            alt="logo"
            className="w-[32px] h-[32px] object-contain"
          />
          <span className="font-nunito font-semibold text-[18px] text-[#030229]">
            Orbit CRM
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-[#030229]">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs text-gray-500">{user?.email}</span>
          </div>

          <div className="w-9 h-9 rounded-full bg-[#605BFF] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {initials || "?"}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-[10px] bg-[#F7F7F8] px-3 py-2 text-sm text-[#030229] transition-colors duration-200 hover:bg-[#EFEFF3] cursor-pointer"
          >
            <FaSignOutAlt size={14} />
            <span className="hidden sm:inline">{t("logout")}</span>
          </button>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-10 py-8 max-w-[1100px] mx-auto">
        <h1 className="font-nunito font-semibold text-[22px] sm:text-[25px] text-[#030229]">
          {t("welcomeBack", { name: user?.firstName ?? "" })}
        </h1>

        <p className="text-sm text-gray-500 mt-1">{t("dashboardSubtitle")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <StatCard
            icon={FaAddressBook}
            label={t("totalContacts")}
            value={isLoadingStats ? "…" : stats?.contactsCount ?? 0}
          />
          <StatCard
            icon={FaUsers}
            label={t("teamMembers")}
            value={isLoadingStats ? "…" : stats?.teamMembersCount ?? 0}
          />
          <StatCard
            icon={FaBuilding}
            label={t("accountOwner")}
            value={user?.isOwner ? t("yes") : t("no")}
          />
        </div>

        <div className="mt-8 rounded-2xl bg-white p-8 text-center border border-dashed border-[#E3E3EA]">
          <p className="text-sm text-gray-500">{t("dashboardComingSoon")}</p>
        </div>
      </main>
    </div>
  );
}