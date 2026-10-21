import { describe, expect, it } from "vitest";

import {
  autoDetectMapping,
  columnTitle,
  missingRequiredFields,
  normalizeHeader,
  setColumnField,
} from "./columnMapping";

describe("normalizeHeader", () => {
  it("lower-cases and drops punctuation", () => {
    expect(normalizeHeader("  First_Name* ")).toBe("first name");
  });

  it("unifies Arabic letter variants and removes diacritics/tatweel", () => {
    expect(normalizeHeader("الاسم الأول")).toBe(normalizeHeader("الاسم الاول"));
    expect(normalizeHeader("البريد الإلكتروني")).toBe(
      normalizeHeader("البريد الالكتروني"),
    );
    expect(normalizeHeader("الاســم")).toBe("الاسم");
  });
});

describe("autoDetectMapping", () => {
  it("matches a typical English CRM export", () => {
    expect(
      autoDetectMapping([
        "First Name",
        "Last Name",
        "Email",
        "Phone Number",
        "Mobile Phone",
        "Company Name",
        "Job Title",
        "Lifecycle Stage",
        "Zip Code",
        "Something Else",
      ]),
    ).toEqual([
      "firstName",
      "lastName",
      "email",
      "phone",
      "mobile",
      "organizationName",
      "jobTitle",
      "status",
      "postalCode",
      null,
    ]);
  });

  it("matches Arabic headers", () => {
    expect(
      autoDetectMapping([
        "الاسم الأول",
        "الاسم الأخير",
        "البريد الإلكتروني",
        "رقم الموبايل",
        "الشركة",
        "ملاحظات",
        "المدينة",
      ]),
    ).toEqual([
      "firstName",
      "lastName",
      "email",
      "mobile",
      "organizationName",
      "notes",
      "city",
    ]);
  });

  it("maps case/format variants (FIRSTNAME, e-mail, first_name)", () => {
    expect(autoDetectMapping(["FIRSTNAME", "e-mail", "last_name"])).toEqual([
      "firstName",
      "email",
      "lastName",
    ]);
  });

  it("suggests the full-name field only when there are no first/last name columns", () => {
    expect(autoDetectMapping(["Full Name", "Email"])).toEqual([
      "fullName",
      "email",
    ]);
    expect(autoDetectMapping(["Name", "First Name", "Last Name"])).toEqual([
      null,
      "firstName",
      "lastName",
    ]);
  });

  it("uses each field for one column only (the first match wins)", () => {
    expect(autoDetectMapping(["Email", "E-mail", "Mail"])).toEqual([
      "email",
      null,
      null,
    ]);
  });

  it("returns null for columns it does not recognise", () => {
    expect(autoDetectMapping(["", "x1", "???"])).toEqual([null, null, null]);
  });
});

describe("setColumnField", () => {
  it("moves a field: choosing it again leaves the previous column unmapped", () => {
    expect(setColumnField(["email", "phone", null], 2, "email")).toEqual([
      null,
      "phone",
      "email",
    ]);
  });

  it("can clear a column", () => {
    expect(setColumnField(["email", "phone"], 0, null)).toEqual([
      null,
      "phone",
    ]);
  });

  it("does not mutate the given mapping", () => {
    const original: Array<"email" | null> = ["email", null];
    setColumnField(original, 1, "email");
    expect(original).toEqual(["email", null]);
  });
});

describe("missingRequiredFields", () => {
  it.each([
    [["firstName", "lastName"], []],
    [["fullName"], []],
    [["firstName"], ["lastName"]],
    [["lastName", "email"], ["firstName"]],
    [["email"], ["firstName", "lastName"]],
    [
      [null, null],
      ["firstName", "lastName"],
    ],
  ] as const)("%j -> missing %j", (mapping, expected) => {
    expect(missingRequiredFields([...mapping])).toEqual(expected);
  });
});

describe("columnTitle", () => {
  it("falls back to the column number for an empty header", () => {
    expect(columnTitle("Email", 0)).toBe("Email");
    expect(columnTitle("  ", 2)).toBe("#3");
  });
});
