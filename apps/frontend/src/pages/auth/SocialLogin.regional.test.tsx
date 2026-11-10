import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n";

const login = vi.hoisted(() => vi.fn());
const createRegionalHandoff = vi.hoisted(() => vi.fn());
const openSocialAuthPopup = vi.hoisted(() => vi.fn());

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ login }) }));
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("../../services/regionalService", () => ({ createRegionalHandoff }));
vi.mock("../../services/authService", () => ({ openSocialAuthPopup }));

import SocialLogin from "./SocialLogin";

const TOKEN = "A".repeat(43);

describe("SocialLogin with regional hints (register page)", () => {
  beforeEach(() => {
    createRegionalHandoff.mockReset();
    openSocialAuthPopup.mockReset();
    openSocialAuthPopup.mockResolvedValue({
      user: { id: "u" },
      isNewUser: true,
    });
  });

  const renderIt = () =>
    render(
      <MemoryRouter>
        <SocialLogin captureRegionalHints />
      </MemoryRouter>,
    );

  it("mints a token before the click and passes it to the popup", async () => {
    createRegionalHandoff.mockResolvedValue(TOKEN);
    renderIt();
    await waitFor(() => expect(createRegionalHandoff).toHaveBeenCalledTimes(1));
    // let the promise settle into the ref
    await new Promise((r) => setTimeout(r, 0));

    await userEvent.click(screen.getByRole("button", { name: /google/i }));

    expect(openSocialAuthPopup).toHaveBeenCalledWith("google", TOKEN);
    // hints sent to the handoff are the passive ones only (no geo without consent)
    expect(createRegionalHandoff.mock.calls[0][0].geo).toBeUndefined();
  });

  it("still signs in when the handoff failed (token null)", async () => {
    createRegionalHandoff.mockResolvedValue(null);
    renderIt();
    await new Promise((r) => setTimeout(r, 0));

    await userEvent.click(screen.getByRole("button", { name: /microsoft/i }));

    expect(openSocialAuthPopup).toHaveBeenCalledWith("microsoft", null);
    await waitFor(() => expect(login).toHaveBeenCalled());
  });

  it("uses each token once and mints a fresh one afterwards", async () => {
    createRegionalHandoff
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce("B".repeat(43));
    renderIt();
    await new Promise((r) => setTimeout(r, 0));

    await userEvent.click(screen.getByRole("button", { name: /google/i }));
    await waitFor(() => expect(createRegionalHandoff).toHaveBeenCalledTimes(2));
  });
});
