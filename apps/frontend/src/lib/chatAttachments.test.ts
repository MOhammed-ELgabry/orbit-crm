import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

import {
  checkAttachmentFile,
  describeAttachmentFailure,
  failureOf,
  formatBytes,
  guessAttachmentKind,
} from "./chatAttachments";

const MIB = 1024 * 1024;
const file = (name: string, type: string, size = 1000) => ({
  name,
  type,
  size,
});

describe("guessAttachmentKind", () => {
  it.each([
    ["a.png", "image/png", "IMAGE"],
    ["a.jpg", "image/jpeg", "IMAGE"],
    ["a.webp", "image/webp", "IMAGE"],
    ["a.pdf", "application/pdf", "PDF"],
  ])("recognises %s (%s)", (name, type, kind) => {
    expect(guessAttachmentKind(file(name, type))).toBe(kind);
  });

  it("falls back to the extension only when the browser reports no type", () => {
    expect(guessAttachmentKind(file("scan.PDF", ""))).toBe("PDF");
    expect(guessAttachmentKind(file("p.JPEG", ""))).toBe("IMAGE");
    expect(guessAttachmentKind(file("p.png", "text/plain"))).toBeNull();
  });

  it.each([
    ["a.gif", "image/gif"],
    ["a.svg", "image/svg+xml"],
    ["a.exe", "application/octet-stream"],
    [
      "a.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["a.html", "text/html"],
    ["a.heic", "image/heic"],
  ])("rejects %s (%s)", (name, type) => {
    expect(guessAttachmentKind(file(name, type))).toBeNull();
  });
});

describe("checkAttachmentFile (a convenience: the server decides)", () => {
  it("accepts allowed types within the default limits", () => {
    expect(
      checkAttachmentFile(file("a.png", "image/png", 5 * MIB), null),
    ).toEqual({
      ok: true,
      kind: "IMAGE",
    });
    expect(
      checkAttachmentFile(file("a.pdf", "application/pdf", 10 * MIB), null),
    ).toEqual({
      ok: true,
      kind: "PDF",
    });
  });

  it("rejects an unsupported type, an empty file and oversized files", () => {
    expect(checkAttachmentFile(file("a.gif", "image/gif"), null)).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(checkAttachmentFile(file("a.png", "image/png", 0), null)).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(
      checkAttachmentFile(file("a.png", "image/png", 5 * MIB + 1), null),
    ).toEqual({ ok: false, reason: "too_large" });
    expect(
      checkAttachmentFile(file("a.pdf", "application/pdf", 10 * MIB + 1), null),
    ).toEqual({ ok: false, reason: "too_large" });
  });

  it("uses the limits the server reported", () => {
    const config = {
      enabled: true as const,
      imageMaxBytes: 1000,
      pdfMaxBytes: 2000,
      allowedContentTypes: [],
      readyTtlMs: 1,
    };

    expect(
      checkAttachmentFile(file("a.png", "image/png", 1001), config),
    ).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(
      checkAttachmentFile(file("a.pdf", "application/pdf", 2000), config),
    ).toEqual({ ok: true, kind: "PDF" });
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [5 * MIB, "5 MB"],
    [12 * MIB, "12 MB"],
    [-1, ""],
    [Number.NaN, ""],
  ])("%p -> %p", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("describeAttachmentFailure / failureOf", () => {
  const response = (status: number, message?: unknown) =>
    new AxiosError("failed", String(status), undefined, undefined, {
      status,
      statusText: "",
      headers: {},
      config: {} as never,
      data: message === undefined ? {} : { message },
    });

  it("treats a missing response as a retryable network problem", () => {
    expect(failureOf(new AxiosError("Network Error"))).toEqual({
      key: "chatAttachmentErrNetwork",
      retryable: true,
    });
    expect(failureOf(new Error("boom")).retryable).toBe(true);
  });

  it.each([
    ["attachment_unsupported_type", "chatAttachmentErrUnsupported", false],
    ["attachment_too_large", "chatAttachmentErrTooLarge", false],
    ["attachment_corrupt", "chatAttachmentErrCorrupt", false],
    ["attachment_pdf_encrypted", "chatAttachmentErrPdfEncrypted", false],
    ["attachment_pdf_active_content", "chatAttachmentErrPdfActive", false],
    ["attachment_quota_pending", "chatAttachmentErrQuotaPending", false],
    ["attachment_quota_daily", "chatAttachmentErrQuotaDaily", false],
    ["attachment_quota_company", "chatAttachmentErrStorageFull", false],
    ["attachment_busy", "chatAttachmentErrBusy", true],
    ["attachment_storage_unavailable", "chatAttachmentErrStorage", true],
    ["attachment_expired", "chatAttachmentErrExpired", false],
  ])("maps the server token %s", (token, key, retryable) => {
    expect(failureOf(response(400, token))).toEqual({ key, retryable });
  });

  it("falls back on the status when the token is unknown", () => {
    expect(describeAttachmentFailure(413, undefined).key).toBe(
      "chatAttachmentErrTooLarge",
    );
    expect(describeAttachmentFailure(429, "x")).toEqual({
      key: "chatAttachmentErrBusy",
      retryable: true,
    });
    expect(describeAttachmentFailure(503, undefined).retryable).toBe(true);
    expect(describeAttachmentFailure(403, undefined).retryable).toBe(false);
  });

  it("ignores a non-string message", () => {
    expect(failureOf(response(400, ["a", "b"])).key).toBe(
      "chatAttachmentErrGeneric",
    );
  });
});
