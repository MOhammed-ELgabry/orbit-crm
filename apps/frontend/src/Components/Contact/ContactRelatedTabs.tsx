import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays } from "date-fns";

import { useAuth } from "../../context/AuthContext";
import { useKeyedResource } from "../../hooks/useKeyedResource";
import { listActivities } from "../../services/activityService";
import { listCalendarEvents } from "../../services/calendarService";
import { listDeals } from "../../services/dealService";
import { listTasks } from "../../services/taskService";
import {
  CONTACT_SECTION_LIMIT,
  UPCOMING_EVENTS_WINDOW_DAYS,
} from "../../lib/contact360";
import type { Activity } from "../../types/activity";
import ActivityTimeline from "../Activity/ActivityTimeline";

import ContactCalendarTab from "./ContactCalendarTab";
import ContactDealsTab from "./ContactDealsTab";
import ContactOverviewTab, { type ContactTab } from "./ContactOverviewTab";
import ContactTasksTab from "./ContactTasksTab";

interface ContactRelatedTabsProps {
  contactId: string;
}

const TAB_LABEL_KEY: Record<ContactTab, string> = {
  overview: "contact360Overview",
  timeline: "activityTimelineTitle",
  deals: "dealsNavLabel",
  tasks: "tasksNavLabel",
  calendar: "calendarNavLabel",
};

/**
 * The Customer 360 tabs for one contact.
 *
 * Render it with `key={contactId}`: switching contacts then discards every
 * piece of state here (selected tab, loaded sections), and the keyed
 * resources additionally drop any response that belongs to the previous
 * contact, so nothing of the previous contact can ever be shown.
 *
 * Each source is fetched through its own existing endpoint (no aggregate
 * endpoint) and only when the user holds that source's read permission.
 * This is a UX decision only: every one of those endpoints enforces its own
 * permission and the caller's company on the server, and a 403 from any of
 * them is rendered as that section's "no access" state.
 */
export default function ContactRelatedTabs({
  contactId,
}: ContactRelatedTabsProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const canDeals = hasPermission("deal:read");
  const canTasks = hasPermission("task:read");
  const canCalendar = hasPermission("calendar:read");
  const canActivity = hasPermission("activity:read");

  const loadDeals = useCallback(
    () =>
      listDeals({
        contactId,
        limit: CONTACT_SECTION_LIMIT,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    [contactId],
  );
  const loadTasks = useCallback(
    () =>
      listTasks({
        contactId,
        limit: CONTACT_SECTION_LIMIT,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    [contactId],
  );
  const loadEvents = useCallback(() => {
    const from = new Date();
    return listCalendarEvents({
      contactId,
      status: "scheduled",
      from: from.toISOString(),
      to: addDays(from, UPCOMING_EVENTS_WINDOW_DAYS).toISOString(),
    });
  }, [contactId]);
  const loadLastActivity = useCallback(
    () =>
      listActivities({
        contactId,
        limit: 1,
        sortBy: "occurredAt",
        sortOrder: "desc",
      }),
    [contactId],
  );

  // A key of null leaves the resource idle: no request for a source the
  // user cannot read.
  const deals = useKeyedResource(canDeals ? contactId : null, loadDeals);
  const tasks = useKeyedResource(canTasks ? contactId : null, loadTasks);
  const events = useKeyedResource(canCalendar ? contactId : null, loadEvents);
  const lastActivity = useKeyedResource(
    canActivity ? contactId : null,
    loadLastActivity,
  );

  const availableTabs: ContactTab[] = [
    "overview",
    ...(canActivity ? (["timeline"] as const) : []),
    ...(canDeals ? (["deals"] as const) : []),
    ...(canTasks ? (["tasks"] as const) : []),
    ...(canCalendar ? (["calendar"] as const) : []),
  ];

  const [selectedTab, setSelectedTab] = useState<ContactTab>("overview");
  const activeTab = availableTabs.includes(selectedTab)
    ? selectedTab
    : "overview";

  const linkForActivity = (activity: Activity) =>
    canDeals && activity.dealId
      ? {
          to: `/dashboard/deals/${activity.dealId}`,
          label: t("contact360ViewDeal"),
        }
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={t("contact360Overview")}
        className="flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-white p-2"
      >
        {availableTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`contact-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`contact-panel-${tab}`}
            onClick={() => setSelectedTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === tab
                ? "bg-brand-50 text-brand-600"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t(TAB_LABEL_KEY[tab])}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`contact-panel-${activeTab}`}
        aria-labelledby={`contact-tab-${activeTab}`}
      >
        {/* The timeline brings its own card; every other panel is framed here. */}
        {activeTab === "timeline" ? (
          <ActivityTimeline
            contactId={contactId}
            canCreate={hasPermission("activity:create")}
            canDelete={hasPermission("activity:delete")}
            linkFor={linkForActivity}
          />
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
            {activeTab === "overview" && (
              <ContactOverviewTab
                deals={deals}
                tasks={tasks}
                events={events}
                lastActivity={lastActivity}
                onOpenTab={setSelectedTab}
              />
            )}
            {activeTab === "deals" && <ContactDealsTab resource={deals} />}
            {activeTab === "tasks" && <ContactTasksTab resource={tasks} />}
            {activeTab === "calendar" && (
              <ContactCalendarTab resource={events} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
