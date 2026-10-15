import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("../../services/api", () => ({
  API_BASE_URL: "http://api.example.test:3000",
  default: {},
}));
vi.mock("../../services/notificationService", () => service);
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}));

import "../../i18n";
import ChatNotificationsBridge, {
  CHAT_NOTIFICATION_REFRESH_DELAY_MS,
} from "./ChatNotificationsBridge";
import NotificationBell from "./NotificationBell";
import { ChatProvider } from "../../context/ChatProvider";
import { ChatStore, READ_DEBOUNCE_MS } from "../../context/chatStore";
import { NotificationsProvider } from "../../context/NotificationsProvider";
import {
  FakeSocket,
  emptyPage,
  makeApi,
  makeMessage,
} from "../../test/chatFakes";
import { listResult, makeNotification } from "../../test/notificationFixtures";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("ChatNotificationsBridge (chat socket -> notification counter)", () => {
  let api: ReturnType<typeof makeApi>;
  let store: ChatStore;

  const mount = async (withBridge = true) => {
    const view = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <NotificationsProvider>
          <ChatProvider store={store}>
            {withBridge && <ChatNotificationsBridge />}
            <Routes>
              <Route path="*" element={<NotificationBell />} />
            </Routes>
            <LocationProbe />
          </ChatProvider>
        </NotificationsProvider>
      </MemoryRouter>,
    );

    await flush();
    FakeSocket.last().ready();
    await flush();

    return view;
  };

  const incoming = (sequence: number, senderId = "u2") =>
    FakeSocket.last().receive({
      type: "message.new",
      conversationId: "c-team",
      conversationType: "TEAM",
      message: makeMessage({ sequence, senderId }),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    FakeSocket.reset();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    service.getUnreadCount.mockResolvedValue(1);
    service.listNotifications.mockResolvedValue(listResult([]));
    service.markNotificationRead.mockResolvedValue(undefined);
    service.markAllNotificationsRead.mockResolvedValue(0);

    api = makeApi();
    store = new ChatStore({
      api,
      createSocket: (url) => new FakeSocket(url),
      socketUrl: "ws://test/chat/ws",
    });
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  it("refreshes the bell counter about a second after a message from someone else", async () => {
    await mount();
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("1");

    service.getUnreadCount.mockResolvedValue(2);
    incoming(1);

    // Not instant: the server creates the notification just after commit.
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS - 1);
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("2");
  });

  it("merges a burst of messages into a single counter request", async () => {
    await mount();
    service.getUnreadCount.mockClear();

    for (let sequence = 1; sequence <= 6; sequence += 1) incoming(sequence);
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS + 50);
    await advance(10_000);

    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it("ignores my own messages", async () => {
    await mount();
    service.getUnreadCount.mockClear();

    incoming(1, "u1");
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS * 3);

    expect(service.getUnreadCount).not.toHaveBeenCalled();
  });

  it("uses the existing chat connection: no extra socket is opened", async () => {
    await mount();
    incoming(1);
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS);

    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("refreshes after a successful read acknowledgement (the server marks the chat notifications read)", async () => {
    await mount();
    api.getChatMessages.mockResolvedValue({
      ...emptyPage(),
      messages: [makeMessage({ sequence: 1 })],
      lastSequence: 1,
    });
    await act(() => store.loadThread("c-team"));
    service.getUnreadCount.mockClear();
    service.getUnreadCount.mockResolvedValue(0);

    store.reportViewport("c-team", true);
    await advance(READ_DEBOUNCE_MS);
    expect(api.markChatRead).toHaveBeenCalledWith("c-team", 1);

    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS);
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });

  it("a failing counter request never affects chat state and is not retried in a loop", async () => {
    await mount();
    service.getUnreadCount.mockClear();
    service.getUnreadCount.mockRejectedValue(new Error("500"));

    incoming(1);
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS);
    await advance(5_000);

    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
    // The chat still received and counted the message.
    const conversation = store.getSnapshot().conversations["c-team"];
    expect(conversation.unreadCount).toBe(1);

    // And the next message still works / still triggers a (single) refresh.
    incoming(2);
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS);
    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(2);
  });

  it("does not refresh while the tab is hidden (the visibility handler catches up)", async () => {
    await mount();
    service.getUnreadCount.mockClear();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    incoming(1);
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS * 2);

    expect(service.getUnreadCount).not.toHaveBeenCalled();
  });

  it("stops observing on unmount: a pending refresh is cancelled", async () => {
    const view = await mount();
    service.getUnreadCount.mockClear();

    incoming(1);
    view.unmount();
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS * 3);

    expect(service.getUnreadCount).not.toHaveBeenCalled();
  });

  it("without the bridge nothing changes: only the 60s poll refreshes (regression)", async () => {
    await mount(false);
    service.getUnreadCount.mockClear();

    incoming(1);
    await advance(CHAT_NOTIFICATION_REFRESH_DELAY_MS * 2);

    expect(service.getUnreadCount).not.toHaveBeenCalled();
  });

  it("a throwing activity listener cannot break chat message handling", async () => {
    await mount(false);
    store.subscribeActivity(() => {
      throw new Error("observer bug");
    });

    expect(() => incoming(1)).not.toThrow();
    expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(1);
  });

  it("opening a chat notification marks ONLY the notification read and goes to the conversation", async () => {
    const item = makeNotification({
      id: "n-chat",
      type: "chat.message",
      title: "Sara Ali sent you a message",
      body: "see you at 5",
      path: "/dashboard/chat?c=c-team",
      entityType: "chat_conversation",
      entityId: "c-team",
    });
    service.getUnreadCount.mockResolvedValue(1);
    service.listNotifications.mockResolvedValue(listResult([item]));

    await mount();

    fireEvent.click(
      screen.getByRole("button", { name: "Notifications, 1 unread" }),
    );
    await flush();
    fireEvent.click(screen.getByText("Sara Ali sent you a message"));
    await flush();

    expect(service.markNotificationRead).toHaveBeenCalledWith("n-chat");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard/chat?c=c-team",
    );
    // D6: the read direction is chat -> notifications only.
    expect(api.markChatRead).not.toHaveBeenCalled();
  });
});
