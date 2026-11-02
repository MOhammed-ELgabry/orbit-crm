import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const service = vi.hoisted(() => ({ fetchChatAttachmentBlob: vi.fn() }));

vi.mock("../../services/chatService", () => service);

import type { ChatAttachment } from "../../types/chat";
import AttachmentView from "./AttachmentView";

const IMAGE: ChatAttachment = {
  id: "att-img",
  kind: "IMAGE",
  contentType: "image/png",
  displayName: "photo.png",
  sizeBytes: 2048,
  width: 400,
  height: 300,
};

const PDF: ChatAttachment = {
  id: "att-pdf",
  kind: "PDF",
  contentType: "application/pdf",
  displayName: "report.pdf",
  sizeBytes: 1_500_000,
  width: null,
  height: null,
};

describe("AttachmentView", () => {
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    created = [];
    revoked = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:orbit-test/${created.length + 1}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  describe("image", () => {
    it("loads through the authenticated endpoint and shows the image from a blob: URL (never a public URL)", async () => {
      service.fetchChatAttachmentBlob.mockResolvedValue(
        new Blob(["x"], { type: "image/png" }),
      );

      render(
        <AttachmentView conversationId="c1" attachment={IMAGE} mine={false} />,
      );

      const img = await screen.findByRole("img", { name: "photo.png" });

      expect(img.getAttribute("src")).toBe("blob:orbit-test/1");
      expect(img).toHaveAttribute("width", "400");
      expect(img).toHaveAttribute("height", "300");
      expect(service.fetchChatAttachmentBlob).toHaveBeenCalledWith(
        "c1",
        "att-img",
        expect.anything(),
      );
      expect(screen.getByText("photo.png (2 KB)")).toBeInTheDocument();
    });

    it("shows a loading state first", () => {
      service.fetchChatAttachmentBlob.mockReturnValue(
        new Promise(() => undefined),
      );

      render(<AttachmentView conversationId="c1" attachment={IMAGE} mine />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("revokes the Blob URL when the message goes away", async () => {
      service.fetchChatAttachmentBlob.mockResolvedValue(
        new Blob(["x"], { type: "image/png" }),
      );

      const { unmount } = render(
        <AttachmentView conversationId="c1" attachment={IMAGE} mine={false} />,
      );
      await screen.findByRole("img");

      unmount();

      expect(revoked).toEqual(["blob:orbit-test/1"]);
    });

    it("enlarges and shrinks on click (keyboard-accessible button)", async () => {
      service.fetchChatAttachmentBlob.mockResolvedValue(
        new Blob(["x"], { type: "image/png" }),
      );
      render(
        <AttachmentView conversationId="c1" attachment={IMAGE} mine={false} />,
      );

      const toggle = await screen.findByRole("button", {
        name: /Enlarge image/,
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      await userEvent.click(toggle);

      expect(
        screen.getByRole("button", { name: /Shrink image/ }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("shows an unavailable state (and a retry for transient errors) instead of a broken image", async () => {
      service.fetchChatAttachmentBlob.mockRejectedValueOnce(
        new Error("Network Error"),
      );
      service.fetchChatAttachmentBlob.mockResolvedValueOnce(
        new Blob(["x"], { type: "image/png" }),
      );

      render(
        <AttachmentView conversationId="c1" attachment={IMAGE} mine={false} />,
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/Connection problem/);

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(
        await screen.findByRole("img", { name: "photo.png" }),
      ).toBeInTheDocument();
    });

    it("shows the 'no longer available' text for an expired / missing file (404)", async () => {
      service.fetchChatAttachmentBlob.mockRejectedValue(
        Object.assign(new Error("x"), {
          isAxiosError: true,
          response: { status: 404, data: { message: "attachment_not_found" } },
        }),
      );

      render(
        <AttachmentView conversationId="c1" attachment={IMAGE} mine={false} />,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "This attachment is no longer available.",
      );
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });
  });

  describe("PDF", () => {
    it("never previews: no image, iframe, object or embed is rendered, and nothing is fetched until the click", () => {
      const { container } = render(
        <AttachmentView conversationId="c1" attachment={PDF} mine={false} />,
      );

      expect(screen.getByText("report.pdf")).toBeInTheDocument();
      expect(screen.getByText(/PDF · 1.4 MB/)).toBeInTheDocument();
      expect(
        container.querySelector("iframe, object, embed, img, a[href]"),
      ).toBeNull();
      expect(service.fetchChatAttachmentBlob).not.toHaveBeenCalled();
    });

    it("downloads through the authenticated request and saves it with the safe display name", async () => {
      service.fetchChatAttachmentBlob.mockResolvedValue(
        new Blob(["%PDF-"], { type: "application/pdf" }),
      );
      const clicked: { href: string; download: string }[] = [];
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          clicked.push({ href: this.href, download: this.download });
        });

      render(<AttachmentView conversationId="c1" attachment={PDF} mine />);
      await userEvent.click(
        screen.getByRole("button", { name: /Download report\.pdf/ }),
      );

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

      expect(service.fetchChatAttachmentBlob).toHaveBeenCalledWith(
        "c1",
        "att-pdf",
      );
      expect(clicked[0]).toEqual({
        href: "blob:orbit-test/1",
        download: "report.pdf",
      });
      // the temporary link is removed from the page
      expect(document.querySelector("a[download]")).toBeNull();
    });

    it("revokes the temporary download URL afterwards", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        service.fetchChatAttachmentBlob.mockResolvedValue(
          new Blob(["%PDF-"], { type: "application/pdf" }),
        );
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
          () => undefined,
        );

        render(<AttachmentView conversationId="c1" attachment={PDF} mine />);
        await userEvent.click(screen.getByRole("button", { name: /Download/ }));
        await waitFor(() => expect(created).toHaveLength(1));

        expect(revoked).toEqual([]);
        await vi.advanceTimersByTimeAsync(31_000);

        expect(revoked).toEqual(["blob:orbit-test/1"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows an error and stays usable when the download fails", async () => {
      service.fetchChatAttachmentBlob.mockRejectedValue(
        new Error("Network Error"),
      );

      render(
        <AttachmentView conversationId="c1" attachment={PDF} mine={false} />,
      );
      await userEvent.click(screen.getByRole("button", { name: /Download/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Connection problem/,
      );
      expect(screen.getByRole("button", { name: /Download/ })).toBeEnabled();
    });

    it("blocks a second click while a download is running (no duplicate requests)", async () => {
      service.fetchChatAttachmentBlob.mockReturnValue(
        new Promise(() => undefined),
      );

      render(
        <AttachmentView conversationId="c1" attachment={PDF} mine={false} />,
      );
      const button = screen.getByRole("button", { name: /Download/ });

      await userEvent.click(button);
      await userEvent.click(button);

      expect(button).toBeDisabled();
      expect(service.fetchChatAttachmentBlob).toHaveBeenCalledTimes(1);
    });
  });
});
