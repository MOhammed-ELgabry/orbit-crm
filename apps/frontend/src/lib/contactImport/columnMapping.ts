import type { ColumnMapping, ImportField } from "../../types/contactImport";
import { IMPORT_FIELDS } from "../../types/contactImport";

/**
 * Lower-cases, removes Arabic diacritics/tatweel, unifies Arabic letter
 * variants, and turns every non letter/digit into a space.
 */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

/** "First Name", "first_name" and "FIRSTNAME" all compare equal. */
const compact = (value: string) => normalizeHeader(value).replace(/\s+/g, "");

/** Header names (English and Arabic) typical CRM exports use for each field. */
const SYNONYMS: Record<ImportField, string[]> = {
  firstName: [
    "first name",
    "firstname",
    "given name",
    "forename",
    "fname",
    "first",
    "الاسم الأول",
    "الاسم الاول",
    "اسم أول",
    "الاسم الاول",
  ],
  lastName: [
    "last name",
    "lastname",
    "surname",
    "family name",
    "lname",
    "last",
    "الاسم الأخير",
    "الاسم الاخير",
    "اسم العائلة",
    "العائلة",
    "اللقب",
  ],
  fullName: [
    "name",
    "full name",
    "fullname",
    "contact name",
    "customer name",
    "client name",
    "patient name",
    "الاسم",
    "الاسم الكامل",
    "الاسم بالكامل",
    "اسم العميل",
    "اسم جهة الاتصال",
    "اسم المريض",
  ],
  email: [
    "email",
    "e-mail",
    "email address",
    "mail",
    "البريد",
    "البريد الإلكتروني",
    "البريد الالكتروني",
    "الايميل",
    "ايميل",
  ],
  phone: [
    "phone",
    "phone number",
    "telephone",
    "tel",
    "work phone",
    "landline",
    "الهاتف",
    "رقم الهاتف",
    "التليفون",
    "رقم التليفون",
    "تليفون",
    "هاتف",
  ],
  mobile: [
    "mobile",
    "mobile phone",
    "mobile number",
    "cell",
    "cell phone",
    "cellphone",
    "الموبايل",
    "رقم الموبايل",
    "المحمول",
    "رقم المحمول",
    "جوال",
    "الجوال",
  ],
  jobTitle: [
    "job title",
    "jobtitle",
    "title",
    "position",
    "role",
    "المسمى الوظيفي",
    "الوظيفة",
    "المنصب",
  ],
  organizationName: [
    "company",
    "company name",
    "organization",
    "organisation",
    "organization name",
    "account name",
    "account",
    "employer",
    "الشركة",
    "اسم الشركة",
    "المؤسسة",
    "جهة العمل",
    "الجهة",
  ],
  website: [
    "website",
    "web site",
    "web",
    "url",
    "site",
    "الموقع",
    "الموقع الإلكتروني",
    "الموقع الالكتروني",
  ],
  address: [
    "address",
    "street",
    "street address",
    "address line 1",
    "العنوان",
    "الشارع",
  ],
  city: ["city", "town", "المدينة"],
  state: [
    "state",
    "province",
    "region",
    "governorate",
    "المحافظة",
    "الولاية",
    "المنطقة",
  ],
  country: ["country", "الدولة", "البلد"],
  postalCode: [
    "postal code",
    "postalcode",
    "zip",
    "zip code",
    "zipcode",
    "postcode",
    "الرمز البريدي",
    "الكود البريدي",
  ],
  notes: [
    "notes",
    "note",
    "comments",
    "comment",
    "description",
    "ملاحظات",
    "ملاحظة",
    "تعليقات",
  ],
  source: ["source", "lead source", "المصدر"],
  status: ["status", "lifecycle stage", "contact status", "الحالة"],
};

const LOOKUP: Record<ImportField, Set<string>> = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [
    field,
    new Set(SYNONYMS[field].map((synonym) => compact(synonym))),
  ]),
) as Record<ImportField, Set<string>>;

/**
 * Suggests a field for each column from its header. A field is suggested for
 * at most one column (the first match). A full-name column is suggested only
 * when the file has no first/last name columns of its own.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = headers.map(() => null);
  const taken = new Set<ImportField>();

  const assign = (field: ImportField) => {
    const column = headers.findIndex(
      (header, index) =>
        mapping[index] === null && LOOKUP[field].has(compact(header)),
    );

    if (column >= 0) {
      mapping[column] = field;
      taken.add(field);
    }
  };

  for (const field of IMPORT_FIELDS) {
    if (field === "fullName") {
      continue;
    }

    assign(field);
  }

  if (!taken.has("firstName") && !taken.has("lastName")) {
    assign("fullName");
  }

  return mapping;
}

/**
 * Maps one column. A field can only be used by one column: choosing it again
 * moves it, leaving the previous column unmapped.
 */
export function setColumnField(
  mapping: ColumnMapping,
  column: number,
  field: ImportField | null,
): ColumnMapping {
  return mapping.map((current, index) => {
    if (index === column) {
      return field;
    }

    return field !== null && current === field ? null : current;
  });
}

/** Required: both first and last name, or a full-name column to split. */
export function missingRequiredFields(
  mapping: ColumnMapping,
): Array<"firstName" | "lastName"> {
  const used = new Set(mapping);

  if (used.has("fullName")) {
    return [];
  }

  const missing: Array<"firstName" | "lastName"> = [];

  if (!used.has("firstName")) missing.push("firstName");
  if (!used.has("lastName")) missing.push("lastName");

  return missing;
}

/** Display label for a header ("Column 3" when the cell was empty). */
export function columnTitle(header: string, column: number): string {
  return header.trim().length > 0 ? header : `#${column + 1}`;
}
