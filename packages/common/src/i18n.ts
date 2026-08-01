import { Context, inject, provide } from "@signe/di";
import type { RpgContext, RpgFactoryProvider } from "./foundation";

export type I18nLocaleMessages = Record<string, string>;
export type I18nMessages = Record<string, I18nLocaleMessages>;

export type I18nParamPrimitive = string | number | boolean | null;
export type I18nParamValue = I18nParamPrimitive | I18nMessageDescriptor;
export type I18nParams = Record<string, I18nParamValue>;

/** A translation key and serializable interpolation values resolved by the consumer locale. */
export interface I18nMessageDescriptor {
  key: string;
  params?: I18nParams;
  /** Selects `<key>.<Intl.PluralRules category>` on the receiving client. */
  count?: number;
}

/** Player-visible text may be literal or deferred to the receiving i18n service. */
export type I18nText = string | I18nMessageDescriptor;

const isPlainRecord = (value: object): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isI18nParamValue = (
  value: unknown,
  ancestors: Set<object>
): value is I18nParamValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  return isI18nMessageDescriptorInternal(value, ancestors);
};

const isI18nMessageDescriptorInternal = (
  value: unknown,
  ancestors: Set<object>
): value is I18nMessageDescriptor => {
  if (!value || typeof value !== "object" || !isPlainRecord(value)) return false;
  if (ancestors.has(value)) return false;
  const descriptor = value as Record<string, unknown>;
  if (
    Object.keys(descriptor).some(
      (key) => key !== "key" && key !== "params" && key !== "count"
    )
  ) {
    return false;
  }
  if (typeof descriptor.key !== "string" || descriptor.key.length === 0) return false;
  if (
    descriptor.count !== undefined &&
    (typeof descriptor.count !== "number" || !Number.isFinite(descriptor.count))
  ) {
    return false;
  }
  if (descriptor.params === undefined) return true;
  if (
    !descriptor.params ||
    typeof descriptor.params !== "object" ||
    !isPlainRecord(descriptor.params)
  ) {
    return false;
  }
  ancestors.add(value);
  let valid = false;
  try {
    valid = Object.values(descriptor.params).every((param) =>
      isI18nParamValue(param, ancestors)
    );
  } catch {
    valid = false;
  }
  ancestors.delete(value);
  return valid;
};

export function isI18nMessageDescriptor(value: unknown): value is I18nMessageDescriptor {
  try {
    return isI18nMessageDescriptorInternal(value, new Set());
  } catch {
    return false;
  }
}

export function assertI18nText(value: unknown): asserts value is I18nText {
  if (typeof value === "string" || isI18nMessageDescriptor(value)) return;
  throw new TypeError(
    "Localized text must be a literal string or a JSON-safe i18n descriptor"
  );
}

export interface I18nConfig {
  defaultLocale?: string;
  fallbackLocale?: string;
  messages?: I18nMessages;
}

type I18nLayer = {
  source: string;
  priority: number;
  messages: I18nMessages;
  order: number;
};

type PendingI18nLayer = Omit<I18nLayer, "order">;

export const I18nServiceToken = "I18nServiceToken";
const PendingI18nLayersKey = "__rpgjs_pending_i18n_layers__";

let layerOrder = 0;

function normalizeMessages(messages?: I18nMessages): I18nMessages {
  if (!messages) return {};
  const normalized: I18nMessages = {};
  for (const locale in messages) {
    const catalog = messages[locale];
    if (!catalog || typeof catalog !== "object") continue;
    normalized[locale] = { ...catalog };
  }
  return normalized;
}

function hasMessages(messages?: I18nMessages): messages is I18nMessages {
  if (!messages) return false;
  return Object.values(messages).some((catalog) => catalog && Object.keys(catalog).length > 0);
}

function interpolate(
  message: string,
  params: I18nParams,
  resolveParam: (value: I18nParamValue) => string
): string {
  return message.replace(/\{([^{}]+)\}/g, (match, key) => {
    const name = String(key).trim();
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const value = params[name];
    return value == null ? "" : resolveParam(value);
  });
}

function getPendingLayers(context: Context): PendingI18nLayer[] {
  const values = context as unknown as Record<string, any>;
  values[PendingI18nLayersKey] ||= [];
  return values[PendingI18nLayersKey];
}

