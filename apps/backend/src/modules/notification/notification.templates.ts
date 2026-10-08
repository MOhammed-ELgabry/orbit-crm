import {
  MAX_TITLE_LENGTH,
  type NotificationEntityType,
  type NotificationType,
} from './constants/notification.constants';

/**
 * Single backend catalog for every piece of notification text.
 *
 * What is stored in the database is `type + params` (never rendered
 * text). The inbox API, the email and the push payload are all rendered
 * from this one catalog, in the RECIPIENT's `User.language`, so the three
 * channels can never disagree and a wording change never needs a
 * data migration.
 */

export type NotificationLanguage = 'ar' | 'en';

export interface RenderContext {
  /** Actor display name; empty/undefined falls back to a generic label. */
  actorName?: string | null;
  /** Entity title snapshot from Notification.params. */
  title?: string | null;
  /** ISO date string (calendar events). */
  startAt?: string | null;
}

export interface RenderedNotification {
  title: string;
  body: string;
}

export function resolveLanguage(
  language: string | null | undefined,
): NotificationLanguage {
  return language === 'ar' ? 'ar' : 'en';
}

// ---------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------

// C0/C1 control characters (incl. CR/LF/TAB), DEL, and the Unicode
// line/paragraph separators + bidi override/isolate controls that can be
// used to visually spoof text.
const UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/**
 * Makes user-controlled text (task titles, names...) safe to embed in a
 * notification: no control characters, no CR/LF (header/log injection),
 * collapsed whitespace, truncated.
 */
export function sanitizeText(
  input: unknown,
  maxLength: number = MAX_TITLE_LENGTH,
): string {
  if (typeof input !== 'string') return '';

  const cleaned = input.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) return cleaned;

  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * In-app path for a notification. Never stored: generated from an
 * allowlist of entity types every time, so a poisoned row can never turn
 * into an open redirect or a `javascript:` link. Always starts with
 * `/dashboard`.
 */
