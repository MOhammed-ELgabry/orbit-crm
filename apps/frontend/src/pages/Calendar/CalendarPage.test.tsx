import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "../../types/calendar";

const calendar = vi.hoisted(() => ({
  listCalendarEvents: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));
const lookups = vi.hoisted(() => ({
  listTeamMembers: vi.fn(),
  listContacts: vi.fn(),
  listLeads: vi.fn(),
  listDeals: vi.fn(),
}));
const swal = vi.hoisted(() => ({
  confirmAlert: vi.fn(),
}));
const notify = vi.hoisted(() => ({ notifyError: vi.fn() }));
const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("../../services/calendarService", () => calendar);
vi.mock("../../services/userService", () => ({
  listTeamMembers: lookups.listTeamMembers,
}));
vi.mock("../../services/contactService", () => ({
  listContacts: lookups.listContacts,
}));
vi.mock("../../services/leadService", () => ({
  listLeads: lookups.listLeads,
}));
vi.mock("../../services/dealService", () => ({
  listDeals: lookups.listDeals,
}));
vi.mock("../../lib/swal", () => swal);
vi.mock("../../lib/notify", () => notify);
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) => auth.permissions.has(permission),
  }),
}));

import "../../i18n";
import i18n from "i18next";
import CalendarPage from "./CalendarPage";

// "Today" is pinned (local time) so the initially visible month is always
// October 2026, whatever the machine's date or timezone. Only Date is
// faked: real timers keep waitFor / userEvent working normally.
const NOW = new Date(2026, 9, 15, 12, 0, 0);
const OCTOBER = new Date(2026, 9, 1);

function makeEvent(
  id: string,
  title: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    companyId: "company-1",
    title,
    description: null,
    location: null,
    startAt: new Date(2026, 9, 20, 9, 0).toISOString(),
    endAt: new Date(2026, 9, 20, 10, 0).toISOString(),
    allDay: false,
    status: "scheduled",
    contactId: null,
    leadId: null,
    dealId: null,
    createdById: "user-1",
    assignedToId: null,
    createdAt: new Date(2026, 8, 1).toISOString(),
    updatedAt: new Date(2026, 8, 1).toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

const octoberEvent = makeEvent("e-oct", "October planning");
const novemberEvent = makeEvent("e-nov", "November review", {
  startAt: new Date(2026, 10, 12, 9, 0).toISOString(),
  endAt: new Date(2026, 10, 12, 10, 0).toISOString(),
});
const decemberEvent = makeEvent("e-dec", "December retro", {
  startAt: new Date(2026, 11, 8, 9, 0).toISOString(),
  endAt: new Date(2026, 11, 8, 10, 0).toISOString(),
});

const listResult = (events: CalendarEvent[], hasMore = false) => ({
  events,
  meta: { from: "", to: "", limit: 500, hasMore },
});

/** The visible-grid window CalendarPage requests for a given month. */
function expectedRange(month: Date) {
  return {
    from: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }).toISOString(),
    to: addDays(
      endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      1,
    ).toISOString(),
  };
}

interface Deferred {
  resolve: (value: ReturnType<typeof listResult>) => void;
  reject: (reason: unknown) => void;
}

/** Makes every listCalendarEvents call pending until the test settles it. */
function deferListCalls(): Deferred[] {
  const calls: Deferred[] = [];
  calendar.listCalendarEvents.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  );
  return calls;
}

const forbiddenError = () =>
  new AxiosError("Forbidden", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 403,
  } as AxiosResponse);

const isLoading = (container: HTMLElement) =>
  container.querySelectorAll(".animate-pulse").length > 0;

// The page renders the agenda twice (a sm+ copy and a mobile copy; the
// breakpoint is pure CSS), so text assertions use the *AllBy* queries.
const seen = (text: string) => screen.queryAllByText(text).length > 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  vi.clearAllMocks();
  auth.permissions = new Set<string>();

  calendar.listCalendarEvents.mockResolvedValue(listResult([]));
  lookups.listTeamMembers.mockResolvedValue({ members: [] });
  lookups.listContacts.mockResolvedValue({ contacts: [] });
  lookups.listLeads.mockResolvedValue({ leads: [] });
  lookups.listDeals.mockResolvedValue({ deals: [] });
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en");
});

