import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ImportRequestRow,
  ImportResponse,
  ImportValidateResponse,
} from "../../types/contactImport";

const svc = vi.hoisted(() => ({
  validateContactImport: vi.fn(),
  importContacts: vi.fn(),
}));
const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("../../services/contactService", () => ({
  validateContactImport: svc.validateContactImport,
  importContacts: svc.importContacts,
}));
vi.mock("../../lib/contactImport/downloadFile", () => download);
vi.mock("../../lib/posthog", () => analytics);
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    company: { businessType: "medical_clinics" },
    hasPermission: (permission: string) => auth.permissions.has(permission),
  }),
}));

import "../../i18n";
import i18n from "i18next";
import ContactsImportPage from "./ContactsImportPage";

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard/contacts/import"]}>
      <Location />
      <Routes>
        <Route
          path="/dashboard/contacts/import"
          element={<ContactsImportPage />}
        />
        <Route path="/dashboard/contacts" element={<div>contacts list</div>} />
      </Routes>
    </MemoryRouter>,
  );

const csv = (content: string, name = "contacts.csv") =>
  new File([content], name, { type: "text/csv" });

/**
 * A fake server with the same rules as the real one for the cases we need:
 * `bad` in the email -> invalid, `exists@` -> already in the company,
 * `fail@` -> a server-side save failure on import.
 */
function fakeServer() {
  svc.validateContactImport.mockImplementation(
    async (rows: ImportRequestRow[]): Promise<ImportValidateResponse> => {
      const results = rows.map((row, index) => {
        const email = String(row.email ?? "");
        if (email.includes("bad")) {
          return {
            index,
            status: "invalid" as const,
            errors: [
              {
                field: "email",
                code: "isEmail",
                message: "email must be an email",
              },
            ],
            warnings: [],
          };
        }
        if (email.startsWith("exists@")) {
          return {
            index,
            status: "duplicate" as const,
            errors: [],
            warnings: [],
            duplicateReason: "existsInCompany" as const,
          };
        }
        return { index, status: "valid" as const, errors: [], warnings: [] };
      });
      return {
        rows: results,
        summary: {
          valid: results.filter((r) => r.status === "valid").length,
          duplicate: results.filter((r) => r.status === "duplicate").length,
          invalid: results.filter((r) => r.status === "invalid").length,
        },
      };
    },
  );

  svc.importContacts.mockImplementation(
    async (rows: ImportRequestRow[]): Promise<ImportResponse> => {
      const results = rows.map((row, index) => {
        const email = String(row.email ?? "");
        if (email.startsWith("fail@")) {
          return {
            index,
            outcome: "failed" as const,
            errors: [{ field: "row", code: "saveFailed", message: "x" }],
            warnings: [],
          };
        }
        return {
          index,
          outcome: "created" as const,
          errors: [],
          warnings: [],
          contactId: `c${index}`,
        };
      });
      return {
        rows: results,
        summary: {
          created: results.filter((r) => r.outcome === "created").length,
          duplicate: 0,
          invalid: 0,
          failed: results.filter((r) => r.outcome === "failed").length,
        },
      };
    },
  );
}

const user = () => userEvent.setup({ applyAccept: false });

async function upload(file: File) {
  await user().upload(screen.getByTestId("import-file-input"), file);
}

async function toReview(file: File) {
  const u = user();
  await u.upload(screen.getByTestId("import-file-input"), file);
  await u.click(
    await screen.findByRole("button", { name: "Continue to review" }),
  );
  await screen.findByText("Review before importing");
  await waitFor(() => expect(svc.validateContactImport).toHaveBeenCalled());
}

const GOOD_CSV =
  "First name,Last name,Email\n" +
  "Amina,Hassan,amina@x.test\n" +
  "Omar,Said,exists@x.test\n" +
  "Sara,Ali,bad-email\n" +
  "Mona,Adel,mona@x.test\n";

