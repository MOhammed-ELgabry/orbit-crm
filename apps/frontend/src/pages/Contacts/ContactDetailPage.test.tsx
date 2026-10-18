import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "../../types/activity";
import type { CalendarEvent } from "../../types/calendar";
import type { Contact } from "../../types/contact";
import type { Deal } from "../../types/deal";
import type { Task } from "../../types/task";

const svc = vi.hoisted(() => ({
  getContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  listDeals: vi.fn(),
  listTasks: vi.fn(),
  listCalendarEvents: vi.fn(),
  listActivities: vi.fn(),
  createActivity: vi.fn(),
  deleteActivity: vi.fn(),
}));
const swal = vi.hoisted(() => ({
  confirmAlert: vi.fn(),
  errorAlert: vi.fn(),
}));
const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("../../services/contactService", () => ({
  getContact: svc.getContact,
  updateContact: svc.updateContact,
  deleteContact: svc.deleteContact,
  contactDisplayName: (contact: { firstName: string; lastName: string }) =>
    `${contact.firstName} ${contact.lastName}`.trim(),
}));
vi.mock("../../services/dealService", () => ({ listDeals: svc.listDeals }));
vi.mock("../../services/taskService", () => ({ listTasks: svc.listTasks }));
vi.mock("../../services/calendarService", () => ({
  listCalendarEvents: svc.listCalendarEvents,
}));
vi.mock("../../services/activityService", () => ({
  listActivities: svc.listActivities,
  createActivity: svc.createActivity,
  deleteActivity: svc.deleteActivity,
}));
vi.mock("../../lib/swal", () => swal);
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    company: { businessType: "medical_clinics" },
    hasPermission: (permission: string) => auth.permissions.has(permission),
  }),
}));

import "../../i18n";
import i18n from "i18next";
import ContactDetailPage from "./ContactDetailPage";

// "Today" is pinned so overdue / relative-time output is deterministic. Only
// Date is faked: real timers keep waitFor / userEvent working normally.
const NOW = new Date(2026, 9, 15, 12, 0, 0);

const ALL_PERMISSIONS = [
  "contact:update",
  "contact:delete",
  "deal:read",
  "task:read",
  "calendar:read",
  "activity:read",
  "activity:create",
  "activity:delete",
];

const pageMeta = (total: number, hasNextPage = false) => ({
  page: 1,
  limit: 100,
  total,
  totalPages: hasNextPage ? 2 : 1,
  hasNextPage,
  hasPreviousPage: false,
});

const makeContact = (
  id: string,
  overrides: Partial<Contact> = {},
): Contact => ({
  id,
  companyId: "company-1",
  firstName: id === "c1" ? "Amina" : "Omar",
  lastName: id === "c1" ? "Hassan" : "Said",
  email: `${id}@example.test`,
  phone: null,
  mobile: null,
  jobTitle: null,
  organizationName: null,
  website: null,
  address: null,
  city: null,
  state: null,
  country: null,
  postalCode: null,
  notes: id === "c1" ? "Prefers evening calls" : null,
  source: null,
  status: "active",
  createdById: "user-1",
  assignedToId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const makeDeal = (id: string, title: string, overrides: Partial<Deal> = {}) =>
  ({
    id,
    companyId: "company-1",
    title,
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
  }) satisfies Deal;

const makeTask = (id: string, title: string, overrides: Partial<Task> = {}) =>
  ({
    id,
    companyId: "company-1",
    title,
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
  }) satisfies Task;

const makeEvent = (
  id: string,
  title: string,
  overrides: Partial<CalendarEvent> = {},
) =>
  ({
    id,
    companyId: "company-1",
    title,
    description: null,
    location: null,
    startAt: new Date(2026, 9, 20, 9, 0).toISOString(),
    endAt: new Date(2026, 9, 20, 10, 0).toISOString(),
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
  }) satisfies CalendarEvent;

const makeActivity = (
  id: string,
  title: string,
  overrides: Partial<Activity> = {},
): Activity => ({
  id,
  companyId: "company-1",
  type: "NOTE",
  title,
  description: null,
  occurredAt: new Date(2026, 9, 14, 9, 0).toISOString(),
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

const dealsResult = (deals: Deal[], hasNextPage = false) => ({
  deals,
  meta: pageMeta(deals.length, hasNextPage),
});
const tasksResult = (tasks: Task[], hasNextPage = false) => ({
  tasks,
  meta: pageMeta(tasks.length, hasNextPage),
});
const eventsResult = (events: CalendarEvent[], hasMore = false) => ({
  events,
  meta: {
    from: "2026-10-15T00:00:00.000Z",
    to: "2027-01-13T00:00:00.000Z",
    limit: 500,
    hasMore,
  },
});
const activitiesResult = (activities: Activity[]) => ({
  activities,
  meta: pageMeta(activities.length),
});

const httpError = (status: number) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
  } as AxiosResponse);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function GoToSecondContact() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/dashboard/contacts/c2")}>
      go to second contact
    </button>
  );
}

