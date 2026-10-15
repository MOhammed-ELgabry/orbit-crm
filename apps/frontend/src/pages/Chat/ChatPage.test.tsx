import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api", () => ({
  API_BASE_URL: "http://api.example.test:3000",
  default: {},
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}));

import i18n from "i18next";
import "../../i18n";
import ChatPage from "./ChatPage";
import { ChatStore } from "../../context/chatStore";
import {
  FakeSocket,
  ME,
  TEAMMATES,
  emptyPage,
  makeApi,
  makeBootstrap,
  makeConversation,
  makeDirect,
  makeMessage,
} from "../../test/chatFakes";
import { renderWithChat } from "../../test/renderChat";

function networkError() {
  return new AxiosError("Network Error");
}

function setup(
  apiOverrides: Parameters<typeof makeApi>[0] = {},
  conversations = [makeConversation(), makeDirect()],
) {
  const api = makeApi({
    getChatBootstrap: vi
      .fn()
      .mockResolvedValue(makeBootstrap({ conversations })),
    ...apiOverrides,
  });
  const store = new ChatStore({
    api,
    createSocket: (url) => new FakeSocket(url),
    socketUrl: "ws://test/chat/ws",
  });

  return { api, store };
}

/** Brings the (fake) socket to the `ready` state, like a real handshake. */
async function goOnline() {
  await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
  act(() => FakeSocket.last().ready());
}

