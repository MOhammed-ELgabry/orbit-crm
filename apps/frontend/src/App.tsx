import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RegisterPage from "./pages/auth/RegisterPage/RegisterPage";
import LoginPage from "./pages/auth/LoginPage/LoginPage";
import VerifyEmail from "./pages/auth/VerifyEmail/VerifyEmail";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage/ResetPasswordPage";
import IndustrySelection from "./pages/industry-selection/IndustrySelection";
import DashboardPage from "./pages/dashboard/DashboardPage";
import { ProtectedRoute } from "./Components/ProtectedRoute";
import DashboardLayout from "./Components/Dashboard/DashboardLayout";
import ContactsPage from "./pages/Contacts/ContactsPage";
import ContactDetailPage from "./pages/Contacts/ContactDetailPage";
import UsersPage from "./pages/Users/UsersPage";
import LeadsPage from "./pages/Leads/LeadsPage";
import LeadDetailPage from "./pages/Leads/LeadDetailPage";
import DealsPage from "./pages/Deals/DealsPage";
import TasksPage from "./pages/Tasks/TasksPage";
import CalendarPage from "./pages/Calendar/CalendarPage";
import SettingsPage from "./pages/Settings/SettingsPage";
import TermsOfServicePage from "./pages/Settings/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/Settings/PrivacyPolicyPage";
import ReportsPage from "./pages/Reports/ReportsPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="relative min-h-screen">
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

              <Route path="leads/:id" element={<LeadDetailPage />} />

              <Route path="deals" element={<DealsPage />} />

              <Route path="tasks" element={<TasksPage />} />

              <Route path="calendar" element={<CalendarPage />} />

              <Route path="reports" element={<ReportsPage />} />

              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/*
              Public — outside ProtectedRoute on purpose: legal pages must
              be reachable before sign-in/registration, not just from
              Settings. Still inside AuthProvider (which wraps the whole
              <Routes> tree below), so LegalDocumentView can read
              isAuthenticated for its back-link without requiring it.
            */}
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
export default App;