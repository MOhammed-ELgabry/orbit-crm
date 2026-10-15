/* eslint-disable react-refresh/only-export-components -- test helper, never part of the app bundle */
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import "../i18n";
import { ChatProvider } from "../context/ChatProvider";
import type { ChatStore } from "../context/chatStore";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

/**
 * Renders `ui` inside the REAL ChatProvider / ChatStore / reducer / socket
 * client; the calling test supplies a store wired to a fake REST api and a
 * fake WebSocket, and mocks auth.
 */
export function renderWithChat(
  ui: ReactElement,
  store: ChatStore,
  initialPath = "/dashboard/chat",
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ChatProvider store={store}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
        <LocationProbe />
      </ChatProvider>
    </MemoryRouter>,
  );
}
