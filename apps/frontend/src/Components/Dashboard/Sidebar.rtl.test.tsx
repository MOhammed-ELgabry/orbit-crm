import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../i18n";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { firstName: "Omar", lastName: "Ali", isOwner: false },
    logout: vi.fn(),
  }),
}));
vi.mock("../../lib/swal", () => ({ confirmAlert: vi.fn() }));

import Sidebar from "./Sidebar";

const classesOf = (isOpen: boolean) => {
  const { container } = render(
    <MemoryRouter>
      <Sidebar isOpen={isOpen} onClose={() => undefined} />
    </MemoryRouter>,
  );

  return (container.querySelector("aside") as HTMLElement).className
    .split(/\s+/)
    .filter(Boolean);
};

/**
 * Regression guard for the Arabic (RTL) mobile drawer that stayed visible
 * while "closed". jsdom has no layout engine, so this only pins the class
 * contract; the real on-screen geometry (aside fully off-screen at 360, 390,
 * 600 and 767px in both directions, desktop untouched at 768+) was measured
 * in Chromium with Playwright, see FIX-REPORT.md.
 */
describe("Sidebar drawer direction classes", () => {
  it("slides out to the correct side when closed, in LTR and RTL", () => {
    const classes = classesOf(false);

    // LTR: leaves to the left. RTL: `start-0` is the right edge, so it must
    // leave to the right instead of sliding back onto the screen.
    expect(classes).toContain("start-0");
    expect(classes).toContain("-translate-x-full");
    expect(classes).toContain("rtl:translate-x-full");
    expect(classes).not.toContain("translate-x-0");
  });

  it("is not translated when open", () => {
    const classes = classesOf(true);

    expect(classes).toContain("translate-x-0");
    expect(classes).not.toContain("-translate-x-full");
    expect(classes).not.toContain("rtl:translate-x-full");
  });

  it("stays in place on desktop in RTL as well as LTR", () => {
    // `rtl:translate-x-full` out-ranks a plain `md:translate-x-0`, so the
    // desktop reset needs its own rtl variant or the sidebar leaves the page.
    const classes = classesOf(false);

    expect(classes).toContain("md:translate-x-0");
    expect(classes).toContain("rtl:md:translate-x-0");
    expect(classes).toContain("md:static");
  });
});