function renderPage(path = "/dashboard/contacts/c1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard/contacts/:id"
          element={
            <>
              <GoToSecondContact />
              <ContactDetailPage />
            </>
          }
        />
        <Route path="/dashboard/contacts" element={<p>Contacts list page</p>} />
        <Route path="/dashboard/deals/:id" element={<p>Deal detail page</p>} />
        <Route path="/dashboard/deals" element={<p>Deals list page</p>} />
        <Route path="/dashboard/tasks" element={<p>Tasks list page</p>} />
        <Route path="/dashboard/calendar" element={<p>Calendar page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const grant = (...permissions: string[]) => {
  auth.permissions = new Set(permissions);
};

const isLoading = (container: HTMLElement) =>
  container.querySelectorAll(".animate-pulse").length > 0;

const cardOf = (title: string) =>
  screen.getByText(title).parentElement as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  vi.clearAllMocks();
  grant(...ALL_PERMISSIONS);

  svc.getContact.mockImplementation((id: string) =>
    Promise.resolve(makeContact(id)),
  );
  svc.listDeals.mockResolvedValue(dealsResult([]));
  svc.listTasks.mockResolvedValue(tasksResult([]));
  svc.listCalendarEvents.mockResolvedValue(eventsResult([]));
  svc.listActivities.mockResolvedValue(activitiesResult([]));
  swal.confirmAlert.mockResolvedValue(true);
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en");
});

describe("ContactDetailPage — profile and overview", () => {
  it("shows the contact's profile, contact info and notes", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Amina Hassan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("c1@example.test")).toBeInTheDocument();
    expect(screen.getByText("Prefers evening calls")).toBeInTheDocument();
  });

  it("summarises the contact from real data: open deals and value, open and overdue tasks, upcoming events, last activity", async () => {
    svc.listDeals.mockResolvedValue(
      dealsResult([
        makeDeal("d1", "Clinic fit-out", { amount: "100.50", stage: "new" }),
        makeDeal("d2", "Maintenance plan", {
          amount: "200.25",
          stage: "proposal",
        }),
        makeDeal("d3", "Old deal", { amount: "999.00", stage: "closed_won" }),
      ]),
    );
    svc.listTasks.mockResolvedValue(
      tasksResult([
        makeTask("t1", "Send quote", {
          status: "todo",
          dueDate: new Date(2026, 9, 1).toISOString(),
        }),
        makeTask("t2", "Follow up", { status: "in_progress" }),
        makeTask("t3", "Done task", { status: "completed" }),
      ]),
    );
    svc.listCalendarEvents.mockResolvedValue(
      eventsResult([makeEvent("e1", "Site visit")]),
    );
    svc.listActivities.mockResolvedValue(
      activitiesResult([makeActivity("a1", "Called about the quote")]),
    );

    renderPage();

    await waitFor(() =>
      expect(within(cardOf("Open deals")).getByText("2")).toBeInTheDocument(),
    );
    expect(
      within(cardOf("Open deals")).getByText("Open value: 300.75"),
    ).toBeInTheDocument();

    expect(within(cardOf("Open tasks")).getByText("2")).toBeInTheDocument();
    expect(
      within(cardOf("Open tasks")).getByText("1 overdue"),
    ).toBeInTheDocument();

    expect(
      within(cardOf("Upcoming events")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(cardOf("Upcoming events")).getByText(/^Next: /),
    ).toBeInTheDocument();

    expect(
      within(cardOf("Last activity")).getByText("Called about the quote"),
    ).toBeInTheDocument();
  });

  it("shows honest zeros and 'No activity yet' for a contact with nothing linked", async () => {
    renderPage();

    await waitFor(() =>
      expect(
        within(cardOf("Last activity")).getByText("No activity yet"),
      ).toBeInTheDocument(),
    );
    expect(within(cardOf("Open deals")).getByText("0")).toBeInTheDocument();
    expect(within(cardOf("Open tasks")).getByText("0")).toBeInTheDocument();
    expect(
      within(cardOf("Upcoming events")).getByText("0"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Open value/)).not.toBeInTheDocument();
  });

  it("marks counts as partial and withholds the total when more records exist than one page", async () => {
    svc.listDeals.mockResolvedValue(
      dealsResult([makeDeal("d1", "Big deal", { amount: "50.00" })], true),
    );

    renderPage();

    await waitFor(() =>
      expect(within(cardOf("Open deals")).getByText("1+")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Open value/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Based on the first 100 records only."),
    ).toBeInTheDocument();
  });

  it("shows a loading state while the summary data is in flight", async () => {
    const pending = deferred<ReturnType<typeof dealsResult>>();
    svc.listDeals.mockReturnValue(pending.promise);

    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(isLoading(container)).toBe(true);

    await act(async () => pending.resolve(dealsResult([])));

    await waitFor(() =>
      expect(within(cardOf("Open deals")).getByText("0")).toBeInTheDocument(),
    );
  });
});

