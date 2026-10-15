import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";

/** Up to two initials of a display name ("Sara Ali" -> "SA"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";

  const first = Array.from(parts[0])[0] ?? "";
  const second = parts.length > 1 ? (Array.from(parts[1])[0] ?? "") : "";

  return `${first}${second}`.toUpperCase();
}

const AVATAR_TONES = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
] as const;

/** Stable colour per person, derived from the id (never from the name). */
export function avatarToneOf(id: string): string {
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function localeOf(language: string): string {
  return language === "ar" ? "ar" : "en";
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "14:05" today, "12 Oct, 14:05" otherwise. Empty for an invalid date. */
export function formatMessageTime(
  iso: string,
  language: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const locale = localeOf(language);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (isSameDay(date, now)) return time;

  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(date);

  return `${day}, ${time}`;
}

/** "5 minutes ago" in the user's language. Empty for an invalid date. */
export function formatRelative(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: language === "ar" ? ar : enUS,
  });
}
