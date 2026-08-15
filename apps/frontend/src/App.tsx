import { BrowserRouter, Routes, Route } from "react-router-dom";
import RegisterPage from "./pages/auth/RegisterPage/RegisterPage";
import LoginPage from "./pages/auth/LoginPage/LoginPage";
import VerifyEmail from "./pages/auth/VerifyEmail/VerifyEmail";
import LanguageSwitcher from "./Components/shared/LanguageSwitcher";
import IndustrySelection from "./pages/industry-selection/IndustrySelection";

function App() {
  return (
    <BrowserRouter>
      <div className="relative min-h-screen">
        <div className="absolute top-6 end-6 z-50">
          <LanguageSwitcher />
        </div>

        <Routes>
          <Route path="/" element={<RegisterPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/industry-selection" element={<IndustrySelection />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
export default App;
