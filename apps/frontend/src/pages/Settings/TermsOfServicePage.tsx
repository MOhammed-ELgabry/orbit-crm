import { useTranslation } from "react-i18next";

import LegalDocumentView from "./LegalDocumentView";
import { termsOfService as termsOfServiceEn } from "../../locales/en/legal";
import { termsOfService as termsOfServiceAr } from "../../locales/ar/legal";

export default function TermsOfServicePage() {
  const { i18n } = useTranslation();
  const document = i18n.language === "ar" ? termsOfServiceAr : termsOfServiceEn;

  return <LegalDocumentView document={document} />;
}