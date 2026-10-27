import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen } from "@testing-library/react";
import toast from "react-hot-toast";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import OrbitToaster from "../Components/ui/OrbitToaster";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "./notify";

// jsdom has no matchMedia; react-hot-toast reads it for reduced motion.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(() => {
  act(() => {
    toast.remove();
  });
});

describe("notify (react-hot-toast)", () => {
  it("renders success, error, warning and info toasts with their text", async () => {
    render(<OrbitToaster />);

    act(() => {
      notifySuccess({ title: "Saved" });
      notifyError({ title: "Failed", text: "Server said no" });
      notifyWarning({ title: "Careful" });
      notifyInfo({ title: "FYI" });
    });

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Server said no")).toBeInTheDocument();
    expect(screen.getByText("Careful")).toBeInTheDocument();
    expect(screen.getByText("FYI")).toBeInTheDocument();
  });

  it("announces errors assertively and everything else politely", async () => {
    render(<OrbitToaster />);

    act(() => {
      notifyError({ title: "Boom" });
      notifySuccess({ title: "Fine" });
    });

    const boom = (await screen.findByText("Boom")).closest("[role]");
    const fine = screen.getByText("Fine").closest("[role]");

    expect(boom).toHaveAttribute("role", "alert");
    expect(boom).toHaveAttribute("aria-live", "assertive");
    expect(fine).toHaveAttribute("role", "status");
    expect(fine).toHaveAttribute("aria-live", "polite");
  });

  it("does not stack a second copy of the same message", async () => {
    render(<OrbitToaster />);

    act(() => {
      notifyError({ title: "Same", text: "Same" });
      notifyError({ title: "Same", text: "Same" });
      notifyError({ title: "Same", text: "Same" });
    });

    expect(await screen.findAllByText("Same")).toHaveLength(1);
  });

  it("shows the title once when title and text are identical", async () => {
    render(<OrbitToaster />);

    act(() => {
      notifyError({ title: "Oops", text: "Oops" });
    });

    expect(await screen.findAllByText("Oops")).toHaveLength(1);
  });

  it("centres the toast container at the top of the screen", async () => {
    render(<OrbitToaster />);

    act(() => {
      notifySuccess({ title: "Centered" });
    });
    await screen.findByText("Centered");

    // react-hot-toast positions each toast row from the `position` prop:
    // top-* rows are anchored with `top`, and *-center rows are centred.
    const row = screen.getByText("Centered").closest("[role]")!.parentElement!
      .parentElement as HTMLElement;
    expect(row.style.top).not.toBe("");
    expect(row.style.bottom).toBe("");
    expect(row.style.justifyContent).toBe("center");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("scope guard: sign-in pages keep SweetAlert2", () => {
  const authDir = join(__dirname, "..", "pages", "auth");

  it("no authentication page imports the Toast helpers", () => {
    const offenders = sourceFiles(authDir).filter((file) =>
      /lib\/notify|react-hot-toast/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("login still reports its result through SweetAlert2", () => {
    const login = readFileSync(
      join(authDir, "LoginPage", "LoginForm.tsx"),
      "utf8",
    );

    expect(login).toContain('from "../../../lib/swal"');
    expect(login).toContain("successAlert");
    expect(login).toContain("errorAlert");
  });

  it("the Toaster is mounted by the Dashboard layout only", () => {
    const users = sourceFiles(join(__dirname, "..")).filter((file) =>
      /<OrbitToaster/.test(readFileSync(file, "utf8")),
    );

   expect(users.map((file) => file.split(/[\\/]/).pop())).toEqual([
  "DashboardLayout.tsx",
]);
  });
});