describe("ContactDetailPage — tenant scoping on the wire", () => {
  it("asks each source only for this contact and never sends a companyId (the server derives the tenant)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    await waitFor(() => {
      expect(svc.listDeals).toHaveBeenCalled();
      expect(svc.listTasks).toHaveBeenCalled();
      expect(svc.listCalendarEvents).toHaveBeenCalled();
      expect(svc.listActivities).toHaveBeenCalled();
    });

    for (const mock of [
      svc.listDeals,
      svc.listTasks,
      svc.listCalendarEvents,
      svc.listActivities,
    ]) {
      for (const [query] of mock.mock.calls) {
        expect(query.contactId).toBe("c1");
        expect(query).not.toHaveProperty("companyId");
      }
    }
    expect(svc.getContact).toHaveBeenCalledWith("c1");
  });

  it("asks for the upcoming window only: scheduled events from now, at most 90 days", async () => {
    renderPage();

    await waitFor(() => expect(svc.listCalendarEvents).toHaveBeenCalled());

    const [query] = svc.listCalendarEvents.mock.calls[0];
    expect(query.status).toBe("scheduled");
    expect(new Date(query.from).getTime()).toBe(NOW.getTime());
    const days =
      (new Date(query.to).getTime() - new Date(query.from).getTime()) /
      (24 * 60 * 60 * 1000);
    // 90 calendar days (+/- an hour across a DST change), and always inside
    // the backend's 92-day limit on a calendar range.
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(92);
  });
});

describe("ContactDetailPage — permissions", () => {
  it("shows every tab to a user who can read every source", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Overview",
      "Timeline",
      "Deals",
      "Tasks",
      "Calendar",
    ]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("hides the tabs and makes NO request for sources the user cannot read", async () => {
    grant("activity:read");

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Timeline",
    ]);
    await waitFor(() => expect(svc.listActivities).toHaveBeenCalled());
    expect(svc.listDeals).not.toHaveBeenCalled();
    expect(svc.listTasks).not.toHaveBeenCalled();
    expect(svc.listCalendarEvents).not.toHaveBeenCalled();
    expect(screen.queryByText("Open deals")).not.toBeInTheDocument();
    expect(screen.queryByText("Open tasks")).not.toBeInTheDocument();
  });

  it("tells a user who can read none of the sources that they have no access, without requesting anything", async () => {
    grant();

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(
      screen.getByText("You don't have access to this section"),
    ).toBeInTheDocument();
    expect(svc.listDeals).not.toHaveBeenCalled();
    expect(svc.listTasks).not.toHaveBeenCalled();
    expect(svc.listCalendarEvents).not.toHaveBeenCalled();
    expect(svc.listActivities).not.toHaveBeenCalled();
  });

  it("shows Edit, Delete and notes editing only to a user with contact:update / contact:delete", async () => {
    grant("deal:read");

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit notes" }),
    ).not.toBeInTheDocument();
  });

  it("shows only the action the user holds the permission for", async () => {
    grant("contact:update");

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit notes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("deletes through the API after confirmation and returns to the list", async () => {
    const user = userEvent.setup();
    svc.deleteContact.mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(svc.deleteContact).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Contacts list page")).toBeInTheDocument();
  });
});

