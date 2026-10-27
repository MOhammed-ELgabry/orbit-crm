import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const loadAvatarUrl = vi.hoisted(() => vi.fn());
vi.mock("../../lib/avatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/avatar")>()),
  loadAvatarUrl,
}));

import type { ChatMessage } from "../../types/chat";
import MessageBubble from "./MessageBubble";

const message: ChatMessage = {
  id: "m1",
  conversationId: "c1",
  sequence: 1,
  senderId: "u2",
  senderName: "Sara Hassan",
  senderAvatar: null,
  senderRole: null,
  clientMessageId: "x",
  body: "hello",
  createdAt: "2026-10-20T10:00:00.000Z",
  receipt: null,
};

const REF = "/users/u2/avatar?v=abcdef0123456789";

describe("MessageBubble — sender picture", () => {
  beforeEach(() => {
    loadAvatarUrl.mockReset();
    loadAvatarUrl.mockResolvedValue("blob:orbit-test/sara");
  });

  it("shows the sender's initials beside a message when they have no picture", () => {
    render(
      <ul>
        <MessageBubble
          mine={false}
          message={message}
          avatar={null}
          avatarId="u2"
          avatarName="Sara Hassan"
        />
      </ul>,
    );

    expect(screen.getByText("SH")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows the sender's uploaded picture beside their message", async () => {
    render(
      <ul>
        <MessageBubble
          mine={false}
          message={message}
          avatar={REF}
          avatarId="u2"
          avatarName="Sara Hassan"
        />
      </ul>,
    );

    expect(await screen.findByTestId("user-avatar-image")).toHaveAttribute(
      "src",
      "blob:orbit-test/sara",
    );
    expect(screen.queryByText("SH")).not.toBeInTheDocument();
  });

  it("puts the picture on the opposite side for own messages", () => {
    const { container } = render(
      <ul>
        <MessageBubble
          mine
          message={{ ...message, senderId: "u1", senderName: "Omar Ali" }}
          avatar={null}
          avatarId="u1"
          avatarName="Omar Ali"
        />
      </ul>,
    );

    expect(container.querySelector("li")).toHaveClass("flex-row-reverse");
    expect(screen.getByText("OA")).toBeInTheDocument();
  });

  it("never loads a remote picture URL into the chat", () => {
    render(
      <ul>
        <MessageBubble
          mine={false}
          message={message}
          avatar="https://tracker.example/pixel.png"
          avatarId="u2"
          avatarName="Sara Hassan"
        />
      </ul>,
    );

    expect(screen.getByText("SH")).toBeInTheDocument();
    expect(screen.queryByTestId("user-avatar-image")).not.toBeInTheDocument();
  });
});
