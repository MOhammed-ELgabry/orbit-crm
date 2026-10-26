import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

import "../../i18n";
import { authI18n, forgetAuthLanguageChoice } from "../../lib/authLocale";
import { AuthLocaleLayout } from "./AuthLocaleScope";
import AuthShell from "./AuthShell";
import { useTranslation } from "react-i18next";

function Page({ to, name }: { to: string; name: string }) {
  const { t } = useTranslation();

  return (
    <AuthShell>
      <h1>{`${name}:${t("login")}`}</h1>
      <Link to={to}>go</Link>
    </AuthShell>
  );
}

const renderAuth = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route element={<AuthLocaleLayout />}>
          <Route path="/login" element={<Page to="/register" name="login" />} />
          <Route
            path="/register"
            element={<Page to="/login" name="register" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("temporary sign-in language", () => {
  beforeEach(async () => {
    forgetAuthLanguageChoice();
    await i18n.changeLanguage("en");
    await authI18n.changeLanguage("en");
    document.documentElement.dir = "ltr";
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => forgetAuthLanguageChoice());

  it("switches the screen to Arabic/RTL without touching the app language", async () => {
    const user = userEvent.setup();
    renderAuth();

    expect(screen.getByRole("heading")).toHaveTextContent("login:Login");

    await user.click(screen.getByRole("button", { name: "العربية" }));

    expect(screen.getByRole("heading")).toHaveTextContent("login:تسجيل الدخول");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    // The saved/app language is untouched, and nothing was persisted.
    expect(i18n.language).toBe("en");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("keeps the choice when moving between sign-in pages", async () => {
    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: "العربية" }));
    await user.click(screen.getByRole("link", { name: "go" }));

    expect(screen.getByRole("heading")).toHaveTextContent(
      "register:تسجيل الدخول",
    );
    expect(
      within(screen.getByRole("group")).getByRole("button", {
        name: "العربية",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    { saved: "en", picks: "العربية", tempDir: "rtl", tempLang: "ar" },
    { saved: "ar", picks: "English", tempDir: "ltr", tempLang: "en" },
  ])(
    "keeps screen and popup in the temporary language until the app takes over (saved=$saved)",
    async ({ saved, picks, tempDir, tempLang }) => {
      const root = document.documentElement;
      const savedDir = saved === "ar" ? "rtl" : "ltr";
      const user = userEvent.setup();

      await i18n.changeLanguage(saved);
      await authI18n.changeLanguage(saved);
      const { unmount } = renderAuth();

      await user.click(screen.getByRole("button", { name: picks }));
      expect([root.dir, root.lang]).toEqual([tempDir, tempLang]);

      // Sign-in succeeded: AuthContext applies the saved language to <html>
      // while the welcome popup is still open (same calls as
      // applyUserPreferences).
      const popup = document.createElement("div");
      popup.className = "swal2-container";
      document.body.appendChild(popup);
      await i18n.changeLanguage(saved);
      root.dir = savedDir;
      root.lang = saved;
      await Promise.resolve();

      // Still on the sign-in screen: no mix of one language and the other's
      // direction.
      expect([root.dir, root.lang]).toEqual([tempDir, tempLang]);

      // Navigating to the app: <html> takes the saved language, and the
      // fading popup keeps the direction its text is written in.
      unmount();
      expect([root.dir, root.lang]).toEqual([savedDir, saved]);
      expect([popup.dir, popup.lang]).toEqual([tempDir, tempLang]);
      expect(i18n.language).toBe(saved);

      popup.remove();
    },
  );

  it("restores the document direction when leaving the sign-in screens", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAuth();

    await user.click(screen.getByRole("button", { name: "العربية" }));
    expect(document.documentElement.dir).toBe("rtl");

    unmount();
    expect(document.documentElement.dir).toBe("ltr");
    expect(i18n.language).toBe("en");
  });
});
