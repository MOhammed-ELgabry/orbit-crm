/**
 * Central number / money / date formatting.
 *
 * Money is a decimal STRING end to end: it is split with a regex, grouped
 * with BigInt and padded with string operations. It is never converted to a
 * JS number, never rounded, and a value that is not a plain decimal is
 * returned unchanged rather than guessed at.
 */

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

export interface MoneyCurrency {
  /** ISO 4217 code. */
  code: string;
  /** ISO 4217 minor unit: 0 (JPY), 2 (EGP), 3 (KWD), 4 (CLF). */
  minorUnit: number;
}

export interface FormatMoneyOptions {
  /** BCP-47 locale for separators/digits. Undefined = the browser default (legacy). */
  locale?: string;
  /**
   * The company base currency. Null/undefined = legacy company: no code is
   * shown and the amount keeps the digits it has (trailing zeros trimmed,
   * exactly as before the regional foundation).
   */
  currency?: MoneyCurrency | null;
  /** Show the currency code (default true when a currency is given). */
  showCurrency?: boolean;
}

function safeNumberFormat(
  locale: string | undefined,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    return new Intl.NumberFormat(undefined, options);
  }
}

/** The locale's digits 0-9 (Latin or Arabic-Indic, depending on the locale). */
function localeDigits(locale?: string): string[] {
  const nf = safeNumberFormat(locale, { useGrouping: false });
  return Array.from({ length: 10 }, (_, i) => nf.format(i));
}

function decimalSeparator(locale?: string): string {
  return (
    safeNumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === "decimal")?.value ?? "."
  );
}

/** Fraction part of a decimal string as the locale's own digits. */
function localizeDigits(digits: string, locale?: string): string {
  const table = localeDigits(locale);
  return digits.replace(/\d/g, (d) => table[Number(d)]);
}

/** Digit string of the number only (no sign, no currency). */
function formatNumberBody(
  integer: string,
  fraction: string,
  locale?: string,
): string {
  const grouped = safeNumberFormat(locale, { useGrouping: true }).format(
    BigInt(integer),
  );

  return fraction
    ? `${grouped}${decimalSeparator(locale)}${localizeDigits(fraction, locale)}`
    : grouped;
}

export function formatMoneyString(
  amount: string,
  options: FormatMoneyOptions = {},
): string {
  const match = DECIMAL.exec((amount ?? "").trim());
  if (!match) return amount;

  const [, sign, integer, rawFraction = ""] = match;
  const { locale, currency } = options;

  const trimmed = rawFraction.replace(/0+$/, "");
  // With a currency, always show at least its minor unit (1234.5 EGP ->
  // 1,234.50; 1.5 KWD -> 1.500; JPY -> no decimals) but NEVER hide or round
  // extra digits that are really there.
  const fraction = currency
    ? trimmed.padEnd(Math.max(currency.minorUnit, trimmed.length), "0")
    : trimmed;

  const body = formatNumberBody(integer, fraction, locale);
  const signed = `${sign}${body}`;

  if (!currency || options.showCurrency === false) return signed;

  try {
    // Reuse the locale's own currency pattern (code before/after, spacing)
    // but substitute our lossless number for the formatted one.
    const parts = safeNumberFormat(locale, {
      style: "currency",
      currency: currency.code,
      currencyDisplay: "code",
    }).formatToParts(1);

    let placed = false;
    let out = "";
    for (const part of parts) {
      if (["integer", "group", "decimal", "fraction"].includes(part.type)) {
        if (!placed) {
          out += signed;
          placed = true;
        }
      } else if (part.type !== "minusSign") {
        out += part.value;
      }
    }
    return placed ? out : `${signed} ${currency.code}`;
  } catch {
    return `${signed} ${currency.code}`;
  }
}

/**
 * Exact sum of decimal strings (BigInt on a common scale). The result keeps
 * at least 2 decimals (legacy output "1234.50") and more when an amount has
 * them (3/4-decimal currencies). Null if any value is not a plain decimal,
 * so callers show nothing instead of a wrong number.
 */
export function sumDecimalStrings(amounts: readonly string[]): string | null {
  const parsed: { negative: boolean; integer: string; fraction: string }[] = [];
  let scale = 2;

  for (const raw of amounts) {
    const m = DECIMAL.exec(raw.trim());
    if (!m) return null;
    const fraction = m[3] ?? "";
    scale = Math.max(scale, fraction.length);
    parsed.push({ negative: m[1] === "-", integer: m[2], fraction });
  }

  let total = 0n;
  for (const p of parsed) {
    const value = BigInt(p.integer + p.fraction.padEnd(scale, "0"));
    total += p.negative ? -value : value;
  }

  const negative = total < 0n;
  const abs = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const whole = abs.slice(0, abs.length - scale);
  const fraction = abs.slice(abs.length - scale);

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Number of fractional digits that carry a value ("12.3400" -> 2). */
export function significantDecimals(amount: string): number {
  const m = DECIMAL.exec(amount.trim());
  return m?.[3] ? m[3].replace(/0+$/, "").length : 0;
}

const MAX_INTEGER_DIGITS = 15;
const MAX_STORAGE_SCALE = 4;

/**
 * Turns what a person typed into the canonical decimal string the API takes
 * ("1234.5"), or null when it can't be read unambiguously. Accepts Arabic-
 * Indic and Persian digits, "\u066b" and "." as the decimal mark and "\u066c", spaces
 * and well-formed "," groups as grouping. A lone comma is a decimal mark
 * unless it forms a thousands group ("1,234" -> 1234, "12,5" -> 12.5).
 * Never rounds; enforces the storage limits (15 integer, 4 fraction digits).
 */
export function parseMoneyInput(raw: string): string | null {
  let text = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\u00a0\u066c]/g, "")
    .replace(/\u066b/g, ".");

  if (text.includes(",")) {
    if (text.includes(".")) {
      // "1,234.56": commas are grouping.
      if (!/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text)) return null;
      text = text.replace(/,/g, "");
    } else if (/^[1-9]\d{0,2}(,\d{3})+$/.test(text)) {
      text = text.replace(/,/g, ""); // "1,234" / "1,234,567"
    } else if (/^\d+,\d+$/.test(text)) {
      text = text.replace(",", "."); // "12,5"
    } else {
      return null;
    }
  }

  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return null;

  const integer = m[1].replace(/^0+(?=\d)/, "");
  const fraction = m[2] ?? "";
  if (integer.length > MAX_INTEGER_DIGITS) return null;
  if (fraction.length > MAX_STORAGE_SCALE) return null;

  return fraction ? `${integer}.${fraction}` : integer;
}

/**
 * Display locale: the user's UI language, specialised by the company's
 * confirmed country when that combination is a valid locale
 * (ar + EG -> ar-EG, en + EG -> en-EG). No country (legacy) -> undefined,
 * i.e. the browser default exactly as before.
 */
export function regionalLocale(
  uiLanguage: string | undefined,
  countryCode: string | null | undefined,
): string | undefined {
  if (!countryCode) return undefined;
  const language = (uiLanguage ?? "en").split("-")[0];
  const candidate = `${language}-${countryCode.toUpperCase()}`;

  try {
    const [supported] = Intl.NumberFormat.supportedLocalesOf([candidate]);
    return supported ?? language;
  } catch {
    return language;
  }
}

export interface FormatDateTimeOptions {
  locale?: string;
  /** IANA zone. Undefined = the viewer's own (browser) zone, as before. */
  timeZone?: string;
  dateStyle?: "short" | "medium" | "long";
  timeStyle?: "short" | "medium";
}

/** Locale + zone aware date/time; "" for an invalid date or unknown zone. */
export function formatDateTime(
  value: string | Date,
  options: FormatDateTimeOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(options.locale, {
      dateStyle: options.dateStyle ?? "medium",
      timeStyle: options.timeStyle ?? "short",
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
  } catch {
    return "";
  }
}