beforeEach(() => {
  vi.clearAllMocks();
  auth.permissions = new Set(["contact:create"]);
  fakeServer();
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("ContactsImportPage — access", () => {
  it("shows a no-permission message and no upload control without contact:create", () => {
    auth.permissions = new Set(["contact:read"]);
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /don't have permission/i,
    );
    expect(screen.queryByTestId("import-file-input")).not.toBeInTheDocument();
    expect(svc.validateContactImport).not.toHaveBeenCalled();
  });

  it("goes back to the contacts list", async () => {
    renderPage();
    await user().click(screen.getByRole("button", { name: /back to/i }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/contacts",
    );
  });
});

describe("ContactsImportPage — file errors", () => {
  it("rejects an unsupported file type with a clear message and does not call the API", async () => {
    renderPage();
    await upload(new File(["x"], "notes.txt", { type: "text/plain" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /unsupported file/i,
    );
    expect(svc.validateContactImport).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    renderPage();
    await upload(csv("", "empty.csv"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /file is empty/i,
    );
  });
});

describe("ContactsImportPage — mapping", () => {
  it("maps the columns automatically and lets the user continue", async () => {
    renderPage();
    await upload(csv(GOOD_CSV));

    const email = await screen.findByLabelText("Import column Email as");
    expect(email).toHaveValue("email");
    expect(screen.getByLabelText("Import column First name as")).toHaveValue(
      "firstName",
    );
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toBeEnabled();
  });

  it("blocks continuing while the last name is not mapped", async () => {
    renderPage();
    await upload(csv("First name,Email\nA,a@x.test\n"));

    expect(await screen.findByText(/Still needed/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toBeDisabled();
  });
});

describe("ContactsImportPage — review and import", () => {
  it("checks the rows with the server and shows ready / duplicate / error counts", async () => {
    renderPage();
    await toReview(csv(GOOD_CSV));

    expect(await screen.findByText("2 ready")).toBeInTheDocument();
    expect(screen.getByText("1 duplicates (skipped)")).toBeInTheDocument();
    expect(screen.getByText("1 with errors")).toBeInTheDocument();
    // Nothing is written during the dry-run.
    expect(svc.importContacts).not.toHaveBeenCalled();
  });

  it("sends only the allowed contact fields (never company or user identifiers)", async () => {
    renderPage();
    await toReview(csv(GOOD_CSV));

    const [sent] = svc.validateContactImport.mock.calls[0] as [
      ImportRequestRow[],
    ];
    expect(sent).toHaveLength(4);
    expect(sent[0]).toEqual({
      firstName: "Amina",
      lastName: "Hassan",
      email: "amina@x.test",
    });
    for (const row of sent) {
      expect(Object.keys(row)).not.toEqual(
        expect.arrayContaining(["companyId"]),
      );
      expect(row).not.toHaveProperty("createdById");
      expect(row).not.toHaveProperty("assignedToId");
    }
  });

  it("imports only the ready rows, shows the result, and reports counts only to analytics", async () => {
    renderPage();
    await toReview(csv(GOOD_CSV));
    await user().click(
      await screen.findByRole("button", { name: "Import 2 rows" }),
    );

    expect(await screen.findByText("Import finished")).toBeInTheDocument();

    expect(svc.importContacts).toHaveBeenCalledTimes(1);
    const [sent] = svc.importContacts.mock.calls[0] as [ImportRequestRow[]];
    expect(sent.map((r) => r.email)).toEqual(["amina@x.test", "mona@x.test"]);

    const created = screen.getByText("Imported").parentElement as HTMLElement;
    expect(within(created).getByText("2")).toBeInTheDocument();

    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "contacts_import_finished",
      {
        created: 2,
        skipped: 1,
        rejected: 1,
        failed: 0,
      },
    );
    expect(JSON.stringify(analytics.trackEvent.mock.calls)).not.toContain(
      "@x.test",
    );
  });

  it("splits a full-name column and re-checks a row after the user corrects the name", async () => {
    renderPage();
    const u = user();
    await u.upload(
      screen.getByTestId("import-file-input"),
      csv("Name,Email\nMohamed Ali Hassan,m@x.test\n"),
    );
    await u.click(
      await screen.findByRole("button", { name: "Continue to review" }),
    );
    await screen.findByText("Review before importing");

    const first = (await screen.findAllByLabelText("First name (2)"))[0];
    const last = screen.getAllByLabelText("Last name (2)")[0];
    expect(first).toHaveValue("Mohamed Ali");
    expect(last).toHaveValue("Hassan");

    const callsBefore = svc.validateContactImport.mock.calls.length;
    await u.clear(first);
    await u.type(first, "Mohamed");
    await u.clear(last);
    await u.type(last, "Ali Hassan");
    await u.tab();

    await waitFor(() =>
      expect(svc.validateContactImport.mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
    const lastCall = svc.validateContactImport.mock.calls.at(-1) as [
      ImportRequestRow[],
    ];
    expect(lastCall[0][0]).toMatchObject({
      firstName: "Mohamed",
      lastName: "Ali Hassan",
    });
  });

  it("flags a repeated email inside the file as a duplicate and does not send it", async () => {
    renderPage();
    await toReview(
      csv("First name,Last name,Email\nA,One,same@x.test\nB,Two,SAME@x.test\n"),
    );
    await user().click(
      await screen.findByRole("button", { name: "Import 1 rows" }),
    );
    await screen.findByText("Import finished");

    const [sent] = svc.importContacts.mock.calls[0] as [ImportRequestRow[]];
    expect(sent).toHaveLength(1);
  });

  it("sends a big file in chunks of at most 100 rows", async () => {
    const lines = ["First name,Last name,Email"];
    for (let i = 0; i < 250; i += 1) lines.push(`F${i},L${i},p${i}@x.test`);
    renderPage();
    await toReview(csv(lines.join("\n")));

    await user().click(
      await screen.findByRole("button", { name: "Import 250 rows" }),
    );
    await screen.findByText("Import finished", undefined, { timeout: 5000 });

    const sizes = svc.importContacts.mock.calls.map(
      (c) => (c[0] as unknown[]).length,
    );
    expect(sizes).toEqual([100, 100, 50]);
  });
});

describe("ContactsImportPage — results, failures and the error report", () => {
  it("lets the user download an error report that neutralizes spreadsheet formulas", async () => {
    renderPage();
    await toReview(
      csv(
        "First name,Last name,Email\n" +
          "Amina,Hassan,amina@x.test\n" +
          "=cmd|' /C calc'!A0,Bad,bad-email\n",
      ),
    );
    await user().click(
      await screen.findByRole("button", { name: "Import 1 rows" }),
    );
    await user().click(
      await screen.findByRole("button", { name: "Download error report" }),
    );

    expect(download.downloadTextFile).toHaveBeenCalledTimes(1);
    const [name, content] = download.downloadTextFile.mock.calls[0] as [
      string,
      string,
    ];
    expect(name).toBe("orbit-contacts-import-report.csv");
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain("'=cmd");
    expect(content).not.toMatch(/(^|,)=cmd/m);
    expect(content).not.toContain("amina@x.test");
  });

  it("offers to retry only the rows that failed to save", async () => {
    renderPage();
    await toReview(
      csv("First name,Last name,Email\nA,One,a@x.test\nB,Two,fail@x.test\n"),
    );
    await user().click(
      await screen.findByRole("button", { name: "Import 2 rows" }),
    );

    const retry = await screen.findByRole("button", {
      name: "Retry failed rows",
    });
    svc.importContacts.mockClear();
    await user().click(retry);

    await waitFor(() => expect(svc.importContacts).toHaveBeenCalledTimes(1));
    const [sent] = svc.importContacts.mock.calls[0] as [ImportRequestRow[]];
    expect(sent.map((r) => r.email)).toEqual(["fail@x.test"]);
  });

  it("marks the unsent rows as pending and lets the user continue when a request fails", async () => {
    svc.importContacts.mockRejectedValueOnce(new Error("network"));
    renderPage();
    await toReview(csv("First name,Last name,Email\nA,One,a@x.test\n"));
    await user().click(
      await screen.findByRole("button", { name: "Import 1 rows" }),
    );

    expect(
      await screen.findByText("Some rows could not be saved"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /retry failed rows|continue import/i,
      }),
    ).toBeInTheDocument();
  });

  it("starts over with 'Import another file'", async () => {
    renderPage();
    await toReview(csv("First name,Last name,Email\nA,One,a@x.test\n"));
    await user().click(
      await screen.findByRole("button", { name: "Import 1 rows" }),
    );
    await user().click(
      await screen.findByRole("button", { name: "Import another file" }),
    );

    expect(screen.getByTestId("import-file-input")).toBeInTheDocument();
  });
});

describe("ContactsImportPage — Arabic", () => {
  it("renders right-to-left with Arabic copy and still reads Arabic names", async () => {
    await i18n.changeLanguage("ar");
    const { container } = renderPage();

    expect(container.querySelector("[dir]")?.getAttribute("dir")).toBe("rtl");

    await upload(
      csv(
        "الاسم الأول,الاسم الأخير,البريد الإلكتروني\nأمينة,حسن,amina@x.test\n",
      ),
    );

    expect(await screen.findByLabelText(/البريد الإلكتروني/)).toHaveValue(
      "email",
    );
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();
  });
});
