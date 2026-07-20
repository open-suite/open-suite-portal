// Simple i18n configuration

export const locales = ["en", "nl"];

// Import all messages statically
import enMessages from "../../messages/en.json";
import nlMessages from "../../messages/nl.json";

const messagesMap = {
  en: enMessages,
  nl: nlMessages,
};
export const LOCALE_STORAGE_LANG_KEY = "preferred-locale";
// English-only for now (locales/messages stay for when localization lands).
// Force en regardless of browser/stored preference; no language switcher is
// shown, so this is the single source of the UI language.
export const INITIAL_LOCALE = "en";

// Load translations
export async function getTranslations(locale = INITIAL_LOCALE) {
  return messagesMap[locale] || messagesMap[INITIAL_LOCALE];
}

// Translation function
export function createTranslator(messages, namespace) {
  return (key) => {
    if (namespace) {
      return messages?.[namespace]?.[key] || key;
    }
    return messages?.[key] || key;
  };
}