export class I18nService {
  defaultLocale: string;
  fallbackLocale: string;
  private layers: I18nLayer[] = [];

  constructor(config: I18nConfig = {}) {
    this.defaultLocale = config.defaultLocale || "en";
    this.fallbackLocale = config.fallbackLocale || this.defaultLocale;
    this.addMessages(config.messages, "game", 20);
  }

  configure(config: I18nConfig = {}) {
    if (config.defaultLocale) this.defaultLocale = config.defaultLocale;
    if (config.fallbackLocale) this.fallbackLocale = config.fallbackLocale;
    if (config.messages) this.addMessages(config.messages, "game", 20);
  }

  addMessages(messages?: I18nMessages, source = "module", priority = 10) {
    if (!hasMessages(messages)) return;
    this.layers.push({
      source,
      priority,
      messages: normalizeMessages(messages),
      order: layerOrder++,
    });
  }

  hasLocale(locale: string): boolean {
    return this.layers.some((layer) => !!layer.messages[locale]);
  }

  translate(key: string, params: I18nParams = {}, locale = this.defaultLocale): string {
    const translated = this.resolve(key, locale) ?? this.resolve(key, this.fallbackLocale) ?? key;
    return interpolate(translated, params, (value) =>
      isI18nMessageDescriptor(value)
        ? this.translateDescriptor(value, locale)
        : String(value)
    );
  }

  t(key: string, params?: I18nParams, locale?: string): string {
    return this.translate(key, params, locale);
  }

  translateDescriptor(
    descriptor: I18nMessageDescriptor,
    locale = this.defaultLocale
  ): string {
    if (!isI18nMessageDescriptor(descriptor)) {
      throw new TypeError("Cannot translate a non-serializable i18n descriptor");
    }
    const params = descriptor.params ?? {};
    if (descriptor.count === undefined) {
      return this.translate(descriptor.key, params, locale);
    }
    const translated =
      this.resolvePlural(descriptor.key, descriptor.count, locale) ??
      this.resolvePlural(descriptor.key, descriptor.count, this.fallbackLocale) ??
      descriptor.key;
    return interpolate(translated, params, (value) =>
      isI18nMessageDescriptor(value)
        ? this.translateDescriptor(value, locale)
        : String(value)
    );
  }

  private resolvePlural(
    key: string,
    count: number,
    locale: string
  ): string | undefined {
    let category: Intl.LDMLPluralRule;
    try {
      category = new Intl.PluralRules(locale).select(count);
    } catch {
      category = "other";
    }
    return (
      this.resolve(`${key}.${category}`, locale) ??
      this.resolve(`${key}.other`, locale) ??
      this.resolve(key, locale)
    );
  }

  private resolve(key: string, locale: string): string | undefined {
    const layers = [...this.layers].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.order - a.order;
    });
    for (const layer of layers) {
      const value = layer.messages[locale]?.[key];
      if (typeof value === "string") return value;
    }
    return undefined;
  }
}

export function getOrCreateI18nService(context?: RpgContext | null, config?: I18nConfig): I18nService {
  if (!context) {
    return new I18nService(config);
  }
  const signeContext = context as Context;
  let service = inject<I18nService>(signeContext, I18nServiceToken, { optional: true });
  if (!service) {
    service = new I18nService();
    for (const layer of getPendingLayers(signeContext)) {
      service.addMessages(layer.messages, layer.source, layer.priority);
    }
    provide(signeContext, I18nServiceToken, service);
  }
  if (config) service.configure(config);
  return service;
}

export function registerI18nMessages(
  context: RpgContext,
  messages: I18nMessages | undefined,
  source = "module",
  priority = 10
) {
  if (!hasMessages(messages)) return;
  const signeContext = context as Context;
  const service = inject<I18nService>(signeContext, I18nServiceToken, { optional: true });
  if (service) {
    service.addMessages(messages, source, priority);
    return;
  }
  getPendingLayers(signeContext).push({
    source,
    priority,
    messages: normalizeMessages(messages),
  });
}

export function createI18nProvider(config: I18nConfig = {}): RpgFactoryProvider<I18nService> {
  return {
    provide: I18nServiceToken,
    useFactory: (context: RpgContext) => getOrCreateI18nService(context, config),
  };
}
