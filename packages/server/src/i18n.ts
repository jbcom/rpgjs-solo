import { createI18nProvider, type I18nConfig } from "@rpgjs/common";

export function provideI18n(config: I18nConfig = {}) {
  return createI18nProvider(config);
}
