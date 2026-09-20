import { useTranslation } from "react-i18next";

import LegalDocumentView from "./LegalDocumentView";
import { privacyPolicy as privacyPolicyEn } from "../../locales/en/legal";
import { privacyPolicy as privacyPolicyAr } from "../../locales/ar/legal";

export default function PrivacyPolicyPage() {
  const { i18n } = useTranslation();
  const document = i18n.language === "ar" ? privacyPolicyAr : privacyPolicyEn;

  return <LegalDocumentView document={document} />;
}