describe("ContactDetailPage — Deals, Tasks and Calendar tabs", () => {
  it("lists the contact's deals and navigates to the deal's detail page", async () => {
    const user = userEvent.setup();
    svc.listDeals.mockResolvedValue(
      dealsResult([
        makeDeal("d1", "Clinic fit-out", { stage: "proposal" }),
        makeDeal("d2", "Closed deal", { stage: "closed_won" }),
      ]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Deals" }));

    expect(await screen.findByText("Closed deal")).toBeInTheDocument();
    expect(screen.getByText("Proposal")).toBeInTheDocument();
    expect(screen.getByText("Closed Won")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Clinic fit-out" });
    expect(link).toHaveAttribute("href", "/dashboard/deals/d1");

    await user.click(link);
    expect(await screen.findByText("Deal detail page")).toBeInTheDocument();
  });

  it("lists the contact's tasks with status and priority and links to the Tasks page", async () => {
    const user = userEvent.setup();
    svc.listTasks.mockResolvedValue(
      tasksResult([
        makeTask("t1", "Send quote", {
          status: "in_progress",
          priority: "high",
        }),
      ]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Tasks" }));

    expect(await screen.findByText("Send quote")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("No due date")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Open Tasks" }));
    expect(await screen.findByText("Tasks list page")).toBeInTheDocument();
  });

  it("lists the contact's upcoming events and links to the Calendar page", async () => {
    const user = userEvent.setup();
    svc.listCalendarEvents.mockResolvedValue(
      eventsResult([makeEvent("e1", "Site visit")]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Calendar" }));

    expect(await screen.findByText("Site visit")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Open Calendar" }));
    expect(await screen.findByText("Calendar page")).toBeInTheDocument();
  });

  it("shows an empty state in each tab when nothing is linked", async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    await user.click(screen.getByRole("tab", { name: "Deals" }));
    expect(await screen.findByText("No deals linked yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(await screen.findByText("No tasks linked yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Calendar" }));
    expect(
      await screen.findByText("No upcoming events in the next 90 days."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(
      await screen.findByText("No activity logged yet"),
    ).toBeInTheDocument();
  });

  it("opens the matching tab when a summary card is clicked", async () => {
    const user = userEvent.setup();
    svc.listDeals.mockResolvedValue(
      dealsResult([makeDeal("d1", "Clinic fit-out")]),
    );

    renderPage();
    await waitFor(() =>
      expect(within(cardOf("Open deals")).getByText("1")).toBeInTheDocument(),
    );

    await user.click(within(cardOf("Open deals")).getByRole("button"));

    expect(screen.getByRole("tab", { name: "Deals" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Clinic fit-out")).toBeInTheDocument();
  });

  it("warns, and links to the full list, when a tab only shows the first page of deals", async () => {
    const user = userEvent.setup();
    svc.listDeals.mockResolvedValue(
      dealsResult([makeDeal("d1", "Clinic fit-out")], true),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Deals" }));

    expect(
      await screen.findByText(/Based on the first 100 records only\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Deals" })).toHaveAttribute(
      "href",
      "/dashboard/deals",
    );
  });
});

describe("ContactDetailPage — a failing section never takes the page down", () => {
  it("shows an error with Retry in the failing section only, and Retry recovers it", async () => {
    const user = userEvent.setup();
    svc.listDeals
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce(dealsResult([makeDeal("d1", "Clinic fit-out")]));
    svc.listTasks.mockResolvedValue(
      tasksResult([makeTask("t1", "Send quote", { status: "todo" })]),
    );

    renderPage();

    await waitFor(() =>
      expect(
        within(cardOf("Open deals")).getByText(
          "Something went wrong. Please try again.",
        ),
      ).toBeInTheDocument(),
    );
    // The rest of the page is intact.
    expect(
      screen.getByRole("heading", { name: "Amina Hassan" }),
    ).toBeInTheDocument();
    expect(within(cardOf("Open tasks")).getByText("1")).toBeInTheDocument();

    await user.click(
      within(cardOf("Open deals")).getByRole("button", { name: "Retry" }),
    );

    await waitFor(() =>
      expect(within(cardOf("Open deals")).getByText("1")).toBeInTheDocument(),
    );
    expect(svc.listDeals).toHaveBeenCalledTimes(2);
  });

  it("renders a 403 from one source as that section's no-access state while the others load", async () => {
    const user = userEvent.setup();
    svc.listTasks.mockRejectedValue(httpError(403));
    svc.listDeals.mockResolvedValue(
      dealsResult([makeDeal("d1", "Clinic fit-out")]),
    );

    renderPage();

    await waitFor(() =>
      expect(
        within(cardOf("Open tasks")).getByText(
          "You don't have access to this section",
        ),
      ).toBeInTheDocument(),
    );
    expect(within(cardOf("Open deals")).getByText("1")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(
      await screen.findByText("Ask a manager or owner to grant you access."),
    ).toBeInTheDocument();

    // Still working elsewhere.
    await user.click(screen.getByRole("tab", { name: "Deals" }));
    expect(await screen.findByText("Clinic fit-out")).toBeInTheDocument();
  });

  it("shows the calendar section's error with Retry in its own tab", async () => {
    const user = userEvent.setup();
    svc.listCalendarEvents
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce(eventsResult([makeEvent("e1", "Site visit")]));

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Calendar" }));

    const retry = await screen.findByRole("button", { name: "Retry" });
    await user.click(retry);

    expect(await screen.findByText("Site visit")).toBeInTheDocument();
  });
});

describe("ContactDetailPage — Timeline tab", () => {
  it("shows the contact's timeline, requesting it by contactId", async () => {
    const user = userEvent.setup();
    svc.listActivities.mockResolvedValue(
      activitiesResult([
        makeActivity("a1", "Called about the quote"),
        makeActivity("a2", "Deal created: Clinic fit-out", {
          type: "SYSTEM",
          contactId: null,
          dealId: "d1",
        }),
      ]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Timeline" }));

    expect(
      await screen.findByText("Deal created: Clinic fit-out"),
    ).toBeInTheDocument();
    expect(screen.getByText("Called about the quote")).toBeInTheDocument();

    const timelineCall = svc.listActivities.mock.calls.find(
      ([query]) => query.limit === 10,
    );
    expect(timelineCall?.[0]).toMatchObject({
      contactId: "c1",
      sortBy: "occurredAt",
      sortOrder: "desc",
    });
  });

  it("links a deal lifecycle event to its deal for a user who can read deals", async () => {
    const user = userEvent.setup();
    svc.listActivities.mockResolvedValue(
      activitiesResult([
        makeActivity("a2", "Deal created: Clinic fit-out", {
          type: "SYSTEM",
          contactId: null,
          dealId: "d1",
        }),
      ]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Timeline" }));

    const link = await screen.findByRole("link", { name: "View deal" });
    expect(link).toHaveAttribute("href", "/dashboard/deals/d1");

    await user.click(link);
    expect(await screen.findByText("Deal detail page")).toBeInTheDocument();
  });

  it("offers no deal link to a user who cannot read deals", async () => {
    const user = userEvent.setup();
    grant("activity:read");
    svc.listActivities.mockResolvedValue(
      activitiesResult([
        makeActivity("a2", "Deal created: Clinic fit-out", {
          type: "SYSTEM",
          contactId: null,
          dealId: "d1",
        }),
      ]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Timeline" }));

    expect(
      await screen.findByText("Deal created: Clinic fit-out"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View deal" }),
    ).not.toBeInTheDocument();
  });

  it("hides logging and deleting for a user without activity:create / activity:delete", async () => {
    const user = userEvent.setup();
    grant("activity:read");
    svc.listActivities.mockResolvedValue(
      activitiesResult([makeActivity("a1", "Called about the quote")]),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Timeline" }));

    expect(
      await screen.findByText("Called about the quote"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log Activity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("shows the no-access state, not the page error, when the timeline answers 403", async () => {
    const user = userEvent.setup();
    svc.listActivities.mockRejectedValue(httpError(403));

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Timeline" }));

    expect(
      await screen.findByText("Ask a manager or owner to grant you access."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Amina Hassan" }),
    ).toBeInTheDocument();
  });

  it("shows an error with Retry when the timeline fails, and Retry recovers", async () => {
    const user = userEvent.setup();
    svc.listActivities.mockImplementation(({ limit }: { limit: number }) =>
      limit === 1
        ? Promise.resolve(activitiesResult([]))
        : Promise.reject(httpError(500)),
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Timeline" }));

    const retry = await screen.findByRole("button", { name: "Retry" });
    svc.listActivities.mockResolvedValue(
      activitiesResult([makeActivity("a1", "Called about the quote")]),
    );
    await user.click(retry);

    expect(
      await screen.findByText("Called about the quote"),
    ).toBeInTheDocument();
  });
});

describe("ContactDetailPage — contact states", () => {
  it("shows the not-found state for an unknown or other-tenant contact (404)", async () => {
    svc.getContact.mockRejectedValue(httpError(404));

    renderPage();

    expect(await screen.findByText("No Patient yet")).toBeInTheDocument();
    expect(svc.listDeals).not.toHaveBeenCalled();
    expect(svc.listActivities).not.toHaveBeenCalled();
  });

  it("shows a no-access state, and loads nothing else, when the contact itself is forbidden (403)", async () => {
    svc.getContact.mockRejectedValue(httpError(403));

    renderPage();

    expect(
      await screen.findByText("You don't have access to this record"),
    ).toBeInTheDocument();
    expect(svc.listDeals).not.toHaveBeenCalled();
    expect(svc.listActivities).not.toHaveBeenCalled();
  });

  it("shows an error with Retry when the contact fails to load, and Retry recovers", async () => {
    const user = userEvent.setup();
    svc.getContact
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce(makeContact("c1"));

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("heading", { name: "Amina Hassan" }),
    ).toBeInTheDocument();
  });
});

describe("ContactDetailPage — switching contacts", () => {
  it("never shows the previous contact while the next one loads", async () => {
    const user = userEvent.setup();
    const second = deferred<Contact>();
    svc.getContact.mockImplementation((id: string) =>
      id === "c2" ? second.promise : Promise.resolve(makeContact(id)),
    );
    svc.listDeals.mockImplementation(({ contactId }: { contactId: string }) =>
      Promise.resolve(
        dealsResult([
          makeDeal(`d-${contactId}`, `Deal of ${contactId}`, { contactId }),
        ]),
      ),
    );

    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });
    await user.click(screen.getByRole("tab", { name: "Deals" }));
    expect(await screen.findByText("Deal of c1")).toBeInTheDocument();

    await user.click(screen.getByText("go to second contact"));

    // c2 is still loading: nothing of c1 may remain on screen.
    expect(screen.queryByText("Amina Hassan")).not.toBeInTheDocument();
    expect(screen.queryByText("Deal of c1")).not.toBeInTheDocument();
    expect(screen.queryByText("Prefers evening calls")).not.toBeInTheDocument();
    expect(isLoading(container)).toBe(true);

    await act(async () => second.resolve(makeContact("c2")));

    expect(
      await screen.findByRole("heading", { name: "Omar Said" }),
    ).toBeInTheDocument();
    // The new contact starts on Overview again, and shows only its own data.
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: "Deals" }));
    expect(await screen.findByText("Deal of c2")).toBeInTheDocument();
    expect(screen.queryByText("Deal of c1")).not.toBeInTheDocument();
  });

  it("ignores a slow response for the previous contact that arrives after the new contact loaded", async () => {
    const slowFirstContact = deferred<Contact>();
    svc.getContact.mockImplementation((id: string) =>
      id === "c1" ? slowFirstContact.promise : Promise.resolve(makeContact(id)),
    );
    const user = userEvent.setup();

    renderPage();
    // c1 never finished loading; the user moves on to c2.
    await user.click(screen.getByText("go to second contact"));

    expect(
      await screen.findByRole("heading", { name: "Omar Said" }),
    ).toBeInTheDocument();

    // Now c1's slow response finally lands.
    await act(async () => slowFirstContact.resolve(makeContact("c1")));

    expect(
      screen.getByRole("heading", { name: "Omar Said" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Amina Hassan")).not.toBeInTheDocument();
    expect(screen.queryByText("Prefers evening calls")).not.toBeInTheDocument();
  });

  it("ignores a slow Deals response for the previous contact once the new contact is shown", async () => {
    const slowDealsOfFirst = deferred<ReturnType<typeof dealsResult>>();
    svc.listDeals.mockImplementation(({ contactId }: { contactId: string }) =>
      contactId === "c1"
        ? slowDealsOfFirst.promise
        : Promise.resolve(
            dealsResult([makeDeal("d-c2", "Deal of c2", { contactId: "c2" })]),
          ),
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    await user.click(screen.getByText("go to second contact"));
    await screen.findByRole("heading", { name: "Omar Said" });
    await waitFor(() =>
      expect(within(cardOf("Open deals")).getByText("1")).toBeInTheDocument(),
    );

    await act(async () =>
      slowDealsOfFirst.resolve(
        dealsResult([
          makeDeal("d1", "Deal of c1", { contactId: "c1" }),
          makeDeal("d1b", "Another deal of c1", { contactId: "c1" }),
        ]),
      ),
    );

    // c2's summary is unchanged: c1's two deals did not leak in.
    expect(within(cardOf("Open deals")).getByText("1")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Deals" }));
    expect(await screen.findByText("Deal of c2")).toBeInTheDocument();
    expect(screen.queryByText("Deal of c1")).not.toBeInTheDocument();
    expect(screen.queryByText("Another deal of c1")).not.toBeInTheDocument();
  });
});

describe("ContactDetailPage — notes", () => {
  it("saves edited notes through the contact API (only the notes field) and shows the server's result", async () => {
    const user = userEvent.setup();
    svc.updateContact.mockResolvedValue(
      makeContact("c1", { notes: "Prefers mornings" }),
    );

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit notes" }));

    const box = screen.getByRole("textbox", { name: "Notes" });
    expect(box).toHaveValue("Prefers evening calls");
    await user.clear(box);
    await user.type(box, "  Prefers mornings  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(svc.updateContact).toHaveBeenCalledWith("c1", {
        notes: "Prefers mornings",
      }),
    );
    expect(await screen.findByText("Prefers mornings")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Notes" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the editor open with the draft and reports the error when saving fails", async () => {
    const user = userEvent.setup();
    svc.updateContact.mockRejectedValue(httpError(500));

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit notes" }));

    const box = screen.getByRole("textbox", { name: "Notes" });
    await user.clear(box);
    await user.type(box, "Draft that failed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(swal.errorAlert).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Draft that failed",
    );
  });

  it("discards the draft on Cancel and does not call the API", async () => {
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit notes" }));
    await user.type(screen.getByRole("textbox", { name: "Notes" }), " extra");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(svc.updateContact).not.toHaveBeenCalled();
    expect(screen.getByText("Prefers evening calls")).toBeInTheDocument();
  });

  it("says so when the contact has no notes", async () => {
    renderPage("/dashboard/contacts/c2");

    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
  });
});

describe("ContactDetailPage — Arabic / English and RTL / LTR", () => {
  it("renders left-to-right English by default", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(container.querySelector("[dir]")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  });

  it("renders right-to-left Arabic: translated tabs, summary and notes label", async () => {
    await i18n.changeLanguage("ar");
    svc.listDeals.mockResolvedValue(
      dealsResult([makeDeal("d1", "Clinic fit-out")]),
    );

    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Amina Hassan" });

    expect(container.querySelector("[dir]")).toHaveAttribute("dir", "rtl");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "نظرة عامة",
      "الخط الزمني",
      "الصفقات",
      "المهام",
      "التقويم",
    ]);
    expect(await screen.findByText("الصفقات المفتوحة")).toBeInTheDocument();
    expect(screen.getByText("ملاحظات")).toBeInTheDocument();
  });

  it("translates the empty and no-access states in Arabic too", async () => {
    await i18n.changeLanguage("ar");
    grant("deal:read");
    svc.listDeals.mockResolvedValue(dealsResult([]));
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "الصفقات" }));

    expect(
      await screen.findByText("لا توجد صفقات مرتبطة بعد."),
    ).toBeInTheDocument();
  });
});
