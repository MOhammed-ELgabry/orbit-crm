// import { Link } from "react-router-dom";
// import { useTranslation } from "react-i18next";

// export default function ForgotPassword() {
//   const { t } = useTranslation();

//   return (
//     <Link
//       to="/forgot-password"
//       className="text-xs font-medium text-brand-600"
//     >
//       {t("forgotPassword")}
//     </Link>
//   );
// }

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ForgotPassword() {
  const { t } = useTranslation();

  return (
    <Link
      to="/forgot-password"
      className="text-xs font-medium text-brand-600 transition-colors duration-200 hover:text-brand-700 hover:underline"
    >
      {t("forgotPassword")}
    </Link>
  );
}
