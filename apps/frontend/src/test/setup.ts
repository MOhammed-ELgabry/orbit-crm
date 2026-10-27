// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...)
// on Vitest's `expect`, including their TypeScript types.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library only unmounts rendered components automatically
// when `afterEach` is a global. Vitest runs without globals here, so do
// it explicitly to keep every test isolated.
afterEach(() => {
  cleanup();
});

// jsdom does not implement object URLs, which the profile-picture code uses to
// show a picked / fetched image. A counter-based stand-in keeps URLs unique.
if (typeof URL.createObjectURL !== "function") {
  let counter = 0;
  URL.createObjectURL = () => `blob:orbit-test/${(counter += 1)}`;
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => undefined;
}
