/* eslint-disable react-refresh/only-export-components -- test helper, never part of the app bundle */
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import "../i18n";
import { NotificationsProvider } from "../context/NotificationsProvider";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/**
 * Renders `ui` inside the real NotificationsProvider and a router. Only
 * the network boundary (notificationService) and auth are mocked by the
 * calling test, so the component, hooks, provider and i18n all run for
 * real.
 */
export function renderWithNotifications(
  ui: ReactElement,
  initialPath = "/dashboard",
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NotificationsProvider>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
        <LocationProbe />
      </NotificationsProvider>
    </MemoryRouter>,
  );
}