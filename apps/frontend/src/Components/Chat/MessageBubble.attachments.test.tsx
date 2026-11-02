import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const service = vi.hoisted(() => ({ fetchChatAttachmentBlob: vi.fn() }));

vi.mock("../../services/chatService", () => service);

import type { PendingMessage } from "../../context/chatState";
import type { ChatAttachment, ChatMessage } from "../../types/chat";
import MessageBubble from "./MessageBubble";

const ATTACHMENT: ChatAttachment = {
  id: "att-1",
  kind: "PDF",
  contentType: "application/pdf",
  displayName: "report.pdf",
  sizeBytes: 5000,
  width: null,
  height: null,
};

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  conversationId: "c1",
  sequence: 1,
  senderId: "u2",
  senderName: "Sara Ali",
  senderAvatar: null,
  senderRole: null,
  clientMessageId: "x",
  body: "hello",
  createdAt: "2026-11-01T10:00:00.000Z",
  receipt: null,
  ...overrides,
});

const renderBubble = (props: Parameters<typeof MessageBubble>[0]) =>
  render(
    <ul>
      <MessageBubble {...props} />
    </ul>,
  );

describe("MessageBubble with attachments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a text message renders exactly as before (no attachment UI)", () => {
    const { container } = renderBubble({ mine: false, message: message() });

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="attachment"]')).toBeNull();
    expect(screen.queryByTestId("attachment-missing")).toBeNull();
  });

  it("shows text and the attachment together", () => {
    renderBubble({ mine: false, message: message({ attachment: ATTACHMENT }) });

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-pdf")).toBeInTheDocument();
  });

  it("an attachment-only message has no empty text paragraph", () => {
    const { container } = renderBubble({
      mine: true,
      message: message({ body: "", attachment: ATTACHMENT }),
    });

    expect(screen.getByTestId("attachment-pdf")).toBeInTheDocument();
    expect(container.querySelectorAll("p[dir='auto']")).toHaveLength(0);
  });

  it("an empty message whose attachment cannot be shown gets a neutral placeholder", () => {
    renderBubble({ mine: false, message: message({ body: "" }) });

    expect(screen.getByTestId("attachment-missing")).toHaveTextContent(
      "This attachment is no longer available.",
    );
  });

  it("a message still being sent shows the file name only (the stored file is not requested yet)", () => {
    const pending: PendingMessage = {
      clientMessageId: "cid-1",
      conversationId: "c1",
      body: "",
      attachment: ATTACHMENT,
      createdAt: "2026-11-01T10:00:00.000Z",
      status: "sending",
      retryable: true,
    };

    renderBubble({ mine: true, pending });

    expect(screen.getByTestId("pending-attachment")).toHaveTextContent(
      "report.pdf",
    );
    expect(service.fetchChatAttachmentBlob).not.toHaveBeenCalled();
    expect(screen.getByTestId("message-sending")).toBeInTheDocument();
  });

  it("a failed attachment message offers retry / discard like any message", () => {
    const pending: PendingMessage = {
      clientMessageId: "cid-1",
      conversationId: "c1",
      body: "",
      attachment: ATTACHMENT,
      createdAt: "2026-11-01T10:00:00.000Z",
      status: "failed",
      retryable: true,
    };

    renderBubble({ mine: true, pending, onRetry: vi.fn(), onDiscard: vi.fn() });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("file names are rendered as text, never as HTML", () => {
    renderBubble({
      mine: false,
      message: message({
        attachment: {
          ...ATTACHMENT,
          displayName: "<img src=x onerror=alert(1)>.pdf",
        },
      }),
    });

    expect(
      screen.getByText("<img src=x onerror=alert(1)>.pdf"),
    ).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });
});
