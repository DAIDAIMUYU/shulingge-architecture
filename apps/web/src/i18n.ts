import { en, zh } from "./locales.js";

export type AppLocale = "zh" | "en";
export type LocaleKey = keyof typeof zh;

const dictionaries: Record<AppLocale, Record<string, string>> = {
  zh,
  en,
};

export function translate(locale: AppLocale, key: LocaleKey): string {
  return dictionaries[locale][key] ?? dictionaries.zh[key] ?? key;
}
