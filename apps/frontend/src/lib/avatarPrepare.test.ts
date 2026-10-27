import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));

import { AVATAR_MAX_BYTES, AvatarError, prepareAvatarBlob } from "./avatar";

const file = (type = "image/png", size = 100) =>
  new File([new Uint8Array(size)], "x", { type });

describe("prepareAvatarBlob", () => {
  const drawImage = vi.fn();
  let toBlob: ReturnType<typeof vi.fn>;
  const close = vi.fn();

  beforeEach(() => {
    drawImage.mockReset();
    close.mockReset();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1000, height: 600, close }),
    );
    toBlob = vi.fn((cb: (b: Blob | null) => void, type: string) =>
      cb(new Blob([new Uint8Array(1000)], { type })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      toBlob as never,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("centre-crops to a square and scales down to 512 px", async () => {
    const blob = await prepareAvatarBlob(file());

    expect(blob.type).toBe("image/webp");
    // 1000 x 600 source: a 600 px square taken from the middle (x = 200).
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      200,
      0,
      600,
      600,
      0,
      0,
      512,
      512,
    );
    expect(close).toHaveBeenCalled();
  });

  it("does not upscale a small photo", async () => {
    (createImageBitmap as ReturnType<typeof vi.fn>).mockResolvedValue({
      width: 200,
      height: 200,
      close,
    });

    await prepareAvatarBlob(file());

    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      200,
      200,
      0,
      0,
      200,
      200,
    );
  });

  it("falls back to JPEG when WebP is unavailable or too large", async () => {
    toBlob.mockImplementation((cb: (b: Blob | null) => void, type: string) =>
      cb(
        type === "image/webp"
          ? new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], { type })
          : new Blob([new Uint8Array(1000)], { type }),
      ),
    );

    const blob = await prepareAvatarBlob(file());

    expect(blob.type).toBe("image/jpeg");
  });

  it("gives up with a size error when nothing fits the limit", async () => {
    toBlob.mockImplementation((cb: (b: Blob | null) => void, type: string) =>
      cb(new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], { type })),
    );

    await expect(prepareAvatarBlob(file())).rejects.toMatchObject({
      problem: "size",
    });
  });

  it("reports an unreadable image as a decode problem", async () => {
    (createImageBitmap as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("bad"),
    );

    await expect(prepareAvatarBlob(file())).rejects.toBeInstanceOf(AvatarError);
    await expect(prepareAvatarBlob(file())).rejects.toMatchObject({
      problem: "decode",
    });
  });

  it("rejects unsupported types before decoding anything", async () => {
    await expect(
      prepareAvatarBlob(file("image/svg+xml")),
    ).rejects.toMatchObject({
      problem: "type",
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
