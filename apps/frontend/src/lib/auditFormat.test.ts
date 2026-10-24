import { describe, expect, it } from "vitest";

import {
  auditActionKey,
  auditEntityKey,
  auditFieldKey,
  buildAuditQuery,
  classifyChange,
  defaultAuditRange,
  formatAuditDate,
  formatAuditValue,
  resolveAuditRange,
  toLocalDateInput,
} from "./auditFormat";

const labels = { yes: "Yes", no: "No", empty: "—" };

describe("auditFormat", () => {
  describe("ranges", () => {
    it("defaults to the last 30 local days, today included", () => {
      const range = defaultAuditRange(new Date(2026, 9, 22, 15, 0));

      expect(range).toEqual({ from: "2026-09-23", to: "2026-10-22" });
    });

    it("formats a local day without going through UTC", () => {
      expect(toLocalDateInput(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    });

    it("accepts a valid range and returns instants covering the whole local days", () => {
      const result = resolveAuditRange("2026-10-01", "2026-10-02");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(new Date(result.from).getTime()).toBe(
        new Date(2026, 9, 1, 0, 0, 0, 0).getTime(),
      );
      expect(new Date(result.to).getTime()).toBe(
        new Date(2026, 9, 2, 23, 59, 59, 999).getTime(),
      );
    });

    it.each(["", "2026-13-01", "2026-02-31", "yesterday"])(
      "rejects an incomplete or impossible date (%s)",
      (value) => {
        expect(resolveAuditRange(value, "2026-10-02")).toEqual({
          ok: false,
          error: "incomplete",
        });
      },
    );

    it("rejects from after to", () => {
      expect(resolveAuditRange("2026-10-05", "2026-10-01")).toEqual({
        ok: false,
        error: "order",
      });
    });

    it("accepts 90 days and rejects 91 (same rule as the backend)", () => {
      expect(resolveAuditRange("2026-07-25", "2026-10-22").ok).toBe(true);
      expect(resolveAuditRange("2026-07-24", "2026-10-22")).toEqual({
        ok: false,
        error: "tooLong",
      });
    });
  });

  describe("buildAuditQuery", () => {
    const base = {
      from: "2026-10-01",
      to: "2026-10-02",
      actorUserId: "",
      action: "",
      entityType: "",
      q: "",
    };

    it("sends only the filters that are set, trimmed, with page and limit", () => {
      const query = buildAuditQuery(
        { ...base, action: "delete", entityType: "deal", q: "  acme  " },
        3,
      );

      expect(query).toEqual({
        page: 3,
        limit: 20,
        from: expect.any(String),
        to: expect.any(String),
        action: "delete",
        entityType: "deal",
        q: "acme",
      });
    });

    it("NEVER includes a company / tenant / identity field", () => {
      const query = buildAuditQuery({ ...base, actorUserId: "user-1" }, 1);
      const keys = Object.keys(query ?? {});

      expect(keys).not.toContain("companyId");
      expect(keys).not.toContain("tenantId");
      expect(keys).not.toContain("isOwner");
    });

    it("returns null for an invalid range (no request is made)", () => {
      expect(buildAuditQuery({ ...base, from: "" }, 1)).toBeNull();
    });
  });

  describe("formatting", () => {
    it("formats dates with Intl, never as the raw ISO string", () => {
      const text = formatAuditDate("2026-10-21T10:30:00.000Z", "en");

      expect(text).toContain("2026");
      expect(text).not.toContain("T10:30");
    });

    it("returns an empty string for an invalid date", () => {
      expect(formatAuditDate("not-a-date", "en")).toBe("");
    });

    it("builds i18n keys for snake_case actions and camelCase entities", () => {
      expect(auditActionKey("status_change")).toBe("auditActionStatusChange");
      expect(auditActionKey("password_changed")).toBe(
        "auditActionPasswordChanged",
      );
      expect(auditEntityKey("calendarEvent")).toBe("auditEntityCalendarEvent");
      expect(auditFieldKey("assignedToId")).toBe("auditFieldAssignedToId");
    });

    it("renders operational values and never an object", () => {
      expect(formatAuditValue(null, "en", labels)).toBe("—");
      expect(formatAuditValue(true, "en", labels)).toBe("Yes");
      expect(formatAuditValue(false, "en", labels)).toBe("No");
      expect(formatAuditValue("won", "en", labels)).toBe("won");
      expect(formatAuditValue({ secret: "x" }, "en", labels)).toBe("—");
      expect(
        formatAuditValue("2026-10-21T10:30:00.000Z", "en", labels),
      ).toContain("2026");
    });

    it("classifies each recorded change shape", () => {
      expect(classifyChange({ old: 1, new: 2 })).toBe("values");
      expect(classifyChange({ changed: true })).toBe("masked");
      expect(classifyChange({ added: [], removed: [] })).toBe("permissions");
    });
  });
});
