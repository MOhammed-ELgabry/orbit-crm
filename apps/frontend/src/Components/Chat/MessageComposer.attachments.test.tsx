import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const service = vi.hoisted(() => ({
  getChatAttachmentConfig: vi.fn(),
  uploadChatAttachment: vi.fn(),
  cancelChatAttachment: vi.fn(),
  fetchChatAttachmentBlob: vi.fn(),
}));

vi.mock("../../services/chatService", () => service);

import { resetChatAttachmentConfigCache } from "../../hooks/useChatAttachmentConfig";
import type { ChatAttachment } from "../../types/chat";
import MessageComposer from "./MessageComposer";

const CONFIG = {
  enabled: true,
  imageMaxBytes: 5 * 1024 * 1024,
  pdfMaxBytes: 10 * 1024 * 1024,
  allowedContentTypes: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ],
  readyTtlMs: 7_200_000,
};

const ATTACHMENT: ChatAttachment = {
  id: "att-1",
  kind: "IMAGE",
  contentType: "image/png",
  displayName: "photo.png",
  sizeBytes: 2048,
  width: 4,
  height: 3,
};

const png = () =>
  new File([new Uint8Array(2048)], "photo.png", { type: "image/png" });

function setup(
  props: { attachmentsAllowed?: boolean; onSend?: () => boolean } = {},
) {
  const onSend = vi.fn(props.onSend ?? (() => true));

  render(
    <MessageComposer
      conversationId="c1"
      attachmentsAllowed={props.attachmentsAllowed ?? true}
      onSend={onSend}
    />,
  );

  return { onSend };
}

const attachButton = () =>
  screen.queryByRole("button", { name: "Attach an image or PDF" });
const sendButton = () => screen.getByRole("button", { name: "Send" });
const fileInput = () =>
  screen.getByTestId("attachment-input") as HTMLInputElement;

