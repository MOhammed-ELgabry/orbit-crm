import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar/Sidebar";
import DashboardHeader from "./DashboardHeader/DashboardHeader";
export default function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-16 shrink-0 border-b border-slate-100 bg-white">
          <DashboardHeader />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:p-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
