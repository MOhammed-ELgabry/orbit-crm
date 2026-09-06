import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiUsers,
  FiActivity,
  FiCalendar,
  FiArrowRight,
} from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import { getBusinessTypeCopy } from "../../config/businessType";
import { getDashboardStats, type DashboardStats } from "../../services/dashboardService";
import { listContacts, contactDisplayName } from "../../services/contactService";
import type { Contact } from "../../types/contact";
import StatCard from "./StatCard";
import ActivityTimeline from "../Activity/ActivityTimeline";
import {
  CONTACT_STATUS_LABEL_KEY,
  contactStatusBadgeClass,
} from "../Contact/contactStatus";

/**
 * Replaces the previous fully-hardcoded dashboard (5 fake stat cards +
 * a fake donut chart, styled specifically for "dental clinic" — see
 * the old OverviewStats + Analytics components). Preserves that
 * version's visual system (StatCard mirrors PatientsStatsCard's exact
 * classes) while making it: (a) driven by real Contact/Activity/User
 * data instead of hardcoded numbers, and (b) tailored per business
 * type via config/businessType.ts instead of hardcoded to one vertical.
 *
 * No revenue/invoicing metric is shown — there is no such model in
 * the schema (Company/User/Contact/Activity/Role/Permission only), and
 * inventing one would be fake production data.
 */
export default function BusinessDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, company } = useAuth();
  const businessCopy = getBusinessTypeCopy(company?.businessType);
  const Icon = businessCopy.icon;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
 const [contactsStatus, setContactsStatus] = useState<
  "loading" | "ready" | "error"
>("loading");

  useEffect(() => {
    let cancelled = false;

    getDashboardStats()
      .then((result) => {
        if (!cancelled) {
          setStats(result);
          setStatsStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatsStatus("error");
      });

    listContacts({ page: 1, limit: 5, sortBy: "createdAt", sortOrder: "desc" })
      .then((result) => {
        if (!cancelled) {
          setRecentContacts(result.contacts);
          setContactsStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setContactsStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const contactsLabel = t(businessCopy.contactsLabel);

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-nunito text-lg font-bold text-slate-800">
            {t("welcomeBack", { name: user?.firstName ?? "" })}
          </h1>
          <p className="truncate text-xs text-slate-400">{company?.name}</p>
        </div>
      </div>

      {/* Stat cards — real data only, responsive: 1 col mobile, 2 sm, 4 lg
          (the previous version used a fixed grid-cols-5 with no
          breakpoints at all, which broke below ~1280px). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FiUsers}
          color={businessCopy.accent}
          label={contactsLabel}
          value={stats?.contactsCount ?? 0}
          isLoading={statsStatus === "loading"}
        />
        <StatCard
          icon={FiActivity}
          color={businessCopy.accent}
          label={t(businessCopy.activitiesLabel)}
          value={stats?.activitiesCount ?? 0}
          isLoading={statsStatus === "loading"}
        />
        <StatCard
          icon={FiCalendar}
          color={businessCopy.accent}
          label={t("upcoming")}
          value={stats?.upcomingActivitiesCount ?? 0}
          isLoading={statsStatus === "loading"}
        />
        <StatCard
          icon={FiUsers}
          color="purple"
          label={t("teamNavLabel")}
          value={stats?.teamMembersCount ?? 0}
          isLoading={statsStatus === "loading"}
        />
      </div>

      {/* Recent contacts + activity feed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="font-nunito text-[15px] font-semibold text-slate-800">
              {contactsLabel}
            </h3>
            <button
              type="button"
              onClick={() => navigate("/dashboard/contacts")}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("actions")}
              <FiArrowRight size={12} />
            </button>
          </div>

          <div className="mt-3">
            {contactsStatus === "loading" && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-50" />
                ))}
              </div>
            )}

            {contactsStatus === "ready" && recentContacts.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">
                {t("noContactsFoundDescription", {
                  label: t(businessCopy.contactSingular),
                })}
              </p>
            )}

            {contactsStatus === "ready" && recentContacts.length > 0 && (
              <ul className="space-y-1">
                {recentContacts.map((contact) => (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/dashboard/contacts/${contact.id}`)
                      }
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="truncate text-sm text-slate-700">
                        {contactDisplayName(contact)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${contactStatusBadgeClass(contact.status)}`}
                      >
                        {t(
                          CONTACT_STATUS_LABEL_KEY[contact.status] ??
                            contact.status,
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <ActivityTimeline canCreate={false} />
        </div>
      </div>
    </div>
  );
}