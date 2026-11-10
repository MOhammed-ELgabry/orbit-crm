/* eslint-disable */
/**
 * Generates the regional reference data (countries, currencies, timezone->country
 * table) and the matching SQL INSERTs used by the migration.
 *
 * Not part of the runtime build. Run manually when ISO data needs refreshing:
 *   npm i --no-save i18n-iso-countries currency-codes country-to-currency countries-and-timezones
 *   node scripts/regional/generate-reference-data.cjs
 *
 * Sources / licences: i18n-iso-countries (MIT), currency-codes (MIT),
 * country-to-currency (MIT), countries-and-timezones (MIT), Intl/CLDR (Unicode licence).
 */
const fs = require('fs');
const path = require('path');
const iso = require('i18n-iso-countries');
const cc = require('currency-codes');
const c2cMod = require('country-to-currency');
const c2c = c2cMod.default || c2cMod;
const ct = require('countries-and-timezones');
iso.registerLocale(require('i18n-iso-countries/langs/en.json'));
iso.registerLocale(require('i18n-iso-countries/langs/ar.json'));

const outDir = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'modules',
  'regional',
  'data',
);
const sqlOut = process.argv[2] || path.join(__dirname, 'reference-data.sql');

// Currencies introduced/removed after the published currency-codes list.
const EXTRA_CURRENCIES = [
  { code: 'XCG', name: 'Caribbean Guilder', digits: 2 },
];
const REMOVED = new Set(['HRK', 'ZWL', 'SLL', 'MRO']);
// Country default-currency corrections where the packaged mapping is stale.
const COUNTRY_CURRENCY_FIX = {};

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const nameFmt = (loc) => {
  try {
    return new Intl.DisplayNames([loc], { type: 'region' });
  } catch {
    return null;
  }
};

// ---------- Currencies ----------
const isFundOrSpecial = (code) =>
  /^X/.test(code) && !['XAF', 'XOF', 'XPF', 'XCD', 'XCG'].includes(code);
const FUNDS = new Set([
  'USN',
  'USS',
  'CHE',
  'CHW',
  'BOV',
  'CLF',
  'COU',
  'MXV',
  'UYI',
  'UYW',
]);
// Only ACTIVE currencies: the set of currencies that are the current official
// currency of at least one country in the mapping (no historical / fund / metal codes).
const isoByCode = new Map(cc.data.map((c) => [c.code, c]));
const cur = new Map();
const activeCodes = new Set(Object.values(c2c).filter(Boolean));
for (const code of [...activeCodes].sort()) {
  if (REMOVED.has(code))
    throw new Error('historical currency still mapped: ' + code);
  const extra = EXTRA_CURRENCIES.find((e) => e.code === code);
  const iso4217 = isoByCode.get(code);
  if (extra)
    cur.set(code, { code, nameEn: extra.name, minorUnit: extra.digits });
  else if (iso4217 && iso4217.digits != null)
    cur.set(code, {
      code,
      nameEn: iso4217.currency,
      minorUnit: iso4217.digits,
    });
  else throw new Error('active currency missing from ISO table: ' + code);
}
const arNames = new Intl.DisplayNames(['ar'], { type: 'currency' });
const enNames = new Intl.DisplayNames(['en'], { type: 'currency' });
const sym = (code) => {
  try {
    const p = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(1);
    return p.find((x) => x.type === 'currency').value;
  } catch {
    return code;
  }
};
const currencies = [...cur.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((c) => {
    let nameAr = c.code;
    try {
      nameAr = arNames.of(c.code) || c.code;
    } catch {}
    let nameEn = c.nameEn;
    try {
      const n = enNames.of(c.code);
      if (n && n !== c.code) nameEn = n;
    } catch {}
    return {
      code: c.code,
      nameEn,
      nameAr,
      symbol: sym(c.code),
      minorUnit: c.minorUnit,
    };
  });
const curSet = new Set(currencies.map((c) => c.code));

// ---------- Countries ----------
const LOCALE_OVERRIDE = { IN: 'en-IN' }; // business default; CLDR likely-subtag would be hi-IN

// Multi-zone countries: the zone of the capital / most populous region. Owner can always change it.
const MULTI_ZONE_DEFAULT = {
  US: 'America/New_York',
  CA: 'America/Toronto',
  BR: 'America/Sao_Paulo',
  RU: 'Europe/Moscow',
  AU: 'Australia/Sydney',
  MX: 'America/Mexico_City',
  ID: 'Asia/Jakarta',
  CN: 'Asia/Shanghai',
  KZ: 'Asia/Almaty',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  CD: 'Africa/Kinshasa',
  MN: 'Asia/Ulaanbaatar',
  PT: 'Europe/Lisbon',
  ES: 'Europe/Madrid',
  EC: 'America/Guayaquil',
  NZ: 'Pacific/Auckland',
  GL: 'America/Nuuk',
  FM: 'Pacific/Pohnpei',
  KI: 'Pacific/Tarawa',
  PF: 'Pacific/Tahiti',
  UM: 'Pacific/Wake',
  MY: 'Asia/Kuala_Lumpur',
  UA: 'Europe/Kyiv',
  NL: 'Europe/Amsterdam',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  GB: 'Europe/London',
};
const allZones = ct.getAllTimezones({ deprecated: true });
function pickDefaultTimezone(code) {
  if (MULTI_ZONE_DEFAULT[code]) return MULTI_ZONE_DEFAULT[code];
  const info = ct.getCountry(code);
  const canon = info ? info.timezones : [];
  if (canon.length !== 1) return null; // none (uninhabited) or several: owner picks
  // Prefer a country-specific legacy alias (Asia/Bahrain, Asia/Kuwait, ...) when the canonical zone is shared.
  if (allZones[canon[0]] && allZones[canon[0]].countries.length === 1)
    return canon[0];
  const exclusiveAlias = Object.values(allZones).filter(
    (z) =>
      z.aliasOf === canon[0] &&
      z.countries.length === 1 &&
      z.countries[0] === code,
  );
  return exclusiveAlias.length === 1 ? exclusiveAlias[0].name : canon[0];
}
const alpha2 = Object.keys(iso.getAlpha2Codes()).sort();
const countries = [];
const warnings = [];
for (const code of alpha2) {
  const nameEn = iso.getName(code, 'en');
  const nameAr = iso.getName(code, 'ar');
  const alpha3 = iso.alpha2ToAlpha3(code);
  const numeric = iso.alpha2ToNumeric(code);
  let currency = COUNTRY_CURRENCY_FIX[code] || c2c[code] || null;
  if (currency && !curSet.has(currency)) {
    warnings.push(
      `currency ${currency} for ${code} not in currency table -> NULL`,
    );
    currency = null;
  }
  let locale = null;
  try {
    const m = new Intl.Locale('und-' + code).maximize();
    locale = `${m.language}-${m.region}`;
  } catch {}
  if (LOCALE_OVERRIDE[code]) locale = LOCALE_OVERRIDE[code];
  let nativeName = nameEn;
  if (locale) {
    const f = nameFmt(locale);
    try {
      const n = f && f.of(code);
      if (n && n !== code) nativeName = n;
    } catch {}
  }
  const defaultTimezone = pickDefaultTimezone(code);
  if (!defaultTimezone)
    warnings.push(
      `no single default timezone for ${code} (left NULL: owner picks)`,
    );
  countries.push({
    code,
    alpha3,
    numeric: String(numeric).padStart(3, '0'),
    nameEn,
    nameAr,
    nativeName,
    defaultCurrency: currency,
    defaultLocale: locale,
    defaultTimezone,
  });
}

// ---------- timezone -> countries (non-deprecated zones only) ----------
const all = ct.getAllTimezones({ deprecated: true });
const tzMap = {};
for (const [name, z] of Object.entries(all)) {
  const list = (z.countries || []).filter((c) => alpha2.includes(c)).sort();
  if (list.length) tzMap[name] = list;
}
const tzSorted = Object.fromEntries(
  Object.entries(tzMap).sort(([a], [b]) => a.localeCompare(b)),
);

// ---------- Write TS ----------
const header =
  '// AUTO-GENERATED by scripts/regional/generate-reference-data.cjs — do not edit by hand.\n';
fs.writeFileSync(
  path.join(outDir, 'currencies.data.ts'),
  header +
    `export interface CurrencySeed {\n  code: string;\n  nameEn: string;\n  nameAr: string;\n  symbol: string;\n  minorUnit: number;\n}\n\nexport const CURRENCY_SEED: readonly CurrencySeed[] = ${JSON.stringify(currencies, null, 2)};\n`,
);
fs.writeFileSync(
  path.join(outDir, 'countries.data.ts'),
  header +
    `export interface CountrySeed {\n  code: string;\n  alpha3: string;\n  numeric: string;\n  nameEn: string;\n  nameAr: string;\n  nativeName: string;\n  defaultCurrency: string | null;\n  defaultLocale: string | null;\n  defaultTimezone: string | null;\n}\n\nexport const COUNTRY_SEED: readonly CountrySeed[] = ${JSON.stringify(countries, null, 2)};\n`,
);
fs.writeFileSync(
  path.join(outDir, 'timezone-countries.data.ts'),
  header +
    `/** IANA zone -> ISO alpha-2 countries that use it (canonical zones and legacy aliases). */\nexport const TIMEZONE_COUNTRIES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(tzSorted, null, 2)};\n`,
);

// ---------- SQL ----------
let sql = '-- Reference data (generated; keep in sync with data/*.data.ts)\n';
sql +=
  'INSERT INTO "Currency" ("code","nameEn","nameAr","symbol","minorUnit","isActive","updatedAt") VALUES\n';
sql += currencies
  .map(
    (c) =>
      `(${q(c.code)},${q(c.nameEn)},${q(c.nameAr)},${q(c.symbol)},${c.minorUnit},true,CURRENT_TIMESTAMP)`,
  )
  .join(',\n');
sql += '\nON CONFLICT ("code") DO NOTHING;\n\n';
sql +=
  'INSERT INTO "Country" ("code","alpha3","numericCode","nameEn","nameAr","nativeName","defaultCurrencyCode","defaultLocale","defaultTimezone","isActive","updatedAt") VALUES\n';
sql += countries
  .map(
    (c) =>
      `(${q(c.code)},${q(c.alpha3)},${q(c.numeric)},${q(c.nameEn)},${q(c.nameAr)},${q(c.nativeName)},${c.defaultCurrency ? q(c.defaultCurrency) : 'NULL'},${c.defaultLocale ? q(c.defaultLocale) : 'NULL'},${c.defaultTimezone ? q(c.defaultTimezone) : 'NULL'},true,CURRENT_TIMESTAMP)`,
  )
  .join(',\n');
sql += '\nON CONFLICT ("code") DO NOTHING;\n';
fs.writeFileSync(sqlOut, sql);

console.log(
  JSON.stringify(
    {
      currencies: currencies.length,
      countries: countries.length,
      zones: Object.keys(tzSorted).length,
      warnings,
    },
    null,
    1,
  ),
);
