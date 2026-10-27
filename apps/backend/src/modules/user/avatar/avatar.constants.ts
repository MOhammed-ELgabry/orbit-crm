/**
 * Profile-picture rules shared by registration, the upload endpoint and the
 * chat layer. One place, so the limits can never drift between them.
 */

/** Hard ceiling for the stored file. The web client downsizes to well below this. */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** Largest accepted width / height in pixels (the client sends 512 x 512). */
export const AVATAR_MAX_DIMENSION = 4096;

export const AVATAR_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AvatarContentType = (typeof AVATAR_ALLOWED_TYPES)[number];

/** Name of the multipart field that carries the picture. */
export const AVATAR_FIELD = 'avatar';

/**
 * What `User.avatar` holds for an uploaded picture: the API path that serves
 * it, versioned by the content checksum so a changed picture is a new URL.
 * Anything else in that column (e.g. a URL a social provider once supplied)
 * is NOT a local picture and is never shown.
 */
const LOCAL_AVATAR_REF =
  /^\/users\/[A-Za-z0-9_-]{1,64}\/avatar\?v=[0-9a-f]{8,64}$/;

export function buildAvatarRef(userId: string, checksum: string): string {
  return `/users/${userId}/avatar?v=${checksum.slice(0, 16)}`;
}

export function isLocalAvatarRef(value: string | null | undefined): boolean {
  return typeof value === 'string' && LOCAL_AVATAR_REF.test(value);
}

/** The reference if it points at an uploaded picture, otherwise null. */
export function localAvatarOrNull(value: string | null | undefined) {
  return isLocalAvatarRef(value) ? (value as string) : null;
}
