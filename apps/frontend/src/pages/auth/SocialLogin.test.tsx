import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../i18n";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));
vi.mock("../../lib/posthog", () => ({ trackEvent: vi.fn() }));

import SocialLogin from "./SocialLogin";

describe("SocialLogin", () => {
  const renderIt = () =>
    render(
      <MemoryRouter>
        <SocialLogin />
      </MemoryRouter>,
    );

  it("offers Google and Microsoft", () => {
    renderIt();

    expect(screen.getByRole("button", { name: /google/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /microsoft/i })).toBeEnabled();
  });

  it("does not show a Facebook button (it does not work yet)", () => {
    const { container } = renderIt();

    expect(
      screen.queryByRole("button", { name: /facebook|فيسبوك/i }),
    ).toBeNull();
    expect(screen.queryByText(/facebook|فيسبوك/i)).toBeNull();
    // No leftover icon either.
    expect(container.innerHTML.toLowerCase()).not.toContain("facebook");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
