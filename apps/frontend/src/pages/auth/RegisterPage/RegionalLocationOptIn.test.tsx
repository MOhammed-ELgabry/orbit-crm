import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";

const requestPreciseLocation = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/regional/geolocation", () => ({
  requestPreciseLocation,
}));

import RegionalLocationOptIn from "./RegionalLocationOptIn";
import { getGeoHint, setGeoHint } from "../../../lib/regional/geoStore";

describe("RegionalLocationOptIn", () => {
  afterEach(() => {
    requestPreciseLocation.mockReset();
    act(() => setGeoHint(null));
  });

  it("never asks for the location until the user clicks", () => {
    render(<RegionalLocationOptIn />);

    expect(requestPreciseLocation).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /use my location/i }),
    ).toBeEnabled();
  });

  it("keeps only the resolved country in memory after consent", async () => {
    requestPreciseLocation.mockResolvedValue({
      ok: true,
      hint: { country: "EG", accuracyM: 20, borderRisk: false },
    });
    render(<RegionalLocationOptIn />);

    await userEvent.click(
      screen.getByRole("button", { name: /use my location/i }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(/Egypt/);
    expect(getGeoHint()).toEqual({
      country: "EG",
      accuracyM: 20,
      borderRisk: false,
    });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("warns about a border and lets the user drop the hint", async () => {
    requestPreciseLocation.mockResolvedValue({
      ok: true,
      hint: { country: "MC", accuracyM: 20, borderRisk: true },
    });
    render(<RegionalLocationOptIn />);

    await userEvent.click(
      screen.getByRole("button", { name: /use my location/i }),
    );
    expect(await screen.findByText(/close to a border/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /don't use it/i }),
    );
    expect(getGeoHint()).toBeNull();
  });

  it.each([
    ["denied", /declined/i],
    ["unavailable", /isn't available/i],
    ["timeout", /too long/i],
    ["unusable", /clear country/i],
    ["unsupported", /doesn't support/i],
  ])(
    "shows a calm message when location is %s and stores nothing",
    async (reason, text) => {
      requestPreciseLocation.mockResolvedValue({ ok: false, reason });
      render(<RegionalLocationOptIn />);

      await userEvent.click(
        screen.getByRole("button", { name: /use my location/i }),
      );

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(getGeoHint()).toBeNull();
      expect(
        screen.getByRole("button", { name: /use my location/i }),
      ).toBeEnabled();
    },
  );
});