export function buildNotificationPath(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  if (!entityType) return null;

  const id = entityId && SAFE_ID.test(entityId) ? entityId : null;

  switch (entityType as NotificationEntityType) {
    case 'task':
      return '/dashboard/tasks';
    case 'deal':
      return id
        ? `/dashboard/deals/${encodeURIComponent(id)}`
        : '/dashboard/deals';
    case 'lead':
      return id
        ? `/dashboard/leads/${encodeURIComponent(id)}`
        : '/dashboard/leads';
    case 'calendar_event':
      return '/dashboard/calendar';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------

const FALLBACK_ACTOR: Record<NotificationLanguage, string> = {
  en: 'Someone',
  ar: 'أحد الزملاء',
};

const FALLBACK_TITLE: Record<NotificationLanguage, string> = {
  en: 'Untitled',
  ar: 'بدون عنوان',
};

interface CatalogEntry {
  title: string;
  /** `{actor}`, `{title}` and `{when}` are substituted. */
  body: string;
}

const CATALOG: Record<
  NotificationType,
  Record<NotificationLanguage, CatalogEntry>
> = {
  'task.assigned': {
    en: {
      title: 'New task assigned to you',
      body: '{actor} assigned you the task "{title}".',
    },
    ar: {
      title: 'تم إسناد مهمة جديدة إليك',
      body: 'أسند إليك {actor} المهمة "{title}".',
    },
  },
  'task.completed': {
    en: {
      title: 'Task completed',
      body: '{actor} completed the task "{title}".',
    },
    ar: { title: 'تم إكمال مهمة', body: 'أكمل {actor} المهمة "{title}".' },
  },
  'deal.assigned': {
    en: {
      title: 'New deal assigned to you',
      body: '{actor} assigned you the deal "{title}".',
    },
    ar: {
      title: 'تم إسناد صفقة جديدة إليك',
      body: 'أسند إليك {actor} الصفقة "{title}".',
    },
  },
  'deal.won': {
    en: {
      title: 'Deal won',
      body: '{actor} marked the deal "{title}" as won.',
    },
    ar: {
      title: 'تم ربح صفقة',
      body: 'حدّد {actor} الصفقة "{title}" كصفقة رابحة.',
    },
  },
  'deal.lost': {
    en: {
      title: 'Deal lost',
      body: '{actor} marked the deal "{title}" as lost.',
    },
    ar: {
      title: 'تم خسارة صفقة',
      body: 'حدّد {actor} الصفقة "{title}" كصفقة خاسرة.',
    },
  },
  'lead.assigned': {
    en: {
      title: 'New lead assigned to you',
      body: '{actor} assigned you the lead "{title}".',
    },
    ar: {
      title: 'تم إسناد عميل محتمل جديد إليك',
      body: 'أسند إليك {actor} العميل المحتمل "{title}".',
    },
  },
  'calendar.assigned': {
    en: {
      title: 'New event on your calendar',
      body: '{actor} added you to the event "{title}" ({when}).',
    },
    ar: {
      title: 'حدث جديد في تقويمك',
      body: 'أضافك {actor} إلى الحدث "{title}" ({when}).',
    },
  },
  'calendar.rescheduled': {
    en: {
      title: 'Event rescheduled',
      body: '{actor} rescheduled the event "{title}" to {when}.',
    },
    ar: {
      title: 'تمت إعادة جدولة حدث',
      body: 'أعاد {actor} جدولة الحدث "{title}" إلى {when}.',
    },
  },
  'calendar.cancelled': {
    en: {
      title: 'Event cancelled',
      body: '{actor} cancelled the event "{title}" ({when}).',
    },
    ar: {
      title: 'تم إلغاء حدث',
      body: 'ألغى {actor} الحدث "{title}" ({when}).',
    },
  },
};

function formatWhen(
  startAt: string | null | undefined,
  language: NotificationLanguage,
): string {
  if (!startAt) return '';

  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return (
      new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(date) + ' UTC'
    );
  } catch {
    return date.toISOString();
  }
}

export function isKnownNotificationType(
  type: string,
): type is NotificationType {
  return Object.prototype.hasOwnProperty.call(CATALOG, type) as boolean;
}

/**
 * Renders a notification for one recipient language. Unknown types (a
 * type retired in a later release but still stored) render as a neutral
 * generic notification instead of throwing.
 */
export function renderNotification(
  type: string,
  languageInput: string | null | undefined,
  context: RenderContext,
): RenderedNotification {
  const language = resolveLanguage(languageInput);

  if (!isKnownNotificationType(type)) {
    return {
      title: language === 'ar' ? 'إشعار جديد' : 'New notification',
      body: '',
    };
  }

  const entry = CATALOG[type][language];

  const actor = sanitizeText(context.actorName, 80) || FALLBACK_ACTOR[language];
  const title = sanitizeText(context.title) || FALLBACK_TITLE[language];
  const when = formatWhen(context.startAt, language);

  const body = entry.body
    .replace('{actor}', () => actor)
    .replace('{title}', () => title)
    .replace('{when}', () => when)
    // No date available: drop the now-empty "()" / trailing "to ".
    .replace(/\s*\(\)/g, '')
    .replace(/\s+to \.$/, '.')
    .replace(/\s+إلى \.$/, '.')
    .trim();

  return { title: entry.title, body };
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const EMAIL_LABELS: Record<
  NotificationLanguage,
  { open: string; footer: string; brand: string }
> = {
  en: {
    open: 'Open in Orbit CRM',
    footer:
      'You are receiving this because email notifications are enabled in your Orbit CRM settings.',
    brand: 'Orbit CRM',
  },
  ar: {
    open: 'فتح في Orbit CRM',
    footer:
      'تتلقى هذه الرسالة لأن إشعارات البريد الإلكتروني مفعّلة في إعدادات حسابك في Orbit CRM.',
    brand: 'Orbit CRM',
  },
};

/**
 * Builds the email for a notification. EVERYTHING interpolated into the
 * HTML is escaped; the subject is single-line and control-character
 * free. `frontendUrl + path` is the only link and `path` always comes
 * from buildNotificationPath().
 */
export function renderNotificationEmail(
  type: string,
  languageInput: string | null | undefined,
  context: RenderContext,
  link: string | null,
): RenderedEmail {
  const language = resolveLanguage(languageInput);
  const labels = EMAIL_LABELS[language];
  const rendered = renderNotification(type, language, context);

  const subject = sanitizeText(`${labels.brand} - ${rendered.title}`, 150);

  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const align = language === 'ar' ? 'right' : 'left';

  const button = link
    ? `<div style="margin: 24px 0;"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;">${escapeHtml(labels.open)}</a></div>`
    : '';

  const html = `
<div dir="${dir}" lang="${language}" style="font-family: Arial, sans-serif; padding: 20px; text-align: ${align};">
  <h2 style="margin: 0 0 12px;">${escapeHtml(rendered.title)}</h2>
  <p style="font-size: 15px; line-height: 1.5;">${escapeHtml(rendered.body)}</p>
  ${button}
  <hr />
  <small style="color: #6b7280;">${escapeHtml(labels.footer)}</small>
</div>`.trim();

  const text = [rendered.title, '', rendered.body, link ? `\n${link}` : '']
    .join('\n')
    .trim();

  return { subject, html, text };
}

// ---------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path only (starts with /dashboard) — the SW re-validates it. */
  path: string | null;
  tag: string;
}

export function renderPushPayload(
  type: string,
  languageInput: string | null | undefined,
  context: RenderContext,
  path: string | null,
  notificationId: string,
): PushPayload {
  const rendered = renderNotification(type, languageInput, context);

  return {
    title: rendered.title,
    body: rendered.body,
    path,
    tag: `notification-${notificationId}`,
  };
}