describe("MessageComposer - attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChatAttachmentConfigCache();
    service.getChatAttachmentConfig.mockResolvedValue(CONFIG);
    service.cancelChatAttachment.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  describe("availability (a UI hint; the server decides)", () => {
    it("shows the attach button when the server reports the feature on", async () => {
      setup();

      await waitFor(() => expect(attachButton()).toBeInTheDocument());
      expect(fileInput()).toHaveAttribute(
        "accept",
        "image/png,image/jpeg,image/webp,application/pdf",
      );
      expect(fileInput()).not.toHaveAttribute("multiple");
    });

    const hidden = async () => {
      setup();
      await waitFor(() =>
        expect(service.getChatAttachmentConfig).toHaveBeenCalled(),
      );
      await act(async () => undefined);

      expect(attachButton()).toBeNull();
    };

    it("hides it when the feature is off", async () => {
      service.getChatAttachmentConfig.mockResolvedValue({ enabled: false });
      await hidden();
    });

    it("hides it when the request is refused (ineligible user)", async () => {
      service.getChatAttachmentConfig.mockRejectedValue(new Error("403"));
      await hidden();
    });

    it("hides it when the service cannot even be called", async () => {
      service.getChatAttachmentConfig.mockImplementation(() => {
        throw new TypeError("api.get is not a function");
      });
      await hidden();
    });

    it("never asks (or offers) in a team conversation", async () => {
      setup({ attachmentsAllowed: false });
      await act(async () => undefined);

      expect(service.getChatAttachmentConfig).not.toHaveBeenCalled();
      expect(attachButton()).toBeNull();
    });
  });

  describe("choosing a file", () => {
    it("shows name, size and a progress bar while uploading, and blocks sending", async () => {
      let progress: (n: number) => void = () => undefined;
      service.uploadChatAttachment.mockImplementation(
        (
          _c: string,
          _f: File,
          options: { onProgress: (n: number) => void },
        ) => {
          progress = options.onProgress;
          return new Promise(() => undefined);
        },
      );
      const { onSend } = setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(fileInput(), png());
      act(() => progress(0.4));

      expect(screen.getByTestId("attachment-chip")).toHaveTextContent(
        "photo.png",
      );
      expect(screen.getByTestId("attachment-chip")).toHaveTextContent("2 KB");
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "40",
      );
      expect(screen.getByText("Uploading… 40%")).toBeInTheDocument();

      expect(sendButton()).toBeDisabled();
      expect(attachButton()).toBeDisabled(); // no second file while one uploads
      await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
      expect(onSend).not.toHaveBeenCalled();
      expect(
        screen.getByText("Wait for the upload to finish before sending."),
      ).toBeInTheDocument();
    });

    it("sends an attachment-only message once the upload is ready", async () => {
      service.uploadChatAttachment.mockResolvedValue({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });
      const { onSend } = setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(fileInput(), png());
      await screen.findByText("Ready to send");

      expect(sendButton()).toBeEnabled();
      await userEvent.click(sendButton());

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("", ATTACHMENT);
      // the chip is gone; the sent attachment is NOT deleted
      expect(screen.queryByTestId("attachment-chip")).toBeNull();
      expect(service.cancelChatAttachment).not.toHaveBeenCalled();
    });

    it("sends text together with the attachment (Enter works as usual)", async () => {
      service.uploadChatAttachment.mockResolvedValue({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });
      const { onSend } = setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(fileInput(), png());
      await screen.findByText("Ready to send");
      await userEvent.type(screen.getByRole("textbox"), "look at this{Enter}");

      expect(onSend).toHaveBeenCalledWith("look at this", ATTACHMENT);
    });

    it("keeps the chip when the message is not accepted (nothing is lost)", async () => {
      service.uploadChatAttachment.mockResolvedValue({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });
      const { onSend } = setup({ onSend: () => false });
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(fileInput(), png());
      await screen.findByText("Ready to send");
      await userEvent.click(sendButton());

      expect(onSend).toHaveBeenCalled();
      expect(screen.getByTestId("attachment-chip")).toBeInTheDocument();
    });

    it("text-only sending is unchanged (no attachment argument)", async () => {
      const { onSend } = setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.type(screen.getByRole("textbox"), "just text{Enter}");

      expect(onSend).toHaveBeenCalledWith("just text", undefined);
    });

    it("rejects an unsupported file locally with a message, and offers no retry", async () => {
      setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(
        fileInput(),
        new File(["x"], "anim.gif", { type: "image/gif" }),
        { applyAccept: false },
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        /Only PNG, JPEG, WebP/,
      );
      expect(
        screen.queryByRole("button", { name: "Try uploading again" }),
      ).toBeNull();
      expect(service.uploadChatAttachment).not.toHaveBeenCalled();
      expect(sendButton()).toBeDisabled();
    });

    it("shows a failed upload, offers a safe retry, and succeeds on the second try", async () => {
      service.uploadChatAttachment.mockRejectedValueOnce(
        new Error("Network Error"),
      );
      service.uploadChatAttachment.mockResolvedValueOnce({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });
      setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(fileInput(), png());
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Connection problem/,
      );
      expect(sendButton()).toBeDisabled();

      await userEvent.click(
        screen.getByRole("button", { name: "Try uploading again" }),
      );

      await screen.findByText("Ready to send");
      expect(service.uploadChatAttachment).toHaveBeenCalledTimes(2);
    });

    it("removing a ready attachment discards it on the server", async () => {
      service.uploadChatAttachment.mockResolvedValue({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });
      setup();
      await waitFor(() => expect(attachButton()).toBeInTheDocument());

      await userEvent.upload(fileInput(), png());
      await screen.findByText("Ready to send");
      await userEvent.click(
        screen.getByRole("button", { name: "Remove attachment" }),
      );

      expect(screen.queryByTestId("attachment-chip")).toBeNull();
      expect(service.cancelChatAttachment).toHaveBeenCalledWith("c1", "att-1");
    });
  });

  describe("languages and direction", () => {
    it("renders Arabic strings and keeps the text box direction automatic (RTL/LTR content)", async () => {
      await i18n.changeLanguage("ar");
      service.uploadChatAttachment.mockResolvedValue({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });
      setup();

      const attach = await screen.findByRole("button", {
        name: "إرفاق صورة أو ملف PDF",
      });
      expect(attach).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveAttribute("dir", "auto");

      await userEvent.upload(fileInput(), png());
      expect(await screen.findByText("جاهز للإرسال")).toBeInTheDocument();
      // the file name keeps its own direction
      expect(screen.getByText(/photo\.png/).closest("p")).toHaveAttribute(
        "dir",
        "auto",
      );
    });
  });
});
