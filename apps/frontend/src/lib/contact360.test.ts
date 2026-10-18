import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Deal } from "../types/deal";
import type { Task } from "../types/task";

import {
  allDayDate,
  isDealOpen,
  isTaskOpen,
  parseDate,
  summarizeOpenDeals,
  summarizeOpenTasks,
  sumDealAmounts,
} from "./contact360";

const makeDeal = (overrides: Partial<Deal>): Deal => ({
  id: "deal-1",
  companyId: "company-1",
  title: "Deal",
  amount: "0.00",
  stage: "new",
  notes: null,
  expectedCloseDate: null,
  contactId: "contact-1",
  leadId: null,
  createdById: "user-1",
  assignedToId: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

const makeTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  companyId: "company-1",
  title: "Task",
  description: null,
  status: "todo",
  priority: "medium",
  dueDate: null,
  completedAt: null,
  contactId: "contact-1",
  leadId: null,
  dealId: null,
  createdById: "user-1",
  assignedToId: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  deletedAt: null,
  ...overrides,
});

describe("sumDealAmounts", () => {
  it("adds decimals exactly (no floating-point drift)", () => {
    // 0.1 + 0.2 === 0.30000000000000004 with floating point numbers.
    expect(sumDealAmounts(["0.10", "0.20"])).toBe("0.30");
    expect(sumDealAmounts(["1234567890.99", "0.01"])).toBe("1234567891.00");
  });

  it("handles whole numbers, one decimal place and an empty list", () => {
    expect(sumDealAmounts(["10", "2.5"])).toBe("12.50");
    expect(sumDealAmounts([])).toBe("0.00");
  });

  it("handles negative values", () => {
    expect(sumDealAmounts(["5.00", "-7.25"])).toBe("-2.25");
  });

  it("returns null, never a wrong number, when any value is not a plain decimal", () => {
    expect(sumDealAmounts(["1.00", "abc"])).toBeNull();
    expect(sumDealAmounts(["1.005"])).toBeNull();
    expect(sumDealAmounts(["1e3"])).toBeNull();
    expect(sumDealAmounts([""])).toBeNull();
  });
});

describe("open / closed", () => {
  it("treats closed_won and closed_lost deals as closed, every other stage as open", () => {
    expect(isDealOpen({ stage: "new" })).toBe(true);
    expect(isDealOpen({ stage: "negotiation" })).toBe(true);
    expect(isDealOpen({ stage: "closed_won" })).toBe(false);
    expect(isDealOpen({ stage: "closed_lost" })).toBe(false);
  });

  it("treats completed and cancelled tasks as closed, every other status as open", () => {
    expect(isTaskOpen({ status: "todo" })).toBe(true);
    expect(isTaskOpen({ status: "in_progress" })).toBe(true);
    expect(isTaskOpen({ status: "completed" })).toBe(false);
    expect(isTaskOpen({ status: "cancelled" })).toBe(false);
  });
});

describe("summarizeOpenDeals", () => {
  it("counts only open deals and sums only their amounts when the list is complete", () => {
    const summary = summarizeOpenDeals(
      [
        makeDeal({ id: "a", stage: "new", amount: "100.50" }),
        makeDeal({ id: "b", stage: "proposal", amount: "200.25" }),
        makeDeal({ id: "c", stage: "closed_won", amount: "9999.00" }),
        makeDeal({ id: "d", stage: "closed_lost", amount: "5.00" }),
      ],
      false,
    );

    expect(summary).toEqual({
      count: 2,
      isPartial: false,
      totalValue: "300.75",
    });
  });

  it("has no total when there are no open deals", () => {
    const summary = summarizeOpenDeals(
      [makeDeal({ stage: "closed_won", amount: "50.00" })],
      false,
    );

    expect(summary).toEqual({ count: 0, isPartial: false, totalValue: null });
  });

  it("marks the count partial and withholds the total when more records exist than were loaded", () => {
    const summary = summarizeOpenDeals(
      [makeDeal({ stage: "new", amount: "10.00" })],
      true,
    );

    expect(summary).toEqual({ count: 1, isPartial: true, totalValue: null });
  });
});

describe("summarizeOpenTasks", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts open tasks and flags overdue ones, ignoring closed tasks even when past due", () => {
    const summary = summarizeOpenTasks(
      [
        makeTask({ id: "a", status: "todo", dueDate: "2026-10-01T00:00:00Z" }),
        makeTask({
          id: "b",
          status: "in_progress",
          dueDate: "2026-12-01T00:00:00Z",
        }),
        makeTask({ id: "c", status: "todo", dueDate: null }),
        makeTask({
          id: "d",
          status: "completed",
          dueDate: "2026-09-01T00:00:00Z",
        }),
        makeTask({
          id: "e",
          status: "cancelled",
          dueDate: "2026-09-01T00:00:00Z",
        }),
      ],
      false,
    );

    expect(summary).toEqual({ count: 3, overdue: 1, isPartial: false });
  });

  it("is partial when the backend reports more pages", () => {
    expect(summarizeOpenTasks([makeTask({})], true).isPartial).toBe(true);
  });
});

describe("parseDate", () => {
  it("returns a Date for a valid ISO string", () => {
    expect(parseDate("2026-10-20T09:00:00.000Z")?.toISOString()).toBe(
      "2026-10-20T09:00:00.000Z",
    );
  });

  it.each([null, undefined, "", "not-a-date", "2026-13-45", "garbage"])(
    "returns null, never an Invalid Date, for %j",
    (value) => {
      expect(parseDate(value)).toBeNull();
    },
  );
});

describe("allDayDate", () => {
  // No Node typings in this project: reach process.env through a local type.
  const env = (
    globalThis as unknown as {
      process: { env: Record<string, string | undefined> };
    }
  ).process.env;
  const originalTz = env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete env.TZ;
    } else {
      env.TZ = originalTz;
    }
  });

  it.each(["America/Los_Angeles", "Europe/Berlin", "Asia/Tokyo", "UTC"])(
    "keeps the UTC calendar day whatever the viewer's timezone (%s)",
    (timeZone) => {
      env.TZ = timeZone;

      const date = allDayDate("2026-10-21T00:00:00.000Z");

      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(9);
      expect(date?.getDate()).toBe(21);
    },
  );

  it("returns null for a missing or unparsable value", () => {
    expect(allDayDate(null)).toBeNull();
    expect(allDayDate("nope")).toBeNull();
  });
});
