import { describe, expect, it } from "vitest";

import type {
  DerivedImportRow,
  ImportRowDraft,
  ImportRowState,
  ParsedImportFile,
} from "../../types/contactImport";
import {
  buildErrorReportCsv,
  buildImportRows,
  chunkRows,
  countRows,
  createRowState,
  deriveRows,
  escapeCsvCell,
  splitFullName,
  toRequestRow,
  updateDraftName,
} from "./importRows";

const parsedFile = (
  headers: string[],
  rows: string[][],
  rowNumbers = rows.map((_, i) => i + 2),
): ParsedImportFile => ({
  fileName: "f.csv",
  format: "csv",
  headers,
  rows,
  rowNumbers,
  numericColumns: [],
});

const draft = (
  rowNumber: number,
  values: ImportRowDraft["values"],
): ImportRowDraft => ({ rowNumber, values, nameFromFullName: false });

const state = (
  rowNumber: number,
  email: string | undefined,
  patch: Partial<ImportRowState> = {},
): ImportRowState => ({
  ...createRowState(
    draft(rowNumber, {
      firstName: "A",
      lastName: "B",
      ...(email ? { email } : {}),
    }),
  ),
  check: "valid",
  ...patch,
});

describe("splitFullName", () => {
  it("lastWord: the last word is the last name", () => {
    expect(splitFullName("Mohamed Ali Hassan", "lastWord")).toEqual({
      firstName: "Mohamed Ali",
      lastName: "Hassan",
    });
  });

  it("firstWord: the first word is the first name", () => {
    expect(splitFullName("Mohamed Ali Hassan", "firstWord")).toEqual({
      firstName: "Mohamed",
      lastName: "Ali Hassan",
    });
  });

  it("handles two words, extra spaces and Arabic names", () => {
    expect(splitFullName("  Amina   Hassan ", "lastWord")).toEqual({
      firstName: "Amina",
      lastName: "Hassan",
    });
    expect(splitFullName("محمد علي حسن", "lastWord")).toEqual({
      firstName: "محمد علي",
      lastName: "حسن",
    });
  });

  it("puts a single word in the first name and leaves the last name empty (never invents one)", () => {
    expect(splitFullName("Madonna", "lastWord")).toEqual({
      firstName: "Madonna",
      lastName: "",
    });
    expect(splitFullName("   ", "lastWord")).toEqual({
      firstName: "",
      lastName: "",
    });
  });
});

describe("buildImportRows", () => {
  it("maps columns to fields, trims, skips empty cells and keeps the file row numbers", () => {
    const parsed = parsedFile(
      ["First", "Last", "Mail", "Skip", "Tel"],
      [
        ["  Amina ", "Hassan", "a@x.test", "ignored", ""],
        ["Omar", "Said", "", "ignored", "+20100"],
      ],
      [2, 7],
    );

    const rows = buildImportRows(
      parsed,
      ["firstName", "lastName", "email", null, "phone"],
      { splitMode: "lastWord" },
    );

    expect(rows).toEqual([
      {
        rowNumber: 2,
        values: { firstName: "Amina", lastName: "Hassan", email: "a@x.test" },
        nameFromFullName: false,
        fullName: undefined,
      },
      {
        rowNumber: 7,
        values: { firstName: "Omar", lastName: "Said", phone: "+20100" },
        nameFromFullName: false,
        fullName: undefined,
      },
    ]);
  });

  it("normalizes a status written in another letter case, and leaves unknown values for the server to reject", () => {
    const rows = buildImportRows(
      parsedFile(
        ["f", "l", "s"],
        [
          ["A", "B", "Active"],
          ["C", "D", "VIP"],
        ],
      ),
      ["firstName", "lastName", "status"],
      { splitMode: "lastWord" },
    );

    expect(rows[0].values.status).toBe("active");
    expect(rows[1].values.status).toBe("VIP");
  });

  it("splits a full-name column and marks the row so the user can correct it", () => {
    const rows = buildImportRows(
      parsedFile(["Name", "Email"], [["Mohamed Ali Hassan", "m@x.test"]]),
      ["fullName", "email"],
      { splitMode: "firstWord" },
    );

    expect(rows[0]).toMatchObject({
      values: {
        firstName: "Mohamed",
        lastName: "Ali Hassan",
        email: "m@x.test",
      },
      nameFromFullName: true,
      fullName: "Mohamed Ali Hassan",
    });
  });

  it("never overwrites first/last name values that exist in the file", () => {
    const rows = buildImportRows(
      parsedFile(
        ["First", "Last", "Name"],
        [
          ["Amina", "Hassan", "Somebody Else"],
          ["", "", "Omar Said"],
          ["Only", "", "Ignored Name"],
        ],
      ),
      ["firstName", "lastName", "fullName"],
      { splitMode: "lastWord" },
    );

    expect(rows[0].values).toEqual({ firstName: "Amina", lastName: "Hassan" });
    expect(rows[0].nameFromFullName).toBe(false);
    // Both empty in this row: the full name fills them (and the row is marked).
    expect(rows[1].values).toEqual({ firstName: "Omar", lastName: "Said" });
    expect(rows[1].nameFromFullName).toBe(true);
    // One of them exists: nothing is touched.
    expect(rows[2].values).toEqual({ firstName: "Only" });
    expect(rows[2].nameFromFullName).toBe(false);
  });
});

