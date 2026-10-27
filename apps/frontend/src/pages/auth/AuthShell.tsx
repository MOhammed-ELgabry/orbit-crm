import type { ReactNode } from "react";

import { directionOf, useAuthLanguage } from "../../lib/authLocale";
import { useRopeDrop } from "../../lib/gsapMotion";
import AuthLanguageSwitcher from "./AuthLanguageSwitcher";

interface AuthShellProps {
  children: ReactNode;
  /** Max card width; register is wider because it has more fields. */
  width?: "sm" | "md";
}

const WIDTH = { sm: "max-w-[460px]", md: "max-w-[540px]" } as const;

/**
 * The one frame for every sign-in screen: a centred card on the Orbit
 * canvas with the temporary language switch in the corner. It replaces the
 * old two-column layouts (form + illustration), so the form is centred
 * horizontally and, whenever it fits, vertically; on a short or small
 * screen it simply scrolls with comfortable padding.
 *
 * The card is lowered into place once with GSAP as if hung from an invisible
 * rope: a soft drop, a small overshoot and a fading pendulum swing (skipped
 * for reduced motion, and it never blocks interaction). Each page mounts its
 * own shell, so the entrance replays when moving between sign-in pages.
 */
export default function AuthShell({ children, width = "md" }: AuthShellProps) {
  const language = useAuthLanguage();
  const cardRef = useRopeDrop<HTMLElement>();

  return (
    <div
      dir={directionOf(language)}
      className="relative flex min-h-screen overflow-x-clip w-full items-center justify-center bg-[radial-gradient(1200px_600px_at_50%_-10%,var(--color-brand-100),transparent_70%)] bg-slate-50 px-4 py-20 sm:px-6"
    >
      <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
        <AuthLanguageSwitcher />
      </div>

      <main
        ref={cardRef}
        className={`w-full ${WIDTH[width]} rounded-3xl border border-line bg-white px-5 py-8 shadow-card sm:px-10 sm:py-10`}
      >
        {children}
      </main>
    </div>
  );
}
