import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";
import { provideLoadMap } from "@rpgjs/client";
import loadMap from "./map-loader";
import { configureStudioGameRuntime } from "./data-provider";
import { configureStudioConstants } from "./constants";
import type { GameRuntimeMode } from "./data-provider/types";

export interface StudioGameModuleConfig {
  projectId?: string | null;
  runtimeMode?: GameRuntimeMode;
  apiBaseUrl?: string;
  bundleBasePath?: string;
  isProduction?: boolean;
  isPreprod?: boolean;
  baseUrl?: string;
  assetsUrl?: string;
  apiUrl?: string;
  displayTitleScreen?: boolean;
}

export function provideStudioGame(config: StudioGameModuleConfig = {}) {
  const hasProjectId = Boolean(config.projectId && config.projectId.trim().length > 0);

  const resolvedBaseUrl = config.baseUrl ?? "https://rpgjs.studio";
  const resolvedApiUrl = config.apiUrl ?? `${resolvedBaseUrl}/api`;
  const resolvedAssetsUrl = config.assetsUrl
    ?? (hasProjectId ? "https://assets.rpgjs.studio" : "/assets");

  configureStudioConstants({
    isProduction: config.isProduction,
    isPreprod: config.isPreprod,
    baseUrl: resolvedBaseUrl,
    assetsUrl: resolvedAssetsUrl,
    apiUrl: resolvedApiUrl,
  });

  configureStudioGameRuntime({
    projectId: config.projectId ?? null,
    runtimeMode: config.runtimeMode,
    apiBaseUrl: config.apiBaseUrl ?? resolvedApiUrl,
    bundleBasePath: config.bundleBasePath ?? "/game-data",
  });

  return createModule("StudioGame", [
    {
      server: server?.(config),
      client: client?.(config),
    },
    provideLoadMap?.(loadMap),
  ]);
}
