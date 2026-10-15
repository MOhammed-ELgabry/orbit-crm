import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "i18next";

import "../../i18n";
import NotificationItem from "./NotificationItem";
import { makeNotification } from "../../test/notificationFixtures";

const chat = (overrides = {}) =>
  makeNotification({
    type: "chat.message",
    entityType: "chat_conversation",
    entityId: "c-1",
    path: "/dashboard/chat?c=c-1",
    ...overrides,
  });

describe("NotificationItem — chat.message", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the title, the snippet and a chat icon (not the generic fallback)", () => {
    const { container } = render(
      <ul>
        <NotificationItem
          notification={chat({
            title: "Sara Ali sent you a message",
            body: "see you at 5",
          })}
          onOpen={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText("Sara Ali sent you a message")).toBeVisible();
    expect(screen.getByText("see you at 5")).toBeVisible();
    // Feather "message-square" is a single <path>; the fallback
    // "alert-circle" has a <circle>.
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.querySelector("circle")).toBeNull();
  });

  it("renders the generic icon for unknown types (regression)", () => {
    const { container } = render(
      <ul>
        <NotificationItem
          notification={makeNotification({ type: "something.else" })}
          onOpen={vi.fn()}
        />
      </ul>,
    );

    expect(container.querySelector("svg circle")).not.toBeNull();
  });

  it("renders user-supplied text as text, never as markup", () => {
    const payload = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
    const { container } = render(
      <ul>
        <NotificationItem
          notification={chat({ body: payload })}
          onOpen={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector("li img, li b")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("renders an Arabic notification, with the unread label translated", async () => {
    await i18n.changeLanguage("ar");
    render(
      <ul>
        <NotificationItem
          notification={chat({
            title: "أرسل لك سارة رسالة",
            body: "نتقابل الساعة 5",
          })}
          onOpen={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText("أرسل لك سارة رسالة")).toBeVisible();
    expect(screen.getByText("نتقابل الساعة 5")).toBeVisible();
    expect(screen.getByRole("img")).toHaveAccessibleName(
      i18n.t("notificationUnread"),
    );
    // Logical alignment (`text-start`) keeps it correct in RTL and LTR.
    expect(screen.getByRole("button").className).toContain("text-start");
  });

  it("calls onOpen with the notification when activated", async () => {
    const onOpen = vi.fn();
    const item = chat();
    const user = userEvent.setup();
    render(
      <ul>
        <NotificationItem notification={item} onOpen={onOpen} />
      </ul>,
    );

    await user.click(screen.getByRole("button"));

    expect(onOpen).toHaveBeenCalledWith(item);
  });
});
