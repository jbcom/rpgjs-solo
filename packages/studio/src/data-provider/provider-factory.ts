import { apiUrl } from '../constants';
import { HttpGameDataProvider } from './http-game-data-provider';
import { LocalBundleGameDataProvider } from './local-bundle-game-data-provider';
import type { GameDataProvider, GameRuntimeMode, ProviderConfig } from './types';
import { resolveRuntimeModeOrNull } from './runtime-mode';

const getDefaultConfig = (): ProviderConfig => ({
  apiBaseUrl: apiUrl,
  bundleBasePath: '/game-data',
});

class AutoFallbackGameDataProvider implements GameDataProvider {
  readonly kind = 'auto-fallback' as const;

  constructor(
    private readonly local: LocalBundleGameDataProvider,
    private readonly http: HttpGameDataProvider
  ) {}

  async getProject(query: { projectId?: string | null; mapId?: string | null }): Promise<any> {
    try {
      const localValue = await this.local.getProject(query);
      if (
        localValue &&
        !localValue.__placeholder &&
        (!query.projectId || !localValue._id || String(localValue._id) === String(query.projectId))
      ) {
        return localValue;
      }
    } catch (error) {
      console.warn('[AutoFallbackGameDataProvider] local project failed, fallback to online', error);
    }
    return this.http.getProject(query);
  }

  async getMap(mapId: string): Promise<any> {
    try {
      const localValue = await this.local.getMap(mapId);
      if (localValue && !localValue.__placeholder) {
        return localValue;
      }
    } catch (error) {
      console.warn('[AutoFallbackGameDataProvider] local map failed, fallback to online', error);
    }
    return this.http.getMap(mapId);
  }

  async getMedia(mediaId: string): Promise<any> {
    try {
      const localValue = await this.local.getMedia(mediaId);
      if (localValue && !localValue.__placeholder) {
        return localValue;
      }
    } catch (error) {
      console.warn('[AutoFallbackGameDataProvider] local media failed, fallback to online', error);
    }
    return this.http.getMedia(mediaId);
  }

  async getDatabase(projectId?: string): Promise<any[]> {
    try {
      const localValue = await this.local.getDatabase(projectId);
      if (localValue.length > 0) {
        return localValue;
      }
    } catch (error) {
      console.warn('[AutoFallbackGameDataProvider] local database failed, fallback to online', error);
    }
    return this.http.getDatabase(projectId);
  }
}

let providerInstance: GameDataProvider | null = null;
type StudioGameRuntimeConfig = {
  projectId: string | null;
  runtimeMode?: GameRuntimeMode;
  apiBaseUrl?: string;
  bundleBasePath?: string;
};

let runtimeConfig: StudioGameRuntimeConfig = {
  projectId: null,
};

const resolveRuntimeModeFromConfig = (): GameRuntimeMode => {
  if (runtimeConfig.runtimeMode) {
    return runtimeConfig.runtimeMode;
  }

  const runtimeMode = resolveRuntimeModeOrNull();
  if (runtimeMode) {
    return runtimeMode;
  }

  const hasProjectId = Boolean(runtimeConfig.projectId && runtimeConfig.projectId.trim().length > 0);
  if (hasProjectId) return 'online';
  return 'offline';
};

const resolveProviderConfig = (): ProviderConfig => {
  const defaultConfig = getDefaultConfig();
  return {
    apiBaseUrl: runtimeConfig.apiBaseUrl || defaultConfig.apiBaseUrl,
    bundleBasePath: runtimeConfig.bundleBasePath || defaultConfig.bundleBasePath,
  };
};

export const createGameDataProvider = (
  mode: GameRuntimeMode,
  config: ProviderConfig = getDefaultConfig()
): GameDataProvider => {
  const httpProvider = new HttpGameDataProvider(config);
  const localProvider = new LocalBundleGameDataProvider(config);

  if (mode === 'online') return httpProvider;
  if (mode === 'offline') return localProvider;
  return new AutoFallbackGameDataProvider(localProvider, httpProvider);
};

export const configureGameDataProvider = (provider: GameDataProvider): void => {
  providerInstance = provider;
};

export const configureStudioGameRuntime = (config: Partial<StudioGameRuntimeConfig>): void => {
  runtimeConfig = {
    ...runtimeConfig,
    ...config,
  };
  resetGameDataProvider();
};

export const getStudioGameRuntimeConfig = (): StudioGameRuntimeConfig => {
  return runtimeConfig;
};

export const resetGameDataProvider = (): void => {
  providerInstance = null;
};

export const getGameDataProvider = (): GameDataProvider => {
  if (providerInstance) return providerInstance;
  const mode = resolveRuntimeModeFromConfig();
  providerInstance = createGameDataProvider(mode, resolveProviderConfig());
  return providerInstance;
};
