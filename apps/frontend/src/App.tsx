import { BrowserRouter, Routes, Route } from "react-router-dom";
import RegisterPage from "./pages/auth/RegisterPage/RegisterPage";
import LoginPage from "./pages/auth/LoginPage/LoginPage";
import VerifyEmail from "./pages/auth/VerifyEmail/VerifyEmail";

import IndustrySelection from "./pages/industry-selection/IndustrySelection";
import DashboardLayout from "./Components/Dashboard/DashboardLayout";

import Companies from "./pages/Companies/Companies";
import LeadsPage from "./pages/Leads/LeadsPage";
import DealsPage from "./pages/Deals/DealsPage";
import UsersPage from "./pages/Users/UsersPage";
import TasksPage from "./pages/Tasks/TasksPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ReportsPage from "./pages/Reports/ReportsPage";
import SettingsPage from "./pages/Settings/SettingsPage";
import CalendarPage from "./pages/Calendar/CalendarPage";

function App() {
  return (
    <BrowserRouter>
      <div className="relative min-h-screen">
        <Routes>
          <Route path="/" element={<RegisterPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/industry-selection" element={<IndustrySelection />} />

          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />

            <Route path="companies" element={<Companies />} />

            <Route path="users" element={<UsersPage />} />

            <Route path="leads" element={<LeadsPage />} />

            <Route path="deals" element={<DealsPage />} />

            <Route path="tasks" element={<TasksPage />} />

            <Route path="calendar" element={<CalendarPage />} />

            <Route path="reports" element={<ReportsPage />} />

            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}
export default App;
