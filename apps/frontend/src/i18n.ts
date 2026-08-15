import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation";
import ar from "./locales/ar/translation";

const resources = {
  en: {
    translation: en,
  },
  ar: {
    translation: ar,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});
