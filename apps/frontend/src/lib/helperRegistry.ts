/**
 * Contextual Helper registry.
 *
 * Every explained element has ONE id here; its title / body / benefit live
 * in locales/{en,ar}/helpers.ts (typed against this list, so a missing
 * translation fails the type-check). Components never carry their own help
 * text: they just reference an id through <Hint id="..."> or <HintIcon id>.
 *
 * Only elements that genuinely need explaining belong here (icon-only
 * controls, non-obvious actions, settings with side effects).
 */
export const HELPER_IDS = [
  "navDashboard",
  "navContacts",
  "navTeam",
  "navLeads",
  "navDeals",
  "navTasks",
  "navCalendar",
  "navReports",
  "navAudit",
  "navSettings",
  "logout",
  "notifications",
  "chat",
  "importContacts",
  "reportsPeriod",
  "authLanguage",
  "settingsLanguage",
  "settingsAppearance",
  "settingsNotifications",
] as const;

export type HelperId = (typeof HELPER_IDS)[number];

export interface HelperContent {
  /** The element's name. */
  title: string;
  /** What it does, in one short sentence. */
  body: string;
  /** Why someone would use it. Optional: omit when it adds nothing. */
  benefit?: string;
}

export type HelperKey = `helper_${HelperId}_${keyof HelperContent}`;

/** Flattens {id: {title, body, benefit}} into the flat keys i18next uses. */
export function flattenHelpers(
  content: Record<HelperId, HelperContent>,
): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const id of HELPER_IDS) {
    const entry = content[id];
    flat[`helper_${id}_title`] = entry.title;
    flat[`helper_${id}_body`] = entry.body;

    if (entry.benefit) {
      flat[`helper_${id}_benefit`] = entry.benefit;
    }
  }

  return flat;
}
