import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const service = vi.hoisted(() => ({
  listAuditLogs: vi.fn(),
  listAuditActors: vi.fn(),
  getAuditLog: vi.fn(),
}));

vi.mock("../../services/auditService", () => service);

import AuditLogPage from "./AuditLogPage";
import {
  auditList,
  makeAuditDetail,
  makeAuditItem,
} from "../../test/auditFixtures";

const httpError = (status: number) =>
  new AxiosError("failed", undefined, undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: {},
  });

const lastListQuery = () => {
  const calls = service.listAuditLogs.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
};

describe("AuditLogPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    service.listAuditLogs.mockResolvedValue(auditList([makeAuditItem()]));
    service.listAuditActors.mockResolvedValue([
      { id: "user-1", name: "Omar Ali", status: "active" },
    ]);
    service.getAuditLog.mockResolvedValue(makeAuditDetail());
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  describe("states", () => {
    it("shows a loading state first, then the entries", async () => {
      let resolve: (v: ReturnType<typeof auditList>) => void = () => {};
      service.listAuditLogs.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      render(<AuditLogPage />);

      expect(await screen.findByRole("status")).toHaveTextContent(/loading/i);

      resolve(auditList([makeAuditItem()]));

      expect(await screen.findByText("Amina Hassan")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("renders actor, action, record type, record label and changed field names", async () => {
      render(<AuditLogPage />);

      const list = within(await screen.findByRole("list"));

      expect(list.getByText("Amina Hassan")).toBeInTheDocument();
      expect(list.getByText("Omar Ali")).toBeInTheDocument();
      expect(list.getByText("Updated")).toBeInTheDocument();
      expect(list.getByText("Contact")).toBeInTheDocument();
      expect(list.getByText("Status, Email")).toBeInTheDocument();
    });

    it("shows an empty state without filters", async () => {
      service.listAuditLogs.mockResolvedValue(auditList([]));
      render(<AuditLogPage />);

      expect(
        await screen.findByText("No activity was recorded in this period."),
      ).toBeInTheDocument();
    });

    it("shows a different empty state when filters are applied", async () => {
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");

      service.listAuditLogs.mockResolvedValue(auditList([]));
      await user.selectOptions(screen.getByLabelText("Action"), "delete");
      await user.click(screen.getByRole("button", { name: "Apply filters" }));

      expect(
        await screen.findByText("No entries match these filters."),
      ).toBeInTheDocument();
    });

    it("shows an error with a working Retry", async () => {
      const user = userEvent.setup();
      service.listAuditLogs.mockRejectedValueOnce(httpError(500));
      render(<AuditLogPage />);

      expect(
        await screen.findByText("The audit log could not be loaded."),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("Amina Hassan")).toBeInTheDocument();
    });

    it("shows the Owner-only message on a 403 and no Retry (it would never succeed)", async () => {
      service.listAuditLogs.mockRejectedValue(httpError(403));
      render(<AuditLogPage />);

      expect(
        await screen.findByText(
          "Only the account Owner can view the audit log.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Try again" }),
      ).not.toBeInTheDocument();
    });

    it("marks deleted / deactivated / unavailable actors honestly", async () => {
      service.listAuditLogs.mockResolvedValue(
        auditList([
          makeAuditItem({
            id: "a",
            actor: { id: "x", name: "Gone User", status: "deleted" },
          }),
          makeAuditItem({
            id: "b",
            actor: { id: "y", name: null, status: "unknown" },
          }),
          makeAuditItem({ id: "c", actor: null }),
        ]),
      );
      render(<AuditLogPage />);

      const list = within(await screen.findByRole("list"));

      expect(list.getByText("Gone User")).toBeInTheDocument();
      expect(list.getByText("Deleted")).toBeInTheDocument();
      expect(list.getByText("Unavailable")).toBeInTheDocument();
      expect(list.getByText("System")).toBeInTheDocument();
    });
  });

  describe("requests", () => {
    it("loads the first page with the default 30-day period and NO tenant field", async () => {
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");

      const query = lastListQuery();
      expect(query).toMatchObject({ page: 1, limit: 20 });
      expect(typeof query.from).toBe("string");
      expect(typeof query.to).toBe("string");
      expect(Object.keys(query)).not.toContain("companyId");

      const span =
        new Date(query.to as string).getTime() -
        new Date(query.from as string).getTime();
      expect(span).toBeGreaterThan(29 * 24 * 3600 * 1000);
      expect(span).toBeLessThanOrEqual(90 * 24 * 3600 * 1000);
    });

    it("sends the applied filters and goes back to page 1", async () => {
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");

      await user.selectOptions(screen.getByLabelText("Done by"), "user-1");
      await user.selectOptions(screen.getByLabelText("Record type"), "deal");
      await user.selectOptions(screen.getByLabelText("Action"), "delete");
      await user.type(screen.getByLabelText("Search"), "  acme ");
      await user.click(screen.getByRole("button", { name: "Apply filters" }));

      await waitFor(() =>
        expect(lastListQuery()).toMatchObject({
          page: 1,
          actorUserId: "user-1",
          entityType: "deal",
          action: "delete",
          q: "acme",
        }),
      );
    });

    it("does NOT request anything until Apply is pressed", async () => {
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");
      const before = service.listAuditLogs.mock.calls.length;

      await user.selectOptions(screen.getByLabelText("Action"), "delete");

      expect(service.listAuditLogs.mock.calls.length).toBe(before);
    });

    it("blocks an over-long period with a message and makes no request", async () => {
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");
      const before = service.listAuditLogs.mock.calls.length;

      const from = screen.getByLabelText("From");
      await user.clear(from);
      await user.type(from, "2020-01-01");
      await user.click(screen.getByRole("button", { name: "Apply filters" }));

      expect(
        await screen.findByText("The period cannot be longer than 90 days."),
      ).toBeInTheDocument();
      expect(service.listAuditLogs.mock.calls.length).toBe(before);
    });

    it("Reset restores the defaults and reloads", async () => {
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");

      await user.selectOptions(screen.getByLabelText("Action"), "delete");
      await user.click(screen.getByRole("button", { name: "Apply filters" }));
      await waitFor(() => expect(lastListQuery().action).toBe("delete"));

      await user.click(screen.getByRole("button", { name: "Reset" }));

      await waitFor(() => expect(lastListQuery().action).toBeUndefined());
      expect(screen.getByLabelText("Action")).toHaveValue("");
    });
  });

  describe("pagination", () => {
    it("shows page info and moves between pages", async () => {
      const user = userEvent.setup();
      service.listAuditLogs.mockResolvedValue(
        auditList([makeAuditItem()], {
          total: 45,
          totalPages: 3,
          hasNextPage: true,
        }),
      );
      render(<AuditLogPage />);

      expect(
        await screen.findByText("Page 1 of 3 · 45 entries"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

      service.listAuditLogs.mockResolvedValue(
        auditList([makeAuditItem({ id: "p2", entityLabel: "Second Page" })], {
          page: 2,
          total: 45,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        }),
      );
      await user.click(screen.getByRole("button", { name: "Next" }));

      expect(await screen.findByText("Second Page")).toBeInTheDocument();
      expect(lastListQuery().page).toBe(2);
      expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    });

    it("disables Next on the last page", async () => {
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");

      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });
  });

  describe("detail drawer", () => {
    const openDetail = async () => {
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await user.click(await screen.findByRole("button", { name: /Amina/ }));
      const dialog = await screen.findByRole("dialog");
      return { user, dialog };
    };

    it("opens a modal with the entry's details, loaded by id", async () => {
      const { dialog } = await openDetail();

      expect(
        await within(dialog).findByText("203.0.113.7"),
      ).toBeInTheDocument();
      expect(service.getAuditLog).toHaveBeenCalledWith("audit-1");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(within(dialog).getByText("Omar Ali")).toBeInTheDocument();
    });

    it("shows operational values as old → new", async () => {
      const { dialog } = await openDetail();

      expect(
        await within(dialog).findByLabelText("Previous value"),
      ).toHaveTextContent("new");
      expect(within(dialog).getByLabelText("New value")).toHaveTextContent(
        "won",
      );
    });

    it("shows personal fields as 'Changed (value not recorded)' — never a value", async () => {
      service.getAuditLog.mockResolvedValue(
        makeAuditDetail({ changes: { email: { changed: true } } }),
      );
      const { dialog } = await openDetail();

      expect(
        await within(dialog).findByText("Changed (value not recorded)"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("Email")).toBeInTheDocument();
    });

    it("shows a role's permission diff", async () => {
      service.getAuditLog.mockResolvedValue(
        makeAuditDetail({
          entityType: "role",
          changes: {
            permissions: {
              added: ["task:read"],
              removed: ["deal:read"],
            },
          },
        }),
      );
      const { dialog } = await openDetail();

      expect(await within(dialog).findByText("task:read")).toBeInTheDocument();
      expect(within(dialog).getByText("deal:read")).toBeInTheDocument();
      expect(within(dialog).getByText("Permissions added")).toBeInTheDocument();
      expect(
        within(dialog).getByText("Permissions removed"),
      ).toBeInTheDocument();
    });

    it("translates known metadata and shows the operation id", async () => {
      service.getAuditLog.mockResolvedValue(
        makeAuditDetail({
          action: "create",
          changes: null,
          correlationId: "corr-123",
          metadata: { source: "import", method: "reset_token" },
        }),
      );
      const { dialog } = await openDetail();

      expect(
        await within(dialog).findByText("Bulk import"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText("Password reset link"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("corr-123")).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "No field values were recorded for this event.",
        ),
      ).toBeInTheDocument();
    });

    it("renders hostile text as plain text, never as HTML", async () => {
      const evil = '<img src=x onerror="window.__pwned=1">';
      service.getAuditLog.mockResolvedValue(
        makeAuditDetail({
          entityLabel: evil,
          changes: { status: { old: evil, new: "<script>1</script>" } },
        }),
      );
      const { dialog } = await openDetail();

      expect(await within(dialog).findAllByText(evil)).not.toHaveLength(0);
      expect(dialog.querySelector("img")).toBeNull();
      expect(dialog.querySelector("script")).toBeNull();
      expect(
        (window as unknown as { __pwned?: number }).__pwned,
      ).toBeUndefined();
    });

    it("closes with the Close button and with Escape", async () => {
      const { user } = await openDetail();

      await user.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );

      await user.click(await screen.findByRole("button", { name: /Amina/ }));
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("returns focus to the row that opened it", async () => {
      const { user } = await openDetail();
      await user.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Amina/ })).toHaveFocus(),
      );
    });

    it("shows an error with Retry when the entry cannot be loaded", async () => {
      service.getAuditLog.mockRejectedValueOnce(httpError(500));
      const { user, dialog } = await openDetail();

      expect(
        await within(dialog).findByText("This entry could not be loaded."),
      ).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole("button", { name: "Try again" }),
      );

      expect(
        await within(dialog).findByText("203.0.113.7"),
      ).toBeInTheDocument();
    });

    it("shows 'no longer exists' on a 404", async () => {
      service.getAuditLog.mockRejectedValue(httpError(404));
      const { dialog } = await openDetail();

      expect(
        await within(dialog).findByText("This entry no longer exists."),
      ).toBeInTheDocument();
    });
  });

  describe("no sensitive data", () => {
    it("never shows anything the list API did not return (no password / token / hash fields rendered)", async () => {
      render(<AuditLogPage />);
      await screen.findByText("Amina Hassan");

      const text = screen.getByRole("list").textContent ?? "";
      expect(text).not.toMatch(/hash|token|secret/i);
    });
  });

  describe("Arabic / RTL", () => {
    beforeEach(async () => {
      await act(async () => {
        await i18n.changeLanguage("ar");
      });
    });

    it("renders translated chrome and event labels", async () => {
      render(<AuditLogPage />);

      const list = within(await screen.findByRole("list"));

      expect(list.getByText("تعديل")).toBeInTheDocument();
      expect(list.getByText("جهة اتصال")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "تطبيق الفلاتر" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("نفّذه")).toBeInTheDocument();
    });

    it("keeps user-written text direction automatic (Arabic and Latin names side by side)", async () => {
      service.listAuditLogs.mockResolvedValue(
        auditList([
          makeAuditItem({
            id: "ar-1",
            entityLabel: "أمينة حسن",
            actor: { id: "u", name: "Omar Ali", status: "active" },
          }),
        ]),
      );
      render(<AuditLogPage />);

      const label = await within(await screen.findByRole("list")).findByText(
        "أمينة حسن",
      );
      expect(label).toHaveAttribute("dir", "auto");
      expect(
        within(screen.getByRole("list")).getByText("Omar Ali"),
      ).toHaveAttribute("dir", "auto");
    });

    it("keeps ids, IPs and permission codes left-to-right inside the drawer", async () => {
      service.getAuditLog.mockResolvedValue(
        makeAuditDetail({
          entityType: "role",
          changes: { permissions: { added: ["task:read"], removed: [] } },
        }),
      );
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await user.click(await screen.findByRole("button", { name: /Amina/ }));
      const dialog = await screen.findByRole("dialog");

      expect(await within(dialog).findByText("203.0.113.7")).toHaveAttribute(
        "dir",
        "ltr",
      );
      expect(within(dialog).getByText("task:read")).toHaveAttribute(
        "dir",
        "ltr",
      );
    });

    it("shows the Arabic 'value not recorded' wording", async () => {
      service.getAuditLog.mockResolvedValue(
        makeAuditDetail({ changes: { email: { changed: true } } }),
      );
      const user = userEvent.setup();
      render(<AuditLogPage />);
      await user.click(await screen.findByRole("button", { name: /Amina/ }));

      expect(
        await screen.findByText("اتغيّر (القيمة غير مسجّلة)"),
      ).toBeInTheDocument();
    });
  });
});
