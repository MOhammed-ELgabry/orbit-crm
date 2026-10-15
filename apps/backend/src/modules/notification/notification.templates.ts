import {
  CHAT_SNIPPET_MAX_LENGTH,
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
  /**
   * Chat only: bounded preview of the message. Passed by the in-app inbox
   * ONLY; the push and email renderers never receive it, so message text
   * can never leave the app through them.
   */
  snippet?: string | null;
  /** Chat only: which kind of conversation the notification is about. */
  conversationType?: string | null;
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

// Invisible formatting characters that add nothing readable and are used to
// hide or spoof text: soft hyphen, ZWSP, LRM/RLM, word joiner, invisible
// operators, BOM. ZWNJ (U+200C) and ZWJ (U+200D) are deliberately KEPT:
// they are part of correct Persian/Urdu/Arabic-script spelling and of
// multi-person / skin-tone emoji sequences, and stripping them corrupts
// legitimate text.
const INVISIBLE_CHARS = /[\u00ad\u200b\u200e\u200f\u2060-\u2064\ufeff]/g;

// A UTF-16 surrogate that is not part of a valid pair.
const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function splitGraphemes(text: string): string[] {
  try {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  } catch {
    return Array.from(text);
  }
}

/**
 * Safe, bounded preview of a chat message for the in-app inbox.
 *
 * Unicode-normalised (NFC), no control / bidi-override / zero-width /
 * lone-surrogate characters, no line breaks, collapsed whitespace, and
 * truncated at a GRAPHEME boundary (an emoji or an Arabic letter with its
 * diacritics is never cut in half). Idempotent: sanitising an already
 * sanitised snippet returns it unchanged, so it is safe to apply both when
 * storing and when rendering.
 */
export function sanitizeChatSnippet(
  input: unknown,
  maxLength: number = CHAT_SNIPPET_MAX_LENGTH,
): string {
  if (typeof input !== 'string') return '';

  const cleaned = input
    .replace(LONE_SURROGATE, '')
    .normalize('NFC')
    .replace(INVISIBLE_CHARS, '')
    .replace(UNSAFE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) return '';

  const graphemes = splitGraphemes(cleaned);

  if (graphemes.length <= maxLength) return cleaned;

  return `${graphemes
    .slice(0, Math.max(0, maxLength - 1))
    .join('')
    .trimEnd()}…`;
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
    case 'chat_conversation':
      // Opens the conversation through the chat page's own ?c= handling,
      // which ignores an id that is not one of the viewer's conversations.
      return id
        ? `/dashboard/chat?c=${encodeURIComponent(id)}`
        : '/dashboard/chat';
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
  /** `{actor}`, `{title}`, `{snippet}` and `{when}` are substituted. */
  body: string;
  /** Chat only: used when there is no snippet (push, email, empty text). */
  bodyWithoutSnippet?: string;
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
  // Direct (1:1) chat message.
  'chat.message': {
    en: {
      title: 'New message',
      body: '{actor}: {snippet}',
      bodyWithoutSnippet: '{actor} sent you a message.',
    },
    ar: {
      title: 'رسالة جديدة',
      body: '{actor}: {snippet}',
      bodyWithoutSnippet: 'أرسل إليك {actor} رسالة.',
    },
  },
};

/** The same type, rendered for the team conversation. */
const CHAT_TEAM_ENTRY: Record<NotificationLanguage, CatalogEntry> = {
  en: {
    title: 'New messages in the team chat',
    body: '{actor}: {snippet}',
    bodyWithoutSnippet: '{actor} wrote in the team chat.',
  },
  ar: {
    title: 'رسائل جديدة في دردشة الفريق',
    body: '{actor}: {snippet}',
    bodyWithoutSnippet: 'كتب {actor} في دردشة الفريق.',
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

  const actor = sanitizeText(context.actorName, 80) || FALLBACK_ACTOR[language];

  if (type === 'chat.message') {
    const chatEntry =
      context.conversationType === 'TEAM'
        ? CHAT_TEAM_ENTRY[language]
        : CATALOG[type][language];
    const snippet = sanitizeChatSnippet(context.snippet);

    // The user's text goes in through function replacers and AFTER the
    // template is chosen, so no cleanup regex below can touch it and a
    // "$&" in a message stays literal.
    const template = snippet
      ? chatEntry.body
      : (chatEntry.bodyWithoutSnippet ?? chatEntry.body);

    return {
      title: chatEntry.title,
      body: template
        .replace('{actor}', () => actor)
        .replace('{snippet}', () => snippet)
        .trim(),
    };
  }

  const entry = CATALOG[type][language];
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
  entityId?: string | null,
): PushPayload {
  // Message text must never reach a push payload (lock screens, push
  // services): whatever the caller passed, chat renders its snippet-less
  // wording here.
  const rendered = renderNotification(type, languageInput, {
    ...context,
    ...(type === 'chat.message' && { snippet: null }),
  });

  // One tag per chat conversation: a newer push replaces the previous one
  // instead of stacking a notification per message.
  const tag =
    type === 'chat.message' && entityId && SAFE_ID.test(entityId)
      ? `chat-${entityId}`
      : `notification-${notificationId}`;

  return {
    title: rendered.title,
    body: rendered.body,
    path,
    tag,
  };
}