describe("toRequestRow / updateDraftName", () => {
  it("sends only non-empty values", () => {
    expect(
      toRequestRow(
        draft(2, { firstName: " A ", lastName: "", email: "e@x.test" }),
      ),
    ).toEqual({ firstName: "A", email: "e@x.test" });
  });

  it("applies a manual name correction without touching other values", () => {
    const original = draft(2, {
      firstName: "Mohamed Ali",
      lastName: "Hassan",
      email: "e@x.test",
    });
    const updated = updateDraftName(original, {
      lastName: " Ali Hassan ",
      firstName: "Mohamed",
    });

    expect(updated.values).toEqual({
      firstName: "Mohamed",
      lastName: "Ali Hassan",
      email: "e@x.test",
    });
    expect(original.values.lastName).toBe("Hassan");
  });

  it("removes a name that was cleared", () => {
    expect(
      updateDraftName(draft(2, { firstName: "A", lastName: "B" }), {
        lastName: "  ",
      }).values,
    ).toEqual({ firstName: "A" });
  });
});

describe("deriveRows", () => {
  it("flags a repeated email (any letter case) as a duplicate of the first row that uses it", () => {
    const rows = deriveRows([
      state(2, "a@x.test"),
      state(3, "A@X.test"),
      state(4, "b@x.test"),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(["valid", "duplicate", "valid"]);
    expect(rows[1]).toMatchObject({
      duplicateReason: "duplicateInFile",
      duplicateOfRow: 2,
    });
  });

  it("does not let an invalid row claim an email", () => {
    const rows = deriveRows([
      state(2, "a@x.test", {
        check: "invalid",
        checkIssues: [{ field: "firstName", code: "isNotEmpty", message: "m" }],
      }),
      state(3, "a@x.test"),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(["invalid", "valid"]);
  });

  it("ignores the server's in-request duplicate verdict and decides from the current rows (stale-proof after an edit)", () => {
    const rows = deriveRows([
      state(2, "a@x.test"),
      state(3, "other@x.test", {
        check: "duplicate",
        checkDuplicateReason: "duplicateInBatch",
      }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(["valid", "valid"]);
  });

  it("keeps the server's verdict for an email that already exists in the company", () => {
    const rows = deriveRows([
      state(2, "a@x.test", {
        check: "duplicate",
        checkDuplicateReason: "existsInCompany",
      }),
    ]);

    expect(rows[0]).toMatchObject({
      kind: "duplicate",
      duplicateReason: "existsInCompany",
    });
  });

  it("an import outcome wins over the dry-run, and an imported email still blocks later rows", () => {
    const rows = deriveRows([
      state(2, "a@x.test", { outcome: "created" }),
      state(3, "a@x.test"),
      state(4, "c@x.test", {
        outcome: "failed",
        outcomeIssues: [{ field: "row", code: "saveFailed", message: "m" }],
      }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(["created", "duplicate", "failed"]);
    expect(rows[2].issues[0].code).toBe("saveFailed");
  });

  it("rows without an email are never duplicates of each other", () => {
    expect(
      deriveRows([state(2, undefined), state(3, undefined)]).map((r) => r.kind),
    ).toEqual(["valid", "valid"]);
  });
});

describe("countRows", () => {
  it("summarizes every kind, and the parts add up to the total", () => {
    const counts = countRows(
      deriveRows([
        state(2, "a@x.test", { outcome: "created" }),
        state(3, "b@x.test", {
          check: "duplicate",
          checkDuplicateReason: "existsInCompany",
        }),
        state(4, "c@x.test", { check: "invalid" }),
        state(5, "d@x.test", { outcome: "failed" }),
        state(6, "e@x.test"),
        state(7, "f@x.test", { check: "unchecked" }),
      ]),
    );

    expect(counts).toEqual({
      total: 6,
      created: 1,
      skipped: 1,
      rejected: 1,
      failed: 1,
      pending: 2,
    });
    expect(
      counts.created +
        counts.skipped +
        counts.rejected +
        counts.failed +
        counts.pending,
    ).toBe(counts.total);
  });
});

describe("chunkRows", () => {
  it("splits by row count", () => {
    const chunks = chunkRows(Array.from({ length: 250 }, (_, i) => ({ i })));

    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("splits by serialized size, counting Arabic as multi-byte", () => {
    const row = { notes: "ا".repeat(1000) }; // ~2 KB as UTF-8
    const chunks = chunkRows(
      Array.from({ length: 10 }, () => row),
      { maxRows: 100, maxBytes: 5000 },
    );

    expect(chunks.every((c) => c.length <= 2)).toBe(true);
    expect(chunks.flat()).toHaveLength(10);
  });

  it("puts an oversized single item alone in its own chunk and keeps the order", () => {
    const items = [{ n: 1 }, { n: 2, pad: "x".repeat(500) }, { n: 3 }];
    const chunks = chunkRows(items, { maxRows: 100, maxBytes: 100 });

    expect(chunks.flat().map((i) => i.n)).toEqual([1, 2, 3]);
    expect(chunks.some((c) => c.length === 1 && c[0].n === 2)).toBe(true);
  });

  it("returns no chunks for no items", () => {
    expect(chunkRows([])).toEqual([]);
  });
});

describe("escapeCsvCell (CSV formula injection)", () => {
  it.each([
    ["=SUM(A1:A9)", "'=SUM(A1:A9)"],
    ["+201001234567", "'+201001234567"],
    ["-1", "'-1"],
    ["@cmd", "'@cmd"],
    ["\tTabbed", "'\tTabbed"],
    ["\rReturn", '"\'\rReturn"'],
    ["plain", "plain"],
    ["a=b", "a=b"],
  ])("%j -> %j", (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("quotes values with commas, quotes and line breaks", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("l1\nl2")).toBe('"l1\nl2"');
  });

  it("guards a formula even when it also needs quoting", () => {
    expect(escapeCsvCell('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
  });
});

describe("buildErrorReportCsv", () => {
  const parsed = parsedFile(
    ["Name", "Email"],
    [
      ["Amina", "a@x.test"],
      ["=cmd|' /C calc'!A0", "bad"],
      ["Omar", "dup@x.test"],
      ["Sara", "ok@x.test"],
    ],
    [2, 3, 5, 6],
  );

  const row = (
    rowNumber: number,
    kind: DerivedImportRow["kind"],
  ): DerivedImportRow => ({
    rowNumber,
    draft: draft(rowNumber, {}),
    kind,
    issues: [],
    warnings: [],
  });

  const csv = buildErrorReportCsv(
    parsed,
    [
      row(2, "created"),
      row(3, "invalid"),
      row(5, "duplicate"),
      row(6, "valid"),
    ],
    (r) => ({
      status: `status-${r.kind}`,
      reason: `reason ${r.rowNumber}, with comma`,
    }),
    { row: "Row", status: "Status", reason: "Reason" },
  );

  it("starts with a UTF-8 BOM and the original headers plus Row/Status/Reason", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")[0]).toBe("Name,Email,Row,Status,Reason");
  });

  it("lists only rows that were not imported (invalid, duplicate, failed), with their original cells", () => {
    const lines = csv.slice(1).trimEnd().split("\r\n");

    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe(
      'Omar,dup@x.test,5,status-duplicate,"reason 5, with comma"',
    );
  });

  it("neutralizes formulas coming from the user's file", () => {
    const lines = csv.slice(1).trimEnd().split("\r\n");

    expect(lines[1].startsWith("'=cmd")).toBe(true);
  });
});
