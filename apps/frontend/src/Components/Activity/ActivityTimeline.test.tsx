import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "../../types/activity";

const svc = vi.hoisted(() => ({
  listActivities: vi.fn(),
  createActivity: vi.fn(),
  deleteActivity: vi.fn(),
}));

vi.mock("../../services/activityService", () => svc);
vi.mock("../../lib/swal", () => ({
  confirmAlert: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../lib/notify", () => ({ notifyError: vi.fn() }));

import "../../i18n";
import ActivityTimeline from "./ActivityTimeline";

const makeActivity = (id: string, title: string): Activity => ({
  id,
  companyId: "company-1",
  type: "NOTE",
  title,
  description: null,
  occurredAt: new Date(2026, 9, 14, 9, 0).toISOString(),
  createdById: "user-1",
  contactId: null,
  dealId: null,
  taskId: null,
  calendarEventId: null,
  createdAt: "2026-10-14T09:00:00.000Z",
  updatedAt: "2026-10-14T09:00:00.000Z",
  deletedAt: null,
});

const result = (activities: Activity[]) => ({
  activities,
  meta: {
    page: 1,
    limit: 10,
    total: activities.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ActivityTimeline", () => {
  it("keeps showing the delete button by default (existing behaviour, e.g. the dashboard feed)", async () => {
    svc.listActivities.mockResolvedValue(result([makeActivity("a1", "Note")]));

    render(<ActivityTimeline canCreate={false} />);

    expect(await screen.findByText("Note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides the delete button when canDelete is false", async () => {
    svc.listActivities.mockResolvedValue(result([makeActivity("a1", "Note")]));

    render(<ActivityTimeline canCreate={false} canDelete={false} />);

    expect(await screen.findByText("Note")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("renders a link only for the rows linkFor returns one for", async () => {
    svc.listActivities.mockResolvedValue(
      result([makeActivity("a1", "Linked"), makeActivity("a2", "Plain")]),
    );

    render(
      <MemoryRouter>
        <ActivityTimeline
          canCreate={false}
          linkFor={(activity) =>
            activity.id === "a1"
              ? { to: "/dashboard/deals/d1", label: "View deal" }
              : null
          }
        />
      </MemoryRouter>,
    );

    await screen.findByText("Plain");
    const links = screen.getAllByRole("link", { name: "View deal" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/deals/d1");
  });

  it("never lets a slow response for the previous contact overwrite the new contact's timeline", async () => {
    const slowFirst = deferred<ReturnType<typeof result>>();
    svc.listActivities.mockImplementation(
      ({ contactId }: { contactId: string }) =>
        contactId === "c1"
          ? slowFirst.promise
          : Promise.resolve(result([makeActivity("a2", "Activity of c2")])),
    );

    const { rerender } = render(
      <ActivityTimeline contactId="c1" canCreate={false} />,
    );
    rerender(<ActivityTimeline contactId="c2" canCreate={false} />);

    expect(await screen.findByText("Activity of c2")).toBeInTheDocument();

    await act(async () =>
      slowFirst.resolve(result([makeActivity("a1", "Activity of c1")])),
    );

    expect(screen.getByText("Activity of c2")).toBeInTheDocument();
    expect(screen.queryByText("Activity of c1")).not.toBeInTheDocument();
  });

  it("still deletes through the API after confirmation", async () => {
    const user = userEvent.setup();
    svc.listActivities.mockResolvedValue(result([makeActivity("a1", "Note")]));
    svc.deleteActivity.mockResolvedValue(undefined);

    render(<ActivityTimeline canCreate={false} />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(svc.deleteActivity).toHaveBeenCalledWith("a1");
  });
});
