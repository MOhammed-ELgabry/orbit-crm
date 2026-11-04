import { describe, expect, it } from "vitest";

import { describeAttachmentFailure } from "../lib/chatAttachments";
import ar from "./ar/chatAttachments";
import en from "./en/chatAttachments";

describe("chat attachment locales (AR / EN)", () => {
  it("have exactly the same keys", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it("have no empty text, and keep the same {{placeholders}} in both languages", () => {
    const placeholders = (text: string) =>
      (text.match(/{{\w+}}/g) ?? []).sort();

    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].trim(), key).not.toBe("");
      expect(ar[key].trim(), key).not.toBe("");
      expect(placeholders(ar[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("define every Excel string", () => {
    const keys = [
      "chatAttachmentPreviewSpreadsheet",
      "chatAttachmentKindExcel",
      "chatAttachmentErrTypeMismatch",
      "chatAttachmentErrSheetMacro",
      "chatAttachmentErrSheetEncrypted",
      "chatAttachmentErrSheetActive",
    ] as const;

    for (const key of keys) {
      expect(en[key], key).toBeTruthy();
      expect(ar[key], key).toBeTruthy();
    }
  });

  it("the supported-type and size messages mention Excel in both languages", () => {
    expect(en.chatAttachmentErrUnsupported).toMatch(/\.xlsx, \.xls/);
    expect(ar.chatAttachmentErrUnsupported).toMatch(/xlsx/);
    expect(en.chatAttachmentErrTooLarge).toMatch(/Excel/);
    expect(ar.chatAttachmentErrTooLarge).toMatch(/Excel/);
  });

  it("every message key a server token can map to exists in both languages", () => {
    const tokens = [
      "attachment_type_mismatch",
      "attachment_spreadsheet_macro",
      "attachment_spreadsheet_encrypted",
      "attachment_spreadsheet_active_content",
      "attachment_unsupported_type",
      "attachment_too_large",
      "attachment_corrupt",
    ];

    for (const token of tokens) {
      const { key } = describeAttachmentFailure(400, token);

      expect(Object.keys(en), token).toContain(key);
      expect(Object.keys(ar), token).toContain(key);
    }
  });
});
