import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatMoneyString,
  parseMoneyInput,
  regionalLocale,
  significantDecimals,
  sumDecimalStrings,
} from "./format";

const EGP = { code: "EGP", minorUnit: 2 };
const KWD = { code: "KWD", minorUnit: 3 };
const JPY = { code: "JPY", minorUnit: 0 };
const CLF = { code: "CLF", minorUnit: 4 };

// NBSP/RLM details differ by ICU build, so compare with whitespace and
// directional marks normalised.
const norm = (s: string) => s.replace(/[\s\u00a0\u200e\u200f]+/g, " ").trim();

describe("formatMoneyString — legacy (no currency)", () => {
  it("matches the previous toLocaleString output for ordinary amounts", () => {
    expect(formatMoneyString("1234.5", { locale: "en-US" })).toBe("1,234.5");
    expect(formatMoneyString("1234.50", { locale: "en-US" })).toBe("1,234.5");
    expect(formatMoneyString("1000", { locale: "en-US" })).toBe("1,000");
    expect(formatMoneyString("0", { locale: "en-US" })).toBe("0");
    expect(formatMoneyString("0.00", { locale: "en-US" })).toBe("0");
  });

  it("returns anything that is not a plain decimal unchanged", () => {
    expect(formatMoneyString("abc")).toBe("abc");
    expect(formatMoneyString("1e3")).toBe("1e3");
    expect(formatMoneyString("")).toBe("");
  });
});

describe("formatMoneyString — exactness", () => {
  it("never loses digits beyond 2^53 or rounds", () => {
    expect(formatMoneyString("999999999999999.9999", { locale: "en-US" })).toBe(
      "999,999,999,999,999.9999",
    );
    expect(formatMoneyString("9007199254740993.01", { locale: "en-US" })).toBe(
      "9,007,199,254,740,993.01",
    );
    // Number("0.1")+... style traps: 3 decimals stay 3 decimals.
    expect(formatMoneyString("12.345", { locale: "en-US" })).toBe("12.345");
  });

  it("handles negatives", () => {
    expect(formatMoneyString("-1234.5", { locale: "en-US" })).toBe("-1,234.5");
  });
});

describe("formatMoneyString — with the base currency", () => {
  it("pads to the minor unit (0 / 2 / 3 / 4 decimals)", () => {
    expect(
      norm(formatMoneyString("1234.5", { locale: "en-US", currency: EGP })),
    ).toBe("EGP 1,234.50");
    expect(
      norm(formatMoneyString("1.5", { locale: "en-US", currency: KWD })),
    ).toBe("KWD 1.500");
    expect(
      norm(formatMoneyString("1500", { locale: "en-US", currency: JPY })),
    ).toBe("JPY 1,500");
    expect(
      norm(formatMoneyString("0.5", { locale: "en-US", currency: CLF })),
    ).toBe("CLF 0.5000");
  });

  it("keeps extra precision instead of rounding to the minor unit", () => {
    expect(
      norm(formatMoneyString("10.005", { locale: "en-US", currency: EGP })),
    ).toBe("EGP 10.005");
  });

  it("can hide the code", () => {
    expect(
      formatMoneyString("1234.5", {
        locale: "en-US",
        currency: EGP,
        showCurrency: false,
      }),
    ).toBe("1,234.50");
  });

  it("uses the locale's separators and digits (Arabic)", () => {
    const out = formatMoneyString("1234.5", { locale: "ar-EG", currency: EGP });
    // Whatever digit system ICU picks for ar-EG, integer and fraction use the same one.
    const digits = out.match(/[\d٠-٩]/g) ?? [];
    expect(digits.length).toBe(6);
    const arabicIndic = digits.every((d) => /[٠-٩]/.test(d));
    const latin = digits.every((d) => /\d/.test(d) && !/[٠-٩]/.test(d));
    expect(arabicIndic || latin).toBe(true);
    expect(out).toContain("EGP");
  });

  it("falls back safely for a currency code ICU doesn't know", () => {
    expect(
      norm(
        formatMoneyString("5", {
          locale: "en-US",
          currency: { code: "XCG", minorUnit: 2 },
        }),
      ),
    ).toMatch(/XCG/);
  });
});

