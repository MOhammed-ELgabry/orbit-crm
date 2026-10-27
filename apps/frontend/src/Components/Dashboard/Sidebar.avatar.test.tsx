import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("../../lib/swal", () => ({ confirmAlert: vi.fn() }));
vi.mock("../../lib/avatar", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/avatar")>();
  return {
    ...real,
    loadAvatarUrl: vi.fn().mockResolvedValue("blob:orbit-test/avatar"),
  };
});

import Sidebar from "./Sidebar";

const renderSidebar = (avatar: string | null) => {
  auth.value = {
    user: {
      id: "u1",
      firstName: "Omar",
      lastName: "Ali",
      isOwner: false,
      avatar,
    },
    logout: vi.fn(),
    updateUserSettings: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <Sidebar isOpen onClose={() => undefined} />
    </MemoryRouter>,
  );
};

describe("Sidebar — profile picture", () => {
  beforeEach(() => {
    auth.value = {};
  });

  it("shows initials when the user has no picture", () => {
    renderSidebar(null);

    expect(screen.getByText("OA")).toBeInTheDocument();
  });

  it("shows the uploaded picture instead of the initials", async () => {
    renderSidebar("/users/u1/avatar?v=abcdef0123456789");

    expect(await screen.findByTestId("user-avatar-image")).toHaveAttribute(
      "src",
      "blob:orbit-test/avatar",
    );
    expect(screen.queryByText("OA")).not.toBeInTheDocument();
  });

  it("is a real button: opens the photo dialog and gives focus back on close", async () => {
    const user = userEvent.setup();
    renderSidebar(null);

    const trigger = screen.getByRole("button", {
      name: "Change profile photo",
    });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Profile photo" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens from the keyboard too", async () => {
    const user = userEvent.setup();
    renderSidebar(null);

    screen.getByRole("button", { name: "Change profile photo" }).focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Profile photo" }),
    ).toBeInTheDocument();
  });

  it("renders the dialog outside the sidebar (a transformed element would trap `fixed`)", async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar(null);

    await user.click(
      screen.getByRole("button", { name: "Change profile photo" }),
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
