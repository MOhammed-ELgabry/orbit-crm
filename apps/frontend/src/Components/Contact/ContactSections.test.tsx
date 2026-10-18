/**
 * The Customer 360 section components, rendered directly with hand-made
 * resources. Focus: they must never crash the page on unexpected data
 * (an unparsable date), and dates must mean the same thing as on the
 * Calendar page (an all-day event is a UTC calendar day).
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KeyedResource } from "../../hooks/useKeyedResource";
import type { Activity } from "../../types/activity";
import type { CalendarEvent } from "../../types/calendar";
import type { Deal } from "../../types/deal";
import type { Task } from "../../types/task";
import type { ActivityListResult } from "../../services/activityService";
import type { CalendarEventListResult } from "../../services/calendarService";
import type { DealListResult } from "../../services/dealService";
import type { TaskListResult } from "../../services/taskService";

import "../../i18n";
import i18n from "i18next";

import ContactCalendarTab from "./ContactCalendarTab";
import ContactDealsTab from "./ContactDealsTab";
import ContactOverviewTab from "./ContactOverviewTab";
import ContactTasksTab from "./ContactTasksTab";

const noop = () => {};

// The test runner has no Node typings in this project, so reach the process
// environment (used to switch the timezone) through a narrow local type.
const env = (
  globalThis as unknown as {
    process: { env: Record<string, string | undefined> };
  }
).process.env;

function setTimeZone(timeZone: string | undefined) {
  if (timeZone === undefined) {
    delete env.TZ;
  } else {
    env.TZ = timeZone;
  }
}

function ready<T>(data: T): KeyedResource<T> {
  return { status: "ready", data, retry: noop, replaceData: noop };
}

const calendarMeta = {
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-12-30T00:00:00.000Z",
  limit: 500,
  hasMore: false,
};

const pageMeta = {
  page: 1,
  limit: 100,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const makeDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: "d1",
  companyId: "company-1",
  title: "Renewal deal",
  amount: "100.00",
  stage: "new",
  notes: null,
  expectedCloseDate: null,
  contactId: "c1",
  leadId: null,
  createdById: "user-1",
  assignedToId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  companyId: "company-1",
  title: "Call back",
  description: null,
  status: "todo",
  priority: "medium",
  dueDate: null,
  completedAt: null,
  contactId: "c1",
  leadId: null,
  dealId: null,
  createdById: "user-1",
  assignedToId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  companyId: "company-1",
  title: "Onboarding workshop",
  description: null,
  location: null,
  startAt: "2026-10-20T09:00:00.000Z",
  endAt: "2026-10-20T10:00:00.000Z",
  allDay: false,
  status: "scheduled",
  contactId: "c1",
  leadId: null,
  dealId: null,
  createdById: "user-1",
  assignedToId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const makeActivity = (overrides: Partial<Activity> = {}): Activity => ({
  id: "a1",
  companyId: "company-1",
  type: "NOTE",
  title: "Called the customer",
  description: null,
  occurredAt: "2026-10-14T09:00:00.000Z",
  createdById: "user-1",
  contactId: "c1",
  dealId: null,
  taskId: null,
  calendarEventId: null,
  createdAt: "2026-10-14T09:00:00.000Z",
  updatedAt: "2026-10-14T09:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const renderInRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Customer 360 sections", () => {
  const originalTz = env.TZ;

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    setTimeZone(originalTz);
    vi.restoreAllMocks();
  });

  describe("an unparsable date never takes the page down", () => {
    it("deals tab: the row is still shown, without a close date", () => {
      renderInRouter(
        <ContactDealsTab
          resource={ready<DealListResult>({
            deals: [makeDeal({ expectedCloseDate: "not-a-date" })],
            meta: pageMeta,
          })}
        />,
      );

      expect(screen.getByText("Renewal deal")).toBeInTheDocument();
    });

    it("tasks tab: the row is still shown, as having no usable due date", () => {
      renderInRouter(
        <ContactTasksTab
          resource={ready<TaskListResult>({
            tasks: [makeTask({ dueDate: "31/31/2026" })],
            meta: pageMeta,
          })}
        />,
      );

      expect(screen.getByText("Call back")).toBeInTheDocument();
    });

    it("calendar tab: the row is still shown", () => {
      renderInRouter(
        <ContactCalendarTab
          resource={ready<CalendarEventListResult>({
            events: [makeEvent({ startAt: "garbage" })],
            meta: calendarMeta,
          })}
        />,
      );

      expect(screen.getByText("Onboarding workshop")).toBeInTheDocument();
    });

    it("overview: the cards render when the next event and the last activity have unparsable dates", () => {
      renderInRouter(
        <ContactOverviewTab
          deals={ready<DealListResult>({ deals: [], meta: pageMeta })}
          tasks={ready<TaskListResult>({ tasks: [], meta: pageMeta })}
          events={ready<CalendarEventListResult>({
            events: [makeEvent({ startAt: "garbage" })],
            meta: calendarMeta,
          })}
          lastActivity={ready<ActivityListResult>({
            activities: [makeActivity({ occurredAt: "garbage" })],
            meta: pageMeta,
          })}
          onOpenTab={noop}
        />,
      );

      expect(screen.getByText("Called the customer")).toBeInTheDocument();
    });
  });

  describe("all-day events are a UTC calendar day (same rule as the Calendar page)", () => {
    it.each(["America/Los_Angeles", "Asia/Tokyo", "UTC"])(
      "shows the same date, 21 October 2026, to a viewer in %s",
      (timeZone) => {
        setTimeZone(timeZone);

        renderInRouter(
          <ContactCalendarTab
            resource={ready<CalendarEventListResult>({
              events: [
                makeEvent({
                  allDay: true,
                  startAt: "2026-10-21T00:00:00.000Z",
                  endAt: "2026-10-22T00:00:00.000Z",
                }),
              ],
              meta: calendarMeta,
            })}
          />,
        );

        expect(screen.getByText(/Oct 21, 2026/)).toBeInTheDocument();
      },
    );
  });
});