describe("CalendarPage — initial load", () => {
  it("shows the loading state, then the events of the current month", async () => {
    const calls = deferListCalls();

    const { container } = render(<CalendarPage />);

    expect(isLoading(container)).toBe(true);
    expect(seen("October planning")).toBe(false);

    await act(async () => {
      calls[0].resolve(listResult([octoberEvent]));
    });

    expect(isLoading(container)).toBe(false);
    expect(seen("October planning")).toBe(true);
    expect(
      screen.getByRole("heading", { level: 1, name: "October 2026" }),
    ).toBeInTheDocument();
    expect(calendar.listCalendarEvents).toHaveBeenCalledTimes(1);
    expect(calendar.listCalendarEvents).toHaveBeenCalledWith(
      expectedRange(OCTOBER),
    );
  });

  it("shows the empty state when the range has no events", async () => {
    render(<CalendarPage />);

    await waitFor(() => expect(seen("No events in this range.")).toBe(true));
  });

  it("shows the 'first results' notice when the API reports hasMore", async () => {
    calendar.listCalendarEvents.mockResolvedValue(
      listResult([octoberEvent], true),
    );

    render(<CalendarPage />);

    expect(
      await screen.findByText("Showing the first 500 events in this range."),
    ).toBeInTheDocument();
  });

  it("shows the no-access message (and no Retry) when the API answers 403", async () => {
    calendar.listCalendarEvents.mockRejectedValue(forbiddenError());

    render(<CalendarPage />);

    expect(
      await screen.findByText("You don't have access to Calendar"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("still lists the events when the display-name lookups fail (non-fatal)", async () => {
    const failure = new Error("lookup failed");
    lookups.listTeamMembers.mockRejectedValue(failure);
    lookups.listContacts.mockRejectedValue(failure);
    lookups.listLeads.mockRejectedValue(failure);
    lookups.listDeals.mockRejectedValue(failure);
    calendar.listCalendarEvents.mockResolvedValue(listResult([octoberEvent]));

    render(<CalendarPage />);

    await waitFor(() => expect(seen("October planning")).toBe(true));
  });

  it("resolves the assignee's name from the team-member lookup", async () => {
    lookups.listTeamMembers.mockResolvedValue({
      members: [{ id: "user-2", firstName: "Jane", lastName: "Doe" }],
    });
    calendar.listCalendarEvents.mockResolvedValue(
      listResult([makeEvent("e-1", "Demo", { assignedToId: "user-2" })]),
    );

    render(<CalendarPage />);

    await waitFor(() =>
      expect(screen.queryAllByText(/Jane Doe/).length).toBeGreaterThan(0),
    );
  });
});

describe("CalendarPage — error and Retry", () => {
  it("shows the error state, and Retry reloads the SAME range back to the events", async () => {
    const user = userEvent.setup();
    calendar.listCalendarEvents.mockRejectedValueOnce(new Error("boom"));
    const { container } = render(<CalendarPage />);

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(isLoading(container)).toBe(false);

    const calls = deferListCalls();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    // Back in the loading state while the retry is in flight.
    expect(isLoading(container)).toBe(true);
    expect(
      screen.queryByText("Something went wrong. Please try again."),
    ).toBeNull();

    await act(async () => {
      calls[0].resolve(listResult([octoberEvent]));
    });

    expect(seen("October planning")).toBe(true);
    expect(calendar.listCalendarEvents).toHaveBeenCalledTimes(2);
    expect(calendar.listCalendarEvents).toHaveBeenNthCalledWith(
      2,
      expectedRange(OCTOBER),
    );
  });

  it("returns to the error state when the retry fails too", async () => {
    const user = userEvent.setup();
    calendar.listCalendarEvents.mockRejectedValue(new Error("still down"));
    render(<CalendarPage />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(calendar.listCalendarEvents).toHaveBeenCalledTimes(2);
  });
});

describe("CalendarPage — month navigation", () => {
  it("reloads for the next and previous month with that month's range, showing loading in between", async () => {
    const user = userEvent.setup();
    calendar.listCalendarEvents.mockResolvedValueOnce(
      listResult([octoberEvent]),
    );
    const { container } = render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    const calls = deferListCalls();
    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "November 2026" }),
    ).toBeInTheDocument();
    expect(isLoading(container)).toBe(true);
    expect(seen("October planning")).toBe(false);
    expect(calendar.listCalendarEvents).toHaveBeenLastCalledWith(
      expectedRange(addMonths(OCTOBER, 1)),
    );

    await act(async () => {
      calls[0].resolve(listResult([novemberEvent]));
    });
    expect(isLoading(container)).toBe(false);
    expect(seen("November review")).toBe(true);
    expect(seen("October planning")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "September 2026" }),
    ).toBeInTheDocument();
    expect(calendar.listCalendarEvents).toHaveBeenLastCalledWith(
      expectedRange(addMonths(OCTOBER, -1)),
    );
  });

  it("does not refetch when nothing about the range changed (no reload loop)", async () => {
    render(<CalendarPage />);
    await waitFor(() => expect(seen("No events in this range.")).toBe(true));

    // Let any (wrongly) scheduled extra effect run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(calendar.listCalendarEvents).toHaveBeenCalledTimes(1);
  });
});

