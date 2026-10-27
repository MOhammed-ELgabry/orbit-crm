import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../services/api", () => ({ default: api }));

import { clearAvatarCache } from "../../lib/avatar";
import UserAvatar from "./UserAvatar";

const REF = "/users/u1/avatar?v=abcdef0123456789";

describe("UserAvatar", () => {
  beforeEach(() => {
    clearAvatarCache();
    api.get.mockReset();
  });

  it("shows the initials when the user has no picture", () => {
    render(
      <UserAvatar avatar={null} className="c">
        OA
      </UserAvatar>,
    );

    expect(screen.getByText("OA")).toBeInTheDocument();
    expect(screen.queryByTestId("user-avatar-image")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows initials, and loads nothing, for an external picture URL", () => {
    render(
      <UserAvatar avatar="https://lh3.googleusercontent.com/a/x" className="c">
        OA
      </UserAvatar>,
    );

    expect(screen.getByText("OA")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows the uploaded picture once it has loaded", async () => {
    api.get.mockResolvedValue({ data: new Blob(["x"], { type: "image/png" }) });

    render(
      <UserAvatar avatar={REF} className="c">
        OA
      </UserAvatar>,
    );

    const image = await screen.findByTestId("user-avatar-image");
    expect(image.getAttribute("src")).toMatch(/^blob:/);
    expect(screen.queryByText("OA")).not.toBeInTheDocument();
  });

  it("falls back to initials when the picture cannot be loaded", async () => {
    api.get.mockRejectedValue(new Error("404"));

    render(
      <UserAvatar avatar={REF} className="c">
        OA
      </UserAvatar>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("OA")).toBeInTheDocument();
  });

  it("falls back to initials when the image itself is broken", async () => {
    api.get.mockResolvedValue({ data: new Blob(["not an image"]) });

    render(
      <UserAvatar avatar={REF} className="c">
        OA
      </UserAvatar>,
    );

    fireEvent.error(await screen.findByTestId("user-avatar-image"));

    expect(screen.getByText("OA")).toBeInTheDocument();
  });

  it("swaps to the new picture when the reference changes, without the old one lingering", async () => {
    api.get.mockResolvedValue({ data: new Blob(["x"]) });

    const { rerender } = render(
      <UserAvatar avatar={REF} className="c">
        OA
      </UserAvatar>,
    );
    const first = (await screen.findByTestId("user-avatar-image")).getAttribute(
      "src",
    );

    api.get.mockResolvedValue({ data: new Blob(["y"]) });
    rerender(
      <UserAvatar avatar="/users/u1/avatar?v=0000000000000001" className="c">
        OA
      </UserAvatar>,
    );

    // Old picture is dropped immediately...
    expect(screen.queryByTestId("user-avatar-image")).not.toBeInTheDocument();
    // ...and the new one appears.
    const next = (await screen.findByTestId("user-avatar-image")).getAttribute(
      "src",
    );
    expect(next).not.toBe(first);
  });
});
