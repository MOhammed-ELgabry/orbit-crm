import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ForgotPassword() {
  const { t } = useTranslation();

  return (
    <Link
      to="/forgot-password"
      className="text-xs font-medium text-[#643ED7]"
    >
      {t("forgotPassword")}
    </Link>
  );
}