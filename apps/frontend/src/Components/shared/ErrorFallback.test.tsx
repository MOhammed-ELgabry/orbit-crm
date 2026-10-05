import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorFallback from "./ErrorFallback";

// Smoke test for the frontend testing foundation. ErrorFallback was chosen
// because it is stable and dependency-free (no i18n, router, auth, API,
// Sentry or PostHog). One test proves the whole toolchain end to end:
// Vitest + jsdom, React Testing Library, jest-dom and user-event.
describe("ErrorFallback (testing foundation smoke test)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the emergency screen and reloads the page when Reload is clicked", async () => {
    // jsdom cannot navigate, so replace `location` just for this test.
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    const user = userEvent.setup();
    render(<ErrorFallback />);

    // React Testing Library + jest-dom
    expect(
      screen.getByRole("heading", { name: /something went wrong/i }),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /reload/i });
    expect(button).toBeEnabled();

    // user-event
    await user.click(button);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});