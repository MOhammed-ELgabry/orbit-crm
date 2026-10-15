import { screen, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api", () => ({
  API_BASE_URL: "http://api.example.test:3000",
  default: {},
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}));

import ChatButton from "./ChatButton";
import { ChatStore } from "../../context/chatStore";
import {
  FakeSocket,
  makeApi,
  makeBootstrap,
  makeConversation,
  makeDirect,
} from "../../test/chatFakes";
import { renderWithChat } from "../../test/renderChat";

function storeWith(api: ReturnType<typeof makeApi>) {
  return new ChatStore({
    api,
    createSocket: (url) => new FakeSocket(url),
    socketUrl: "ws://test/chat/ws",
  });
}

describe("ChatButton", () => {
  beforeEach(() => FakeSocket.reset());

  it("links to the chat page with an accessible label and no badge when nothing is unread", async () => {
    const api = makeApi();
    renderWithChat(<ChatButton />, storeWith(api), "/dashboard");

    await waitFor(() => expect(api.getChatBootstrap).toHaveBeenCalled());

    const link = screen.getByRole("link", { name: "Team chat" });
    expect(link).toHaveAttribute("href", "/dashboard/chat");
    expect(screen.queryByTestId("chat-badge")).not.toBeInTheDocument();
  });

  it("shows the total unread count of every conversation", async () => {
    const api = makeApi({
      getChatBootstrap: vi.fn().mockResolvedValue(
        makeBootstrap({
          conversations: [
            makeConversation({ unreadCount: 3 }),
            makeDirect({ unreadCount: 1 }),
          ],
        }),
      ),
    });
    renderWithChat(<ChatButton />, storeWith(api), "/dashboard");

    expect(await screen.findByTestId("chat-badge")).toHaveTextContent("4");
    expect(
      screen.getByRole("link", { name: "Team chat, 4 unread" }),
    ).toBeInTheDocument();
  });

  it("caps the badge at 99+", async () => {
    const api = makeApi({
      getChatBootstrap: vi.fn().mockResolvedValue(
        makeBootstrap({
          conversations: [makeConversation({ unreadCount: 250 })],
        }),
      ),
    });
    renderWithChat(<ChatButton />, storeWith(api), "/dashboard");

    expect(await screen.findByTestId("chat-badge")).toHaveTextContent("99+");
  });

  it("is hidden when the server says chat is not available for the account", async () => {
    const denied = new AxiosError("forbidden", "403", undefined, undefined, {
      status: 403,
      statusText: "",
      headers: {},
      config: {} as never,
      data: {},
    });
    const api = makeApi({
      getChatBootstrap: vi.fn().mockRejectedValue(denied),
      getChatSession: vi.fn().mockRejectedValue(denied),
    });
    renderWithChat(<ChatButton />, storeWith(api), "/dashboard");

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /team chat/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("stays usable (no badge) when the chat API is down", async () => {
    const api = makeApi({
      getChatBootstrap: vi.fn().mockRejectedValue(new Error("500")),
    });
    renderWithChat(<ChatButton />, storeWith(api), "/dashboard");

    await waitFor(() => expect(api.getChatBootstrap).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Team chat" })).toBeVisible();
    expect(screen.queryByTestId("chat-badge")).not.toBeInTheDocument();
  });
});
