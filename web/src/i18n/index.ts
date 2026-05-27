import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./ru.json";

export const defaultNS = "translation";
export const resources = { ru: { translation: ru } } as const;

i18n.use(initReactI18next).init({
  resources,
  lng: "ru",
  fallbackLng: "ru",
  defaultNS,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
