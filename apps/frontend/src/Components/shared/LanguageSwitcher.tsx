import { useTranslation } from "react-i18next";
import React from "react";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const changeLanguage = () => {
    const newLanguage = i18n.language === "en" ? "ar" : "en";

    i18n.changeLanguage(newLanguage);

    document.documentElement.dir = newLanguage === "ar" ? "rtl" : "ltr";
  };
  return (
    <div>
      <button
        type="button"
        onClick={changeLanguage}
        className="text-sm font-medium text-[#643ED7] bg-white px-4 py-2 rounded-[10px] shadow-sm"
      >
        {i18n.language === "en" ? "العربية" : "English"}
      </button>
    </div>
  );
}