describe("CalendarPage — stale responses during fast navigation", () => {
  it("never shows a response for a month the user has already left", async () => {
    const user = userEvent.setup();
    const calls = deferListCalls();
    const { container } = render(<CalendarPage />);

    // October's request is still in flight when the user moves on.
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(calls).toHaveLength(2);

    await act(async () => {
      calls[0].resolve(listResult([octoberEvent]));
    });

    // The late October answer must not paint over the November view.
    expect(seen("October planning")).toBe(false);
    expect(isLoading(container)).toBe(true);
    expect(
      screen.getByRole("heading", { level: 1, name: "November 2026" }),
    ).toBeInTheDocument();

    await act(async () => {
      calls[1].resolve(listResult([novemberEvent]));
    });
    expect(seen("November review")).toBe(true);
  });

  it("keeps the newest month's events when an older response arrives last", async () => {
    const user = userEvent.setup();
    const calls = deferListCalls();
    render(<CalendarPage />);

    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(calls).toHaveLength(3);

    // Newest (December) answers first, then the stale November and October.
    await act(async () => {
      calls[2].resolve(listResult([decemberEvent]));
    });
    expect(seen("December retro")).toBe(true);

    await act(async () => {
      calls[1].resolve(listResult([novemberEvent]));
      calls[0].resolve(listResult([octoberEvent]));
    });

    expect(seen("December retro")).toBe(true);
    expect(seen("November review")).toBe(false);
    expect(seen("October planning")).toBe(false);
    expect(
      screen.getByRole("heading", { level: 1, name: "December 2026" }),
    ).toBeInTheDocument();
  });

  it("ignores a stale FAILURE once the newest month has loaded", async () => {
    const user = userEvent.setup();
    const calls = deferListCalls();
    render(<CalendarPage />);

    await user.click(screen.getByRole("button", { name: "Next month" }));

    await act(async () => {
      calls[1].resolve(listResult([novemberEvent]));
    });
    await act(async () => {
      calls[0].reject(new Error("late october failure"));
    });

    expect(seen("November review")).toBe(true);
    expect(
      screen.queryByText("Something went wrong. Please try again."),
    ).toBeNull();
  });
});