describe("sumDecimalStrings", () => {
  it("is exact and keeps legacy 2-decimal output", () => {
    expect(sumDecimalStrings(["0.10", "0.20"])).toBe("0.30");
    expect(sumDecimalStrings(["10", "2.5"])).toBe("12.50");
    expect(sumDecimalStrings([])).toBe("0.00");
  });
  it("widens to 3/4 decimals without rounding", () => {
    expect(sumDecimalStrings(["1.005", "2"])).toBe("3.005");
    expect(sumDecimalStrings(["0.0001", "0.0009"])).toBe("0.0010");
  });
  it("rejects non-decimals", () => {
    expect(sumDecimalStrings(["1", "x"])).toBeNull();
    expect(sumDecimalStrings(["1e3"])).toBeNull();
  });
});

describe("significantDecimals", () => {
  it("ignores trailing zeros", () => {
    expect(significantDecimals("12.3400")).toBe(2);
    expect(significantDecimals("12")).toBe(0);
    expect(significantDecimals("0.0001")).toBe(4);
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["1250.50", "1250.50"],
    ["  42 ", "42"],
    ["007", "7"],
    ["0.5", "0.5"],
    ["١٢٣٤٫٥", "1234.5"], // Arabic-Indic digits and decimal mark
    ["۱۲۳", "123"], // Persian digits
    ["1٬234٬567", "1234567"], // Arabic thousands separator
    ["1 234 567", "1234567"],
    ["1,234", "1234"],
    ["1,234,567.89", "1234567.89"],
    ["12,5", "12.5"],
    ["0,001", "0.001"],
    ["999999999999999.9999", "999999999999999.9999"],
  ])("reads %s as %s", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "1e3",
    "-5",
    "+5",
    "1.2.3",
    "1,2,3",
    "12,34,567",
    "1.23456", // more than 4 decimals: never rounded
    "1000000000000000", // 16 integer digits
    "NaN",
    "Infinity",
    "1,",
    ".5",
  ])("rejects %j", (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });
});

describe("regionalLocale", () => {
  it("is undefined for a legacy company (browser default, as before)", () => {
    expect(regionalLocale("en", null)).toBeUndefined();
    expect(regionalLocale("ar", undefined)).toBeUndefined();
  });
  it("combines UI language with the company country", () => {
    expect(regionalLocale("ar", "EG")).toBe("ar-EG");
    expect(regionalLocale("en-US", "EG")).toBe("en-EG");
  });
  it("never throws on a garbage country", () => {
    expect(() => regionalLocale("en", "!!")).not.toThrow();
  });
});

describe("formatDateTime", () => {
  const iso = "2026-11-09T23:30:00.000Z";

  it("renders the same instant in different zones", () => {
    const cairo = formatDateTime(iso, {
      locale: "en-US",
      timeZone: "Africa/Cairo",
      dateStyle: "short",
      timeStyle: "short",
    });
    const tokyo = formatDateTime(iso, {
      locale: "en-US",
      timeZone: "Asia/Tokyo",
      dateStyle: "short",
      timeStyle: "short",
    });
    const la = formatDateTime(iso, {
      locale: "en-US",
      timeZone: "America/Los_Angeles",
      dateStyle: "short",
      timeStyle: "short",
    });

    expect(norm(cairo)).toBe("11/10/26, 1:30 AM");
    expect(norm(tokyo)).toBe("11/10/26, 8:30 AM");
    expect(norm(la)).toBe("11/9/26, 3:30 PM");
  });

  it("defaults to the viewer's zone when none is given", () => {
    expect(formatDateTime(iso, { locale: "en-US" })).toBe(
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso)),
    );
  });

  it("returns an empty string for invalid input or an unknown zone", () => {
    expect(formatDateTime("nope")).toBe("");
    expect(formatDateTime(iso, { timeZone: "Not/AZone" })).toBe("");
  });
});