describe("ChatPage", () => {
  beforeEach(() => {
    FakeSocket.reset();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
    document.documentElement.dir = "ltr";
  });

  it("lists the team chat and direct conversations with unread badges and previews", async () => {
    const { store } = setup({}, [
      makeConversation({
        unreadCount: 2,
        lastMessage: makeMessage({ sequence: 3, body: "Standup at 10" }),
      }),
      makeDirect({
        lastMessage: makeMessage({
          conversationId: "c-direct",
          sequence: 1,
          senderId: ME.id,
          body: "ok thanks",
        }),
      }),
    ]);
    renderWithChat(<ChatPage />, store);

    const list = await screen.findByRole("list", { name: "Conversations" });
    const items = within(list).getAllByRole("listitem");

    expect(items[0]).toHaveTextContent("Team chat");
    expect(items[0]).toHaveTextContent("Sara Ali: Standup at 10");
    expect(
      within(items[0]).getByTestId("conversation-unread"),
    ).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("Sara Ali");
    expect(items[1]).toHaveTextContent("You: ok thanks");
  });

  it("opens a conversation, shows its history and acknowledges it as read", async () => {
    const { api, store } = setup({
      getChatMessages: vi.fn().mockResolvedValue({
        ...emptyPage(),
        messages: [
          makeMessage({ sequence: 1, body: "Good morning" }),
          makeMessage({
            sequence: 2,
            senderId: ME.id,
            senderName: ME.name,
            body: "Morning!",
            receipt: { readCount: 0, recipientCount: 2 },
          }),
        ],
        lastSequence: 2,
      }),
    });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store);

    await user.click(await screen.findByRole("button", { name: /Team chat/ }));

    expect(await screen.findByText("Good morning")).toBeInTheDocument();
    expect(screen.getByText("Morning!")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("?c=c-team");
    expect(api.getChatMessages).toHaveBeenCalledWith("c-team", { limit: 30 });

    // A real acknowledgement of the latest visible message.
    await waitFor(() =>
      expect(api.markChatRead).toHaveBeenCalledWith("c-team", 2),
    );
  });

  it("renders the three receipt states on the user's own messages", async () => {
    const own = (sequence: number, readCount: number) =>
      makeMessage({
        sequence,
        senderId: ME.id,
        body: `m${sequence}`,
        receipt: { readCount, recipientCount: 2 },
      });
    const { store } = setup({
      getChatMessages: vi.fn().mockResolvedValue({
        ...emptyPage(),
        messages: [own(1, 0), own(2, 1), own(3, 2)],
        lastSequence: 3,
      }),
    });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    await screen.findByText("m1");
    void user;

    const states = screen
      .getAllByTestId("receipt")
      .map((el) => el.getAttribute("data-state"));
    expect(states).toEqual(["sent", "delivered", "read"]);
    expect(screen.getByLabelText("Seen by 1 of 2")).toBeInTheDocument();
  });

  it("sends with Enter, keeps a newline with Shift+Enter, and shows the message at once", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const { api, store } = setup({
      sendChatMessage: vi
        .fn()
        .mockReturnValue(new Promise((r) => (resolve = r))),
    });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    const box = await screen.findByRole("textbox", { name: "Write a message" });
    await user.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(api.sendChatMessage).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");

    await user.keyboard("{Enter}");

    expect(api.sendChatMessage).toHaveBeenCalledTimes(1);
    const [conversationId, clientMessageId, body] =
      api.sendChatMessage.mock.calls[0];
    expect(conversationId).toBe("c-team");
    expect(clientMessageId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body).toBe("line one\nline two");

    expect(box).toHaveValue("");
    expect(await screen.findByTestId("message-sending")).toBeInTheDocument();

    await act(async () => {
      resolve({
        message: makeMessage({
          sequence: 1,
          senderId: ME.id,
          clientMessageId,
          body,
          receipt: { readCount: 0, recipientCount: 2 },
        }),
        duplicate: false,
      });
    });

    await waitFor(() =>
      expect(screen.queryByTestId("message-sending")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("message")).toHaveLength(1);
    expect(screen.getByTestId("receipt")).toHaveAttribute("data-state", "sent");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const { api, store } = setup();
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    const box = await screen.findByRole("textbox", { name: "Write a message" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    await user.type(box, "   {Enter}");
    expect(api.sendChatMessage).not.toHaveBeenCalled();
  });

  it("shows a failed send with Retry, and a retry resends the same clientMessageId", async () => {
    const { api, store } = setup({
      sendChatMessage: vi.fn().mockRejectedValueOnce(networkError()),
    });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    await user.type(
      await screen.findByRole("textbox", { name: "Write a message" }),
      "hello{Enter}",
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not sent");

    const firstId = api.sendChatMessage.mock.calls[0][1];
    api.sendChatMessage.mockResolvedValueOnce({
      message: makeMessage({
        sequence: 1,
        senderId: ME.id,
        clientMessageId: firstId,
        body: "hello",
        receipt: { readCount: 0, recipientCount: 2 },
      }),
      duplicate: false,
    });

    await user.click(within(alert).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(api.sendChatMessage.mock.calls[1][1]).toBe(firstId);
    expect(screen.getAllByTestId("message")).toHaveLength(1);
  });

  it("offers no retry for a message the server refused, only Discard", async () => {
    const refused = new AxiosError("no", "403", undefined, undefined, {
      status: 403,
      statusText: "",
      headers: {},
      config: {} as never,
      data: {},
    });
    const { store } = setup({
      sendChatMessage: vi.fn().mockRejectedValue(refused),
    });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    await user.type(
      await screen.findByRole("textbox", { name: "Write a message" }),
      "hello{Enter}",
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This message was not accepted.");
    expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();

    await user.click(within(alert).getByRole("button", { name: "Discard" }));
    expect(screen.queryByTestId("pending-message")).not.toBeInTheDocument();
  });

  it("shows a message that arrives over the socket, and an unread badge when it is in another conversation", async () => {
    const { store } = setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");
    await screen.findByRole("textbox", { name: "Write a message" });
    await goOnline();

    act(() =>
      FakeSocket.last().receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 1, body: "live message" }),
      }),
    );
    expect(await screen.findByText("live message")).toBeInTheDocument();

    act(() =>
      FakeSocket.last().receive({
        type: "message.new",
        conversationId: "c-direct",
        conversationType: "DIRECT",
        message: makeMessage({
          conversationId: "c-direct",
          sequence: 1,
          body: "psst",
        }),
      }),
    );

    // The conversation list is hidden on phones while a thread is open, but
    // still rendered (CSS only), so its badge is queryable.
    const badge = await screen.findByTestId("conversation-unread");
    expect(badge).toHaveTextContent("1");
  });

  it("updates ticks when the peer reads a direct message", async () => {
    const { store } = setup({
      getChatMessages: vi.fn().mockResolvedValue({
        ...emptyPage("c-direct"),
        messages: [
          makeMessage({
            conversationId: "c-direct",
            sequence: 1,
            senderId: ME.id,
            body: "ping",
            receipt: { readCount: 0, recipientCount: 1 },
          }),
        ],
        lastSequence: 1,
      }),
    });
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-direct");

    await screen.findByText("ping");
    expect(screen.getByTestId("receipt")).toHaveAttribute("data-state", "sent");
    await goOnline();

    act(() =>
      FakeSocket.last().receive({
        type: "read.updated",
        conversationId: "c-direct",
        conversationType: "DIRECT",
        readerId: "u2",
        upToSequence: 1,
      }),
    );

    expect(await screen.findByLabelText("Seen")).toHaveAttribute(
      "data-state",
      "read",
    );
  });

  it("starts a direct chat from the People tab and shows presence", async () => {
    const { api, store } = setup({}, [makeConversation()]);
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store);

    await user.click(await screen.findByRole("tab", { name: "People" }));

    const people = screen.getByRole("list", {
      name: "People in your workspace",
    });
    expect(within(people).getAllByRole("listitem")).toHaveLength(
      TEAMMATES.length,
    );
    expect(within(people).queryByText("Mona Hassan")).not.toBeInTheDocument();
    expect(within(people).getByText(/Online/)).toBeInTheDocument();

    await user.click(within(people).getByRole("button", { name: /Sara Ali/ }));

    expect(api.openDirectConversation).toHaveBeenCalledWith("u2");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("?c=c-direct"),
    );
    expect(
      await screen.findByRole("heading", { name: "Sara Ali" }),
    ).toBeInTheDocument();
  });

  it("reports a failure to open a conversation", async () => {
    const { store } = setup({
      openDirectConversation: vi.fn().mockRejectedValue(networkError()),
    });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store);

    await user.click(await screen.findByRole("tab", { name: "People" }));
    await user.click(screen.getByRole("button", { name: /Sara Ali/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't open that conversation",
    );
  });

  it("filters conversations and people by name", async () => {
    const { store } = setup();
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store);

    await user.type(await screen.findByRole("searchbox"), "zzz");
    expect(screen.getByText("No matches.")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "sar");
    expect(
      within(screen.getByRole("list", { name: "Conversations" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  });

  it("replaces the composer with a notice when messages can no longer be sent", async () => {
    const { store } = setup({}, [makeDirect({ canSend: false })]);
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-direct");

    expect(
      await screen.findByText(
        "You can no longer send messages in this conversation.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders message content as text, never as HTML", async () => {
    const payload = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
    const { store } = setup({
      getChatMessages: vi.fn().mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1, body: payload })],
        lastSequence: 1,
      }),
    });
    const { container } = renderWithChat(
      <ChatPage />,
      store,
      "/dashboard/chat?c=c-team",
    );

    expect(await screen.findByText(payload)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("loads earlier messages on demand", async () => {
    const getChatMessages = vi
      .fn()
      .mockResolvedValueOnce({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 31, body: "newer" })],
        hasMore: true,
        lastSequence: 31,
      })
      .mockResolvedValueOnce({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 30, body: "older" })],
        hasMore: false,
      });
    const { store } = setup({ getChatMessages });
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    await user.click(
      await screen.findByRole("button", { name: "Load earlier messages" }),
    );

    expect(await screen.findByText("older")).toBeInTheDocument();
    expect(getChatMessages).toHaveBeenLastCalledWith("c-team", {
      before: 31,
      limit: 30,
    });
    expect(
      screen.queryByRole("button", { name: "Load earlier messages" }),
    ).toBeNull();
  });

  it("tells the user when live updates are down", async () => {
    const { store } = setup();
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");
    await screen.findByRole("textbox", { name: "Write a message" });
    await goOnline();

    act(() => FakeSocket.last().serverClose(1006));

    expect(await screen.findByRole("status")).toHaveTextContent("Reconnecting");
  });

  it("shows a load error with a working retry", async () => {
    const { api, store } = setup();
    api.getChatBootstrap.mockRejectedValueOnce(new Error("500"));
    const user = userEvent.setup();
    renderWithChat(<ChatPage />, store);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the chat.");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
  });

  it("falls back to the list when the requested conversation is not one of the user's", async () => {
    const { store } = setup();
    renderWithChat(
      <ChatPage />,
      store,
      "/dashboard/chat?c=someone-elses-conversation",
    );

    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(
      screen.getByText("Select a conversation to start chatting."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders Arabic text and sets text direction automatically on user content", async () => {
    await i18n.changeLanguage("ar");
    const { store } = setup({
      getChatMessages: vi.fn().mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1, body: "مرحبا بالفريق" })],
        lastSequence: 1,
      }),
    });
    renderWithChat(<ChatPage />, store, "/dashboard/chat?c=c-team");

    expect(await screen.findByText("مرحبا بالفريق")).toHaveAttribute(
      "dir",
      "auto",
    );
    expect(screen.getByRole("textbox", { name: "اكتب رسالة" })).toHaveAttribute(
      "dir",
      "auto",
    );
    expect(screen.getByRole("tab", { name: "الأشخاص" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرسال" })).toBeInTheDocument();
  });
});
