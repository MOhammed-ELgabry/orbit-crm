import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OrbitBrand from "./OrbitBrand";

describe("OrbitBrand", () => {
  it("shows the product name Orbit, never the old placeholder", () => {
    render(<OrbitBrand />);

    expect(screen.getByText("Orbit")).toBeInTheDocument();
    expect(screen.queryByText("Base")).not.toBeInTheDocument();
  });

  it("is always left-to-right so the mark keeps its order on Arabic pages", () => {
    render(
      <div dir="rtl">
        <OrbitBrand />
      </div>,
    );

    expect(screen.getByTestId("orbit-brand")).toHaveAttribute("dir", "ltr");
  });

  it("treats the image as decoration because the wordmark names the product", () => {
    const { container } = render(<OrbitBrand />);
    const img = container.querySelector("img");

    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("has a larger stacked auth variant and a compact sidebar variant", () => {
    const { rerender } = render(<OrbitBrand variant="auth" />);
    expect(screen.getByTestId("orbit-brand").className).toContain("flex-col");

    rerender(<OrbitBrand variant="sidebar" />);
    expect(screen.getByTestId("orbit-brand").className).toContain("flex-row");
  });
});
