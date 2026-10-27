import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const h = vi.hoisted(() => ({
  user: {
    id: "u1",
    firstName: "Omar",
    lastName: "Ali",
    avatar: null as string | null,
  },
  updateUserSettings: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  prepare: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: h.user,
    updateUserSettings: h.updateUserSettings,
  }),
}));
vi.mock("../../services/userService", () => ({
  uploadAvatar: h.uploadAvatar,
  removeAvatar: h.removeAvatar,
}));
vi.mock("../../lib/notify", () => ({
  notifySuccess: h.notifySuccess,
  notifyError: h.notifyError,
}));
vi.mock("../../lib/avatar", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/avatar")>();
  return {
    ...real,
    prepareAvatarBlob: h.prepare,
    // Never hit the network from the avatar circle.
    loadAvatarUrl: vi.fn().mockResolvedValue(null),
  };
});

import { AvatarError } from "../../lib/avatar";
import ProfilePhotoModal from "./ProfilePhotoModal";

const NEW_REF = "/users/u1/avatar?v=1111111111111111";
const picked = new Blob([new Uint8Array(500)], { type: "image/webp" });
const photo = () => new File(["x"], "me.png", { type: "image/png" });

function setup() {
  const onClose = vi.fn();
  const view = render(<ProfilePhotoModal onClose={onClose} />);
  const input = screen.getByTestId("profile-photo-input") as HTMLInputElement;
  return { onClose, input, user: userEvent.setup(), ...view };
}

describe("ProfilePhotoModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.user.avatar = null;
    h.prepare.mockResolvedValue(picked);
    h.uploadAvatar.mockResolvedValue(NEW_REF);
    h.removeAvatar.mockResolvedValue(undefined);
  });

  it("is an accessible dialog and shows the user's initials when there is no picture", () => {
    setup();

    expect(
      screen.getByRole("dialog", { name: "Profile photo" }),
    ).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("OA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save photo" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Remove photo" }),
    ).not.toBeInTheDocument();
  });

  it("previews a picked photo but saves nothing until asked", async () => {
    const { input, user } = setup();

    await user.upload(input, photo());

    expect(
      await screen.findByTestId("profile-photo-preview"),
    ).toBeInTheDocument();
    expect(h.uploadAvatar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
  });

  it("uploads for the signed-in user, updates the shared user and reports success", async () => {
    const { input, user, onClose } = setup();

    await user.upload(input, photo());
    await user.click(await screen.findByRole("button", { name: "Save photo" }));

    await waitFor(() =>
      expect(h.uploadAvatar).toHaveBeenCalledWith("u1", picked),
    );
    expect(h.updateUserSettings).toHaveBeenCalledWith({ avatar: NEW_REF });
    expect(h.notifySuccess).toHaveBeenCalledWith({
      title: "Profile photo updated",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("on failure reports it, keeps the old picture and stays open", async () => {
    h.uploadAvatar.mockRejectedValue(new Error("boom"));
    const { input, user, onClose } = setup();

    await user.upload(input, photo());
    await user.click(await screen.findByRole("button", { name: "Save photo" }));

    await waitFor(() => expect(h.notifyError).toHaveBeenCalled());
    expect(h.notifyError.mock.calls[0][0].title).toBe(
      "Couldn't save the photo",
    );
    expect(h.updateUserSettings).not.toHaveBeenCalled();
    expect(h.notifySuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Can try again.
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
  });

  it("shows an inline message for an unsupported or damaged file and does not enable saving", async () => {
    h.prepare.mockRejectedValue(new AvatarError("type"));
    const { input, user } = setup();

    await user.upload(input, new File(["x"], "a.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a PNG, JPEG or WebP image.",
    );
    expect(screen.getByRole("button", { name: "Save photo" })).toBeDisabled();
    expect(h.uploadAvatar).not.toHaveBeenCalled();
  });

  it("does nothing when the file picker is cancelled", () => {
    const { input } = setup();

    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(h.prepare).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers Remove only when there is an uploaded picture, and removes it", async () => {
    h.user.avatar = "/users/u1/avatar?v=abcdef0123456789";
    const { user, onClose } = setup();

    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() => expect(h.removeAvatar).toHaveBeenCalledWith("u1"));
    expect(h.updateUserSettings).toHaveBeenCalledWith({ avatar: null });
    expect(h.notifySuccess).toHaveBeenCalledWith({
      title: "Profile photo removed",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not offer Remove for an external (provider) picture URL", () => {
    h.user.avatar = "https://lh3.googleusercontent.com/a/x";
    setup();

    expect(
      screen.queryByRole("button", { name: "Remove photo" }),
    ).not.toBeInTheDocument();
    // Initials are shown instead of the remote image.
    expect(screen.getByText("OA")).toBeInTheDocument();
  });

  it("closes with Escape and with the close button", async () => {
    const { user, onClose } = setup();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
