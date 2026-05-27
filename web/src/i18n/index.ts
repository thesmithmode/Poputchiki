import ru from "./ru.json";

export const defaultNS = "translation";
export const resources = { ru: { translation: ru } } as const;

export const i18nConfig = {
  resources,
  lng: "ru",
  fallbackLng: "ru",
  defaultNS,
  interpolation: {
    escapeValue: false,
  },
} as const;

export default i18nConfig;