describe("CalendarPage — language, direction and permissions", () => {
  it("is left-to-right in English and right-to-left in Arabic, with translated text", async () => {
    const { container, rerender } = render(<CalendarPage />);
    await waitFor(() => expect(seen("No events in this range.")).toBe(true));
    expect(container.firstElementChild).toHaveAttribute("dir", "ltr");

    await act(async () => {
      await i18n.changeLanguage("ar");
    });
    rerender(<CalendarPage />);

    expect(container.firstElementChild).toHaveAttribute("dir", "rtl");
    expect(seen("لا توجد أحداث في هذا النطاق.")).toBe(true);
  });

  it("shows 'Add Event' only with calendar:create", async () => {
    const { unmount } = render(<CalendarPage />);
    await waitFor(() => expect(seen("No events in this range.")).toBe(true));
    expect(screen.queryByRole("button", { name: /Add Event/ })).toBeNull();
    unmount();

    auth.permissions = new Set(["calendar:create"]);
    render(<CalendarPage />);
    expect(
      await screen.findByRole("button", { name: /Add Event/ }),
    ).toBeInTheDocument();
  });

  it("offers row actions only for the permissions the user has", async () => {
    calendar.listCalendarEvents.mockResolvedValue(listResult([octoberEvent]));

    const { unmount } = render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));
    for (const name of ["Mark complete", "Cancel event", "Edit", "Delete"]) {
      expect(screen.queryAllByRole("button", { name })).toHaveLength(0);
    }
    unmount();

    auth.permissions = new Set(["calendar:update", "calendar:delete"]);
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));
    for (const name of ["Mark complete", "Cancel event", "Edit", "Delete"]) {
      expect(screen.queryAllByRole("button", { name }).length).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("CalendarPage — row actions keep working on the loaded events", () => {
  beforeEach(() => {
    auth.permissions = new Set(["calendar:update", "calendar:delete"]);
    calendar.listCalendarEvents.mockResolvedValue(listResult([octoberEvent]));
  });

  it("marks an event complete through the API and shows the server's result", async () => {
    const user = userEvent.setup();
    calendar.updateCalendarEvent.mockResolvedValue({
      ...octoberEvent,
      status: "completed",
    });
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    await user.click(
      screen.getAllByRole("button", { name: "Mark complete" })[0],
    );

    expect(calendar.updateCalendarEvent).toHaveBeenCalledWith("e-oct", {
      status: "completed",
    });
    await waitFor(() =>
      expect(screen.queryAllByText("Completed").length).toBeGreaterThan(0),
    );
  });

  it("rolls the optimistic status change back and alerts when the API fails", async () => {
    const user = userEvent.setup();
    calendar.updateCalendarEvent.mockRejectedValue(new Error("nope"));
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    await user.click(
      screen.getAllByRole("button", { name: "Cancel event" })[0],
    );

    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByText("Cancelled")).toHaveLength(0);
    expect(screen.queryAllByText("Scheduled").length).toBeGreaterThan(0);
  });

  it("deletes only after confirmation, and removes the event", async () => {
    const user = userEvent.setup();
    swal.confirmAlert.mockResolvedValue(true);
    calendar.deleteCalendarEvent.mockResolvedValue(undefined);
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith("e-oct");
    await waitFor(() => expect(seen("October planning")).toBe(false));
  });

  it("does nothing when the delete confirmation is dismissed", async () => {
    const user = userEvent.setup();
    swal.confirmAlert.mockResolvedValue(false);
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(calendar.deleteCalendarEvent).not.toHaveBeenCalled();
    expect(seen("October planning")).toBe(true);
  });

  it("keeps the event and alerts when the delete request fails", async () => {
    const user = userEvent.setup();
    swal.confirmAlert.mockResolvedValue(true);
    calendar.deleteCalendarEvent.mockRejectedValue(new Error("nope"));
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledTimes(1));
    expect(seen("October planning")).toBe(true);
  });
});

describe("CalendarPage — month view", () => {
  it("switches to the month grid and back to the agenda", async () => {
    const user = userEvent.setup();
    calendar.listCalendarEvents.mockResolvedValue(listResult([octoberEvent]));
    render(<CalendarPage />);
    await waitFor(() => expect(seen("October planning")).toBe(true));

    await user.click(screen.getByRole("button", { name: "Month" }));
    // The grid shows the event inside a day cell.
    expect(seen("October planning")).toBe(true);
    // Switching the view must not refetch.
    expect(calendar.listCalendarEvents).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Agenda" }));
    expect(seen("October planning")).toBe(true);
    expect(calendar.listCalendarEvents).toHaveBeenCalledTimes(1);
  });
});
