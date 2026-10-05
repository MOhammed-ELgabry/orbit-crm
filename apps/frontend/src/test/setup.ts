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