import { describe, expect, it } from "vitest";

import { buildXlsx, buildZip } from "../../test/xlsxFixture";
import { IMPORT_LIMITS, ImportFileError, parseImportFile } from "./parseFile";
import type { ImportFileErrorCode } from "./parseFile";

const csvFile = (content: string | Uint8Array, name = "contacts.csv") =>
  new File([content as BlobPart], name);

const bytes = (...values: number[]) => new Uint8Array(values);

/** Resolves with the error code (or "no error"). */
const codeOf = async (
  promise: Promise<unknown>,
): Promise<ImportFileErrorCode | "no error"> => {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (error instanceof ImportFileError) return error.code;
    throw error;
  }
};

describe("parseImportFile — CSV", () => {
  it("reads headers, rows and the original row numbers", async () => {
    const parsed = await parseImportFile(
      csvFile(
        "First name,Last name,Email\nAmina,Hassan,a@x.test\nOmar,Said,o@x.test\n",
      ),
    );

    expect(parsed.format).toBe("csv");
    expect(parsed.headers).toEqual(["First name", "Last name", "Email"]);
    expect(parsed.rows).toEqual([
      ["Amina", "Hassan", "a@x.test"],
      ["Omar", "Said", "o@x.test"],
    ]);
    expect(parsed.rowNumbers).toEqual([2, 3]);
    expect(parsed.delimiter).toBe(",");
    expect(parsed.encoding).toBe("utf-8");
  });

  it("strips a UTF-8 BOM so the first header is clean", async () => {
    const parsed = await parseImportFile(
      csvFile("﻿First name,Last name\nA,B\n"),
    );

    expect(parsed.headers[0]).toBe("First name");
  });

  it.each([
    ["semicolon", ";"],
    ["tab", "\t"],
  ])("detects a %s delimiter", async (_name, delimiter) => {
    const parsed = await parseImportFile(
      csvFile(`a${delimiter}b${delimiter}c\n1${delimiter}2${delimiter}3\n`),
    );

    expect(parsed.delimiter).toBe(delimiter);
    expect(parsed.rows).toEqual([["1", "2", "3"]]);
  });

  it("keeps commas and line breaks inside quoted values", async () => {
    const parsed = await parseImportFile(
      csvFile('Name,Notes\n"Hassan, Amina","line1\nline2 ""quoted"""\n'),
    );

    expect(parsed.rows).toEqual([["Hassan, Amina", 'line1\nline2 "quoted"']]);
  });

  it("reads Arabic UTF-8 text", async () => {
    const parsed = await parseImportFile(
      csvFile("الاسم الأول,الاسم الأخير\nمحمد,علي\n"),
    );

    expect(parsed.headers).toEqual(["الاسم الأول", "الاسم الأخير"]);
    expect(parsed.rows[0]).toEqual(["محمد", "علي"]);
  });

  it("reports a non-UTF-8 file instead of guessing, and reads it with the chosen encoding", async () => {
    // "محمد" saved as Windows-1256: not valid UTF-8.
    const content = new Uint8Array([
      ...new TextEncoder().encode("First name,Last name\n"),
      0xe3,
      0xcd,
      0xe3,
      0xcf,
      0x2c,
      0xda,
      0xe1,
      0xed,
      0x0a,
    ]);

    expect(await codeOf(parseImportFile(csvFile(content)))).toBe(
      "invalidEncoding",
    );

    const parsed = await parseImportFile(csvFile(content), {
      encoding: "windows-1256",
    });

    expect(parsed.encoding).toBe("windows-1256");
    expect(parsed.rows[0]).toEqual(["محمد", "علي"]);
  });

  it("reads UTF-16 text exports (BOM) without asking", async () => {
    const text = "First name\tLast name\nAmina\tHassan\n";
    const content = new Uint8Array(2 + text.length * 2);
    content[0] = 0xff;
    content[1] = 0xfe;
    [...text].forEach((char, i) => {
      content[2 + i * 2] = char.charCodeAt(0);
    });

    const parsed = await parseImportFile(csvFile(content));

    expect(parsed.headers).toEqual(["First name", "Last name"]);
    expect(parsed.rows).toEqual([["Amina", "Hassan"]]);
  });

  it("drops blank rows but keeps the real row numbers of the rest", async () => {
    const parsed = await parseImportFile(csvFile("a,b\n1,2\n,\n\n3,4\n"));

    expect(parsed.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(parsed.rowNumbers).toEqual([2, 5]);
  });

  it("ignores empty trailing columns", async () => {
    const parsed = await parseImportFile(csvFile("a,b,,\n1,2,,\n"));

    expect(parsed.headers).toEqual(["a", "b"]);
    expect(parsed.rows).toEqual([["1", "2"]]);
  });

  it("accepts exactly the maximum number of rows and columns", async () => {
    const rows = Array.from(
      { length: IMPORT_LIMITS.maxRows },
      (_, i) => `n${i}`,
    );
    const parsed = await parseImportFile(csvFile(`name\n${rows.join("\n")}\n`));
    expect(parsed.rows).toHaveLength(IMPORT_LIMITS.maxRows);

    const columns = Array.from(
      { length: IMPORT_LIMITS.maxColumns },
      (_, i) => `c${i}`,
    );
    const wide = await parseImportFile(
      csvFile(`${columns.join(",")}\n${columns.join(",")}\n`),
    );
    expect(wide.headers).toHaveLength(IMPORT_LIMITS.maxColumns);
  });
});

describe("parseImportFile — rejected files", () => {
  it.each([
    [
      "an unsupported extension",
      () => csvFile("a,b\n1,2", "contacts.txt"),
      "unsupportedType",
    ],
    [
      "a file without extension",
      () => csvFile("a,b\n1,2", "contacts"),
      "unsupportedType",
    ],
    ["a legacy .xls file", () => csvFile("x", "contacts.xls"), "legacyXls"],
    [
      "a legacy Excel file renamed to .xlsx",
      () => csvFile(bytes(0xd0, 0xcf, 0x11, 0xe0, 0, 0), "c.xlsx"),
      "legacyXls",
    ],
    [
      "a zip renamed to .csv",
      () => csvFile(buildZip([{ name: "a", data: bytes(1) }]), "c.csv"),
      "unsupportedType",
    ],
    [
      "text renamed to .xlsx",
      () => csvFile("a,b\n1,2", "c.xlsx"),
      "invalidXlsx",
    ],
    ["an empty file", () => csvFile("", "c.csv"), "empty"],
    [
      "a file with only blank lines",
      () => csvFile("\n\n,\n", "c.csv"),
      "empty",
    ],
    ["a header without data rows", () => csvFile("a,b\n", "c.csv"), "noRows"],
    [
      "an unterminated quote",
      () => csvFile('a,b\n"1,2\n3,4\n', "c.csv"),
      "invalidCsv",
    ],
  ] as const)("rejects %s", async (_name, make, expected) => {
    expect(await codeOf(parseImportFile(make()))).toBe(expected);
  });

  it("rejects a file larger than the size limit", async () => {
    const big = new File(
      [new Uint8Array(IMPORT_LIMITS.maxBytes + 1)],
      "big.csv",
    );

    expect(await codeOf(parseImportFile(big))).toBe("tooLarge");
  });

  it("rejects more rows than the limit (the whole file, nothing partial)", async () => {
    const rows = Array.from(
      { length: IMPORT_LIMITS.maxRows + 1 },
      (_, i) => `n${i}`,
    );

    expect(
      await codeOf(parseImportFile(csvFile(`name\n${rows.join("\n")}\n`))),
    ).toBe("tooManyRows");
  });

  it("rejects more columns than the limit", async () => {
    const columns = Array.from(
      { length: IMPORT_LIMITS.maxColumns + 1 },
      (_, i) => `c${i}`,
    );

    expect(
      await codeOf(
        parseImportFile(
          csvFile(`${columns.join(",")}\n${columns.join(",")}\n`),
        ),
      ),
    ).toBe("tooManyColumns");
  });
});

describe("parseImportFile — XLSX", () => {
  const xlsx = (
    sheets: Parameters<typeof buildXlsx>[0],
    name = "contacts.xlsx",
  ) => new File([buildXlsx(sheets) as BlobPart], name);

  it("reads the first sheet, converts numbers to text and reports numeric columns", async () => {
    const parsed = await parseImportFile(
      xlsx([
        {
          name: "Contacts",
          rows: [
            ["First name", "Last name", "Phone"],
            ["Amina", "Hassan", 1001234567],
            ["محمد", "علي", 1112345678],
          ],
        },
      ]),
    );

    expect(parsed.format).toBe("xlsx");
    expect(parsed.sheetName).toBe("Contacts");
    expect(parsed.headers).toEqual(["First name", "Last name", "Phone"]);
    expect(parsed.rows).toEqual([
      ["Amina", "Hassan", "1001234567"],
      ["محمد", "علي", "1112345678"],
    ]);
    expect(parsed.rowNumbers).toEqual([2, 3]);
    expect(parsed.numericColumns).toEqual([2]);
  });

  it("skips an empty first sheet and reads the first sheet that has data", async () => {
    const parsed = await parseImportFile(
      xlsx([
        { name: "Empty", rows: [[null]] },
        {
          name: "Real",
          rows: [
            ["a", "b"],
            ["1", "2"],
          ],
        },
      ]),
    );

    expect(parsed.sheetName).toBe("Real");
    expect(parsed.rows).toEqual([["1", "2"]]);
  });

  it("applies the same row limit to spreadsheets", async () => {
    const rows = Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => [
      `n${i}`,
    ]);

    expect(
      await codeOf(
        parseImportFile(xlsx([{ name: "S", rows: [["name"], ...rows] }])),
      ),
    ).toBe("tooManyRows");
  });

  it("rejects a workbook with no data and a damaged workbook", async () => {
    expect(
      await codeOf(parseImportFile(xlsx([{ name: "S", rows: [[null]] }]))),
    ).toBe("empty");

    const broken = new File(
      [buildZip([{ name: "random.txt", data: bytes(1, 2, 3) }]) as BlobPart],
      "c.xlsx",
    );
    expect(await codeOf(parseImportFile(broken))).toBe("invalidXlsx");
  });

  it("refuses an archive that claims to expand to an absurd size (zip bomb)", async () => {
    const bomb = new File(
      [
        buildZip([
          {
            name: "xl/worksheets/sheet1.xml",
            data: bytes(1),
            declaredSize: 900 * 1024 * 1024,
          },
        ]) as BlobPart,
      ],
      "bomb.xlsx",
    );

    expect(await codeOf(parseImportFile(bomb))).toBe("tooLarge");
  });
});
