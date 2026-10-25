/**
 * The fixed set of interface languages Settings → Language accepts. A
 * plain validated string column (see User.language in schema.prisma)
 * rather than a Prisma enum, so adding a future language is a one-line
 * change here instead of a schema migration. Must stay in sync with the frontend's
 * i18next resource bundles (src/locales/{ar,en}).
 */
export const LANGUAGES = ['ar', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];
