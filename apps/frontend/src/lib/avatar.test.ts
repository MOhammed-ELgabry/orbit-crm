import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/api", () => ({ default: api }));

import {
  AVATAR_INPUT_MAX_BYTES,
  checkAvatarFile,
  clearAvatarCache,
  isLocalAvatar,
  loadAvatarUrl,
  primeAvatarUrl,
} from "./avatar";

const REF = "/users/u1/avatar?v=abcdef0123456789";
const file = (type: string, size = 100) =>
  new File([new Uint8Array(size)], "x", { type });

describe("isLocalAvatar", () => {
  it("accepts only a picture reference served by this API", () => {
    expect(isLocalAvatar(REF)).toBe(true);
    expect(isLocalAvatar("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(isLocalAvatar("//evil.example/users/u1/avatar?v=ab")).toBe(false);
    expect(isLocalAvatar("/users/u1/avatar")).toBe(false);
    expect(isLocalAvatar("")).toBe(false);
    expect(isLocalAvatar(null)).toBe(false);
    expect(isLocalAvatar(undefined)).toBe(false);
  });
});

describe("checkAvatarFile", () => {
  it("allows PNG, JPEG and WebP", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(checkAvatarFile(file(type))).toBeNull();
    }
  });

  it.each(["image/svg+xml", "image/gif", "text/html", "application/pdf", ""])(
    "rejects %s",
    (type) => {
      expect(checkAvatarFile(file(type))).toBe("type");
    },
  );

  it("rejects empty and oversized files", () => {
    expect(checkAvatarFile(file("image/png", 0))).toBe("empty");
    expect(checkAvatarFile(file("image/png", AVATAR_INPUT_MAX_BYTES + 1))).toBe(
      "size",
    );
  });
});

describe("loadAvatarUrl", () => {
  beforeEach(() => {
    clearAvatarCache();
    api.get.mockReset();
  });

  it("never requests anything for a missing or external reference", async () => {
    await expect(loadAvatarUrl(null)).resolves.toBeNull();
    await expect(
      loadAvatarUrl("https://tracker.example/p.png"),
    ).resolves.toBeNull();

    expect(api.get).not.toHaveBeenCalled();
  });

  it("fetches a local picture once and shares it between callers", async () => {
    api.get.mockResolvedValue({ data: new Blob(["x"], { type: "image/png" }) });

    const [a, b] = await Promise.all([loadAvatarUrl(REF), loadAvatarUrl(REF)]);

    expect(a).toMatch(/^blob:/);
    expect(b).toBe(a);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(REF, { responseType: "blob" });
  });

  it("treats a changed picture (new ?v=) as a new picture", async () => {
    api.get.mockResolvedValue({ data: new Blob(["x"]) });

    await loadAvatarUrl(REF);
    await loadAvatarUrl("/users/u1/avatar?v=ffffffffffffffff");

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("resolves null on failure and retries next time", async () => {
    api.get.mockRejectedValueOnce(new Error("404"));

    await expect(loadAvatarUrl(REF)).resolves.toBeNull();

    api.get.mockResolvedValueOnce({ data: new Blob(["x"]) });
    await expect(loadAvatarUrl(REF)).resolves.toMatch(/^blob:/);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("uses bytes we already hold instead of fetching again", async () => {
    primeAvatarUrl(REF, new Blob(["x"], { type: "image/webp" }));

    await expect(loadAvatarUrl(REF)).resolves.toMatch(/^blob:/);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("forgets everything on clear (logout)", async () => {
    api.get.mockResolvedValue({ data: new Blob(["x"]) });

    await loadAvatarUrl(REF);
    clearAvatarCache();
    await loadAvatarUrl(REF);

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
