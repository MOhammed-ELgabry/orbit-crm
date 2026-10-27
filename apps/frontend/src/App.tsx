import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsProvider";
import { ChatProvider } from "./context/ChatProvider";
import ChatNotificationsBridge from "./Components/Notification/ChatNotificationsBridge";
import {
  AuthLocaleLayout,
  LegalLocaleScope,
} from "./pages/auth/AuthLocaleScope";
import RegisterPage from "./pages/auth/RegisterPage/RegisterPage";
import LoginPage from "./pages/auth/LoginPage/LoginPage";
import VerifyEmail from "./pages/auth/VerifyEmail/VerifyEmail";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage/ResetPasswordPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import { ProtectedRoute } from "./Components/ProtectedRoute";
import DashboardLayout from "./Components/Dashboard/DashboardLayout";
import ContactsPage from "./pages/Contacts/ContactsPage";
import ContactDetailPage from "./pages/Contacts/ContactDetailPage";
import ContactsImportPage from "./pages/Contacts/ContactsImportPage";
import UsersPage from "./pages/Users/UsersPage";
import LeadsPage from "./pages/Leads/LeadsPage";
import LeadDetailPage from "./pages/Leads/LeadDetailPage";
import DealsPage from "./pages/Deals/DealsPage";
import DealDetailPage from "./pages/Deals/DealDetailPage";
import TasksPage from "./pages/Tasks/TasksPage";
import CalendarPage from "./pages/Calendar/CalendarPage";
import SettingsPage from "./pages/Settings/SettingsPage";
import TermsOfServicePage from "./pages/Settings/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/Settings/PrivacyPolicyPage";
import NotificationsPage from "./pages/Notifications/NotificationsPage";
import ChatPage from "./pages/Chat/ChatPage";
import MyErpPage from "./pages/MyErp/MyErpPage";
import AuditLogPage from "./pages/AuditLog/AuditLogPage";
import OwnerRoute from "./Components/Audit/OwnerRoute";

// Loaded on demand: the Reports page is the only consumer of recharts, so
// keeping it out of the main bundle means every other page ships without it.
const ReportsPage = lazy(() => import("./pages/Reports/ReportsPage"));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <ChatProvider>
            <ChatNotificationsBridge />
            <div className="relative min-h-screen">
              <Routes>
                {/*
                  Sign-in screens share one layout that provides the isolated,
                  temporary language (see lib/authLocale.ts). It is a pathless
                  layout route, so every URL below is unchanged.
                */}
                <Route element={<AuthLocaleLayout />}>
                  <Route path="/" element={<RegisterPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route
                    path="/forgot-password"
                    element={<ForgotPasswordPage />}
                  />
                  <Route
                    path="/reset-password"
                    element={<ResetPasswordPage />}
                  />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                </Route>
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

                  <Route
                    path="contacts/import"
                    element={<ContactsImportPage />}
                  />

                  <Route path="contacts/:id" element={<ContactDetailPage />} />

                  <Route path="users" element={<UsersPage />} />

                  <Route path="leads" element={<LeadsPage />} />

                  <Route path="leads/:id" element={<LeadDetailPage />} />

                  <Route path="deals" element={<DealsPage />} />
                  <Route path="deals/:id" element={<DealDetailPage />} />

                  <Route path="tasks" element={<TasksPage />} />

                  <Route path="calendar" element={<CalendarPage />} />

                  <Route
                    path="reports"
                    element={
                      <Suspense
                        fallback={
                          <div
                            className="flex min-h-[40vh] items-center justify-center"
                            role="status"
                          >
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
                          </div>
                        }
                      >
                        <ReportsPage />
                      </Suspense>
                    }
                  />

                  <Route path="notifications" element={<NotificationsPage />} />

                  <Route path="chat" element={<ChatPage />} />

                  {/* Placeholder only: no API, no data. */}
                  <Route path="my-erp" element={<MyErpPage />} />

                  {/* Owner-only. OwnerRoute is UX only; the backend decides. */}
                  <Route
                    path="audit-log"
                    element={
                      <OwnerRoute>
                        <AuditLogPage />
                      </OwnerRoute>
                    }
                  />

                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                {/*
              Public — outside ProtectedRoute on purpose: legal pages must
              be reachable before sign-in/registration, not just from
              Settings. Still inside AuthProvider (which wraps the whole
              <Routes> tree below), so LegalDocumentView can read
              isAuthenticated for its back-link without requiring it.
            */}
                <Route
                  path="/terms"
                  element={
                    <LegalLocaleScope>
                      <TermsOfServicePage />
                    </LegalLocaleScope>
                  }
                />
                <Route
                  path="/privacy"
                  element={
                    <LegalLocaleScope>
                      <PrivacyPolicyPage />
                    </LegalLocaleScope>
                  }
                />
              </Routes>
            </div>
          </ChatProvider>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
export default App;
