import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "../../i18n";
import Hint from "./Hint";
import HintIcon from "./HintIcon";

describe("Hint", () => {
  it("shows the central helper text on hover and does not block the click", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Hint id="importContacts">
        <button type="button" onClick={onClick}>
          Import
        </button>
      </Hint>,
    );

    await user.hover(screen.getByRole("button", { name: "Import" }));

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Import contacts");
    expect(tip).toHaveTextContent("CSV or Excel");
    expect(screen.getByRole("button", { name: "Import" })).toHaveAttribute(
      "aria-describedby",
      tip.id,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus and closes on Escape", async () => {
    const user = userEvent.setup();

    render(
      <Hint id="logout">
        <button type="button">Out</button>
      </Hint>,
    );

    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Logout");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("is dismissed when the pointer leaves", async () => {
    const user = userEvent.setup();

    render(
      <Hint id="chat">
        <button type="button">Chat</button>
      </Hint>,
    );

    await user.hover(screen.getByRole("button", { name: "Chat" }));
    await screen.findByRole("tooltip");
    await user.unhover(screen.getByRole("button", { name: "Chat" }));
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("HintIcon opens with a plain tap and toggles closed", async () => {
    const user = userEvent.setup();

    render(<HintIcon id="reportsPeriod" />);

    const icon = screen.getByRole("button", { name: /report period/i });
    await user.click(icon);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("date range");

    await user.click(icon);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
});
