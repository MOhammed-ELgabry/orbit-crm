import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getPipelineSnapshot: vi.fn(),
  getLeadsOverview: vi.fn(),
  getTasksOverview: vi.fn(),
}));
const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("../../services/reportService", () => service);
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    hasPermission: (p: string) => auth.permissions.has(p),
  }),
}));
// recharts needs real layout (ResizeObserver, sizes) that jsdom lacks; the
// chart is decorative — every value is also rendered as text by the cards.
vi.mock("../../Components/Reports/ReportBarChart", () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

import "../../i18n";
import i18n from "i18next";
import ReportsPage from "./ReportsPage";

const range = {
  from: "2026-09-11",
  to: "2026-10-10",
  timezone: "Africa/Cairo",
  startUtc: "2026-09-10T21:00:00.000Z",
  endUtc: "2026-10-10T21:00:00.000Z",
};

const pipeline = {
  snapshot: {
    asOf: "2026-10-10T10:00:00.000Z",
    openDealCount: 3,
    openDealValue: "12345678901234567.89",
    stages: [
      {
        stage: "new",
        dealCount: 2,
        totalValue: "100.50",
        valueSharePercent: "50.00",
      },
      {
        stage: "negotiation",
        dealCount: 1,
        totalValue: "100.50",
        valueSharePercent: "50.00",
      },
    ],
    unrecognizedStageDealCount: 0,
  },
  createdInRange: { dealCount: 4, totalValue: "999.99" },
  range,
};

const leads = {
  totalLeads: 5,
  leadsWithLinkedDeal: { count: 2, percentOfLeads: "40.00" },
  statusDistribution: [
    { status: "new", count: 3 },
    { status: "contacted", count: 2 },
  ],
  unrecognizedStatusCount: 0,
  sources: [
    { kind: "source", value: "website", count: 3 },
    { kind: "unspecified", count: 1 },
    { kind: "other", sourceCount: 2, count: 1 },
  ],
  range,
};

const tasks = {
  totalDueInRange: 4,
  byStatus: { todo: 1, in_progress: 0, completed: 2, cancelled: 1, other: 0 },
  completionRatePercent: "66.67",
  withoutDueDate: { total: 7, open: 5 },
  range,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );

describe("ReportsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    auth.permissions = new Set(["deal:read", "lead:read", "task:read"]);
    service.getPipelineSnapshot.mockResolvedValue(pipeline);
    service.getLeadsOverview.mockResolvedValue(leads);
    service.getTasksOverview.mockResolvedValue(tasks);
  });

  it("requests each report with the browser time zone and the default 30-day range", async () => {
    renderPage();

    await waitFor(() => expect(service.getPipelineSnapshot).toHaveBeenCalled());
    const period = service.getPipelineSnapshot.mock.calls[0][0] as {
      from: string;
      to: string;
      timezone: string;
    };
    expect(period.timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(period.from < period.to).toBe(true);
    expect(service.getLeadsOverview.mock.calls[0][0]).toEqual(period);
    expect(service.getTasksOverview.mock.calls[0][0]).toEqual(period);
    // The tenant is never part of the request the page builds.
    expect(Object.keys(period).sort()).toEqual(["from", "timezone", "to"]);
  });

  it("shows loading skeletons first, then the data of all three reports", async () => {
    renderPage();

    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);

    // Pipeline: exact decimal string, no currency symbol.
    expect(
      await screen.findByText("12,345,678,901,234,567.89"),
    ).toBeInTheDocument();
    expect(screen.getByText("999.99")).toBeInTheDocument();
    expect(screen.queryByText(/[$€£]|EGP|USD/)).not.toBeInTheDocument();

    // Leads: the required label, and it is NOT called a conversion rate.
    expect(
      await screen.findByText("Leads with a linked deal"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^Lead conversion rate$/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/40\.00% of leads/)).toBeInTheDocument();
    expect(screen.getByText("Not specified")).toBeInTheDocument();
    expect(screen.getByText("Other sources (2)")).toBeInTheDocument();

    // Tasks: completion rate and the separate no-due-date figure.
    expect(await screen.findByText("66.67%")).toBeInTheDocument();
    expect(screen.getByText(/Tasks without a due date/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows a dash, not 0%, when the completion rate cannot be computed", async () => {
    service.getTasksOverview.mockResolvedValue({
      ...tasks,
      totalDueInRange: 1,
      byStatus: {
        todo: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 1,
        other: 0,
      },
      completionRatePercent: null,
    });
    renderPage();

    expect(
      await screen.findByText(/Not available: no tasks to measure/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
  });

  it("shows an empty state for a report with nothing in the period", async () => {
    service.getLeadsOverview.mockResolvedValue({
      ...leads,
      totalLeads: 0,
      leadsWithLinkedDeal: { count: 0, percentOfLeads: null },
      statusDistribution: [],
      sources: [],
    });
    renderPage();

    expect(
      await screen.findByText("Nothing to show for this period"),
    ).toBeInTheDocument();
    // The other reports are unaffected.
    expect(await screen.findByText("66.67%")).toBeInTheDocument();
  });

  it("shows an error for one failing report only, and retries on demand (once per click)", async () => {
    service.getTasksOverview.mockRejectedValueOnce(new Error("500"));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findAllByText(/Something went wrong/)).toHaveLength(1);
    expect(
      await screen.findByText("12,345,678,901,234,567.89"),
    ).toBeInTheDocument();
    // No automatic retry.
    expect(service.getTasksOverview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("66.67%")).toBeInTheDocument();
    expect(service.getTasksOverview).toHaveBeenCalledTimes(2);
  });

  it("only requests the reports the user may read (and none without any permission)", async () => {
    auth.permissions = new Set(["task:read"]);
    const { unmount } = renderPage();

    expect(await screen.findByText("66.67%")).toBeInTheDocument();
    expect(service.getTasksOverview).toHaveBeenCalledTimes(1);
    expect(service.getPipelineSnapshot).not.toHaveBeenCalled();
    expect(service.getLeadsOverview).not.toHaveBeenCalled();
    unmount();

    // Leads needs BOTH lead:read and deal:read (mirrors the endpoint).
    vi.clearAllMocks();
    auth.permissions = new Set(["lead:read"]);
    renderPage();
    expect(
      await screen.findByText("You don't have access to any reports"),
    ).toBeInTheDocument();
    expect(service.getLeadsOverview).not.toHaveBeenCalled();
  });

  it("re-queries all reports when a preset is chosen and rejects an invalid custom range locally", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("66.67%");
    const before = service.getTasksOverview.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Last 7 days" }));
    await waitFor(() =>
      expect(service.getTasksOverview.mock.calls.length).toBe(before + 1),
    );

    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    await user.clear(from);
    await user.type(from, "2026-10-31");
    await user.clear(to);
    await user.type(to, "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByText("The start date must not be after the end date."),
    ).toBeInTheDocument();
    // Rejected locally: no extra request was sent.
    expect(service.getTasksOverview.mock.calls.length).toBe(before + 1);
  });

  it("renders Arabic text for the same page", async () => {
    await i18n.changeLanguage("ar");
    renderPage();

    expect(
      await screen.findByText("عملاء محتملون لديهم صفقة مرتبطة"),
    ).toBeInTheDocument();
    expect(screen.getByText("لقطة خط المبيعات")).toBeInTheDocument();
    const tasksCard = screen
      .getByText("نظرة عامة على المهام")
      .closest("section");
    expect(tasksCard).not.toBeNull();
    expect(
      within(tasksCard as HTMLElement).getByText(/تاريخ استحقاق/),
    ).toBeInTheDocument();
  });
});
