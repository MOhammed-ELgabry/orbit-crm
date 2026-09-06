import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RegisterPage from "./pages/auth/RegisterPage/RegisterPage";
import LoginPage from "./pages/auth/LoginPage/LoginPage";
import VerifyEmail from "./pages/auth/VerifyEmail/VerifyEmail";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage/ResetPasswordPage";
import LanguageSwitcher from "./Components/shared/LanguageSwitcher";
import IndustrySelection from "./pages/industry-selection/IndustrySelection";
import DashboardPage from "./pages/dashboard/DashboardPage";
import { ProtectedRoute } from "./Components/ProtectedRoute";
import DashboardLayout from "./Components/Dashboard/DashboardLayout";
import ContactsPage from "./pages/Contacts/ContactsPage";
import ContactDetailPage from "./pages/Contacts/ContactDetailPage";
import UsersPage from "./pages/Users/UsersPage";
import LeadsPage from "./pages/Leads/LeadsPage";
import DealsPage from "./pages/Deals/DealsPage";
import TasksPage from "./pages/Tasks/TasksPage";
import CalendarPage from "./pages/Calendar/CalendarPage";
import SettingsPage from "./pages/Settings/SettingsPage";
import ReportsPage from "./pages/Reports/ReportsPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="relative min-h-screen">
          <div className="absolute top-6 end-6 z-50">
            <LanguageSwitcher />
          </div>

          <Routes>
            <Route path="/" element={<RegisterPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/industry-selection" element={<IndustrySelection />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />

              <Route path="contacts" element={<ContactsPage />} />

              <Route path="contacts/:id" element={<ContactDetailPage />} />

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
      </AuthProvider>
    </BrowserRouter>
  );
}
export default App;
