export interface StudioConstantsConfig {
  isProduction: boolean;
  isPreprod: boolean;
  baseUrl: string;
  assetsUrl: string;
  apiUrl: string;
}

const envProduction = (() => {
  try {
    return Boolean(import.meta.env?.PROD);
  } catch {
    return false;
  }
})();

const envPreprod = (() => {
  try {
    return Boolean(import.meta.env?.PREPROD);
  } catch {
    return false;
  }
})();

const buildDefaults = (): StudioConstantsConfig => {
  const defaultBaseUrl = "https://rpgjs.studio";
  const defaultAssetsUrl = "https://assets.rpgjs.studio";

  return {
    isProduction: envProduction,
    isPreprod: envPreprod,
    baseUrl: defaultBaseUrl,
    assetsUrl: defaultAssetsUrl,
    apiUrl: `${defaultBaseUrl}/api`,
  };
};

const defaultConstants = buildDefaults();

export let isProduction = defaultConstants.isProduction;
export let isPreprod = defaultConstants.isPreprod;
export let baseUrl = defaultConstants.baseUrl;
export let assetsUrl = defaultConstants.assetsUrl;
export let apiUrl = defaultConstants.apiUrl;

export const configureStudioConstants = (
  config: Partial<StudioConstantsConfig> = {}
): void => {
  isProduction = config.isProduction ?? isProduction;
  isPreprod = config.isPreprod ?? isPreprod;
  baseUrl = config.baseUrl ?? baseUrl;
  assetsUrl = config.assetsUrl ?? assetsUrl;
  apiUrl = config.apiUrl ?? `${baseUrl}/api`;
};
