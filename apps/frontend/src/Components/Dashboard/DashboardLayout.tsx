import { useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "./Sidebar";
import DashboardHeader from "./DashboardHeader";

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen overflow-hidden bg-[#f6f8fc]">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] md:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-white/95 backdrop-blur">
          <DashboardHeader onOpenNavigation={() => setIsSidebarOpen(true)} />
        </header>

        {/*
          Settings → Appearance applies only here (the main content
          canvas), never to the sidebar or header above, which stay on
          the product's own brand colors. --orbit-content-bg/-fg are set
          on <html> by AuthContext (see applyUserPreferences) from the
          signed-in user's saved backgroundColor, with a fallback to
          today's default so this looks identical for anyone who hasn't
          chosen a custom color.
        */}
        <main
          className="min-h-0 flex-1 overflow-y-auto"
          style={{
            backgroundColor: "var(--orbit-content-bg, #f6f8fc)",
            color: "var(--orbit-content-fg, #172033)",
          }}
        >
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}