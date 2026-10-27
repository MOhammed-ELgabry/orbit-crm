import api from "../services/api";

/**
 * Profile-picture helpers.
 *
 * Pictures are stored by the API (PostgreSQL) and `user.avatar` holds the API
 * path that serves them, e.g. `/users/<id>/avatar?v=<hash>`. The picture
 * endpoint needs the session cookies, so a plain <img src> is not used: the
 * bytes are fetched with the app's axios instance and shown through an object
 * URL. The `?v=` part changes with the picture, which makes it a natural
 * cache key.
 */

/** Same ceiling the API enforces (AVATAR_MAX_BYTES on the backend). */
export const AVATAR_MAX_BYTES = 512 * 1024;
/** What a picked photo is scaled down to before upload (square, px). */
export const AVATAR_OUTPUT_SIZE = 512;
/** Largest file we will even try to decode in the browser. */
export const AVATAR_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type AvatarProblem = "type" | "size" | "decode" | "empty";

export class AvatarError extends Error {
  readonly problem: AvatarProblem;

  constructor(problem: AvatarProblem) {
    super(problem);
    this.name = "AvatarError";
    this.problem = problem;
  }
}

/** Cheap checks before any decoding. The API repeats them on the real bytes. */
export function checkAvatarFile(file: File): AvatarProblem | null {
  if (file.size === 0) return "empty";
  if (!ALLOWED_TYPES.has(file.type)) return "type";
  if (file.size > AVATAR_INPUT_MAX_BYTES) return "size";
  return null;
}

/** True only for a reference to a picture uploaded to this API. */
export function isLocalAvatar(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    /^\/users\/[A-Za-z0-9_-]+\/avatar\?v=[0-9a-f]+$/.test(value)
  );
}

async function decode(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      throw new AvatarError("decode");
    }
  }

  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new AvatarError("decode"));
      element.src = url;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

/**
 * Centre-crops the picked photo to a square, scales it to 512 x 512 and
 * re-encodes it (WebP, falling back to JPEG). Re-encoding also drops any
 * metadata (EXIF location, ...) the original carried. The API still validates
 * what it receives; this only keeps normal uploads small and clean.
 */
export async function prepareAvatarBlob(file: File): Promise<Blob> {
  const problem = checkAvatarFile(file);
  if (problem) throw new AvatarError(problem);

  const decoded = await decode(file);

  try {
    if (!decoded.width || !decoded.height) throw new AvatarError("decode");

    const side = Math.min(decoded.width, decoded.height);
    const target = Math.min(AVATAR_OUTPUT_SIZE, side);
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext("2d");
    if (!context) throw new AvatarError("decode");

    context.drawImage(
      decoded.source,
      (decoded.width - side) / 2,
      (decoded.height - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target,
    );

    for (const [type, quality] of [
      ["image/webp", 0.86],
      ["image/jpeg", 0.86],
      ["image/jpeg", 0.7],
      ["image/jpeg", 0.5],
    ] as const) {
      const blob = await toBlob(canvas, type, quality);
      if (
        blob &&
        ALLOWED_TYPES.has(blob.type) &&
        blob.size <= AVATAR_MAX_BYTES
      ) {
        return blob;
      }
    }

    throw new AvatarError("size");
  } finally {
    decoded.close();
  }
}

// ---------------------------------------------------------------------------
// Loading pictures
// ---------------------------------------------------------------------------

const urlCache = new Map<string, Promise<string | null>>();

/**
 * Object URL for a picture reference, fetched once and shared by every
 * component showing it. Resolves null for anything that is not a local
 * picture or cannot be loaded (the caller then shows initials); a failed load
 * is not cached, so it is retried the next time.
 */
export function loadAvatarUrl(
  ref: string | null | undefined,
): Promise<string | null> {
  if (!isLocalAvatar(ref)) return Promise.resolve(null);

  const cached = urlCache.get(ref);
  if (cached) return cached;

  const pending = api
    .get<Blob>(ref, { responseType: "blob" })
    .then((response) => URL.createObjectURL(response.data))
    .catch(() => {
      urlCache.delete(ref);
      return null;
    });

  urlCache.set(ref, pending);
  return pending;
}

/** Seeds the cache with bytes we already hold (just uploaded), saving a fetch. */
export function primeAvatarUrl(ref: string, blob: Blob): void {
  if (isLocalAvatar(ref)) {
    urlCache.set(ref, Promise.resolve(URL.createObjectURL(blob)));
  }
}

/** Forgets every loaded picture (used on logout so nothing outlives the session). */
export function clearAvatarCache(): void {
  for (const pending of urlCache.values()) {
    void pending.then((url) => url && URL.revokeObjectURL(url));
  }
  urlCache.clear();
}
