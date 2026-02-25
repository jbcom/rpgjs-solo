import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";
import { provideLoadMap } from "@rpgjs/client";
import loadMap from "./map-loader";
import { configureStudioGameRuntime } from "./data-provider";
import { configureStudioConstants } from "./constants";

export interface StudioGameModuleConfig {
  projectId?: string | null;
  apiBaseUrl?: string;
  bundleBasePath?: string;
  isProduction?: boolean;
  isPreprod?: boolean;
  baseUrl?: string;
  assetsUrl?: string;
  apiUrl?: string;
}

export function provideStudioGame(config: StudioGameModuleConfig = {}) {
  configureStudioConstants({
    isProduction: config.isProduction,
    isPreprod: config.isPreprod,
    baseUrl: config.baseUrl,
    assetsUrl: config.assetsUrl,
    apiUrl: config.apiUrl,
  });

  configureStudioGameRuntime({
    projectId: config.projectId ?? null,
    apiBaseUrl: config.apiBaseUrl,
    bundleBasePath: config.bundleBasePath,
  });

  return createModule("StudioGame", [
    {
      server: server?.(config),
      client: client?.(config),
    },
    provideLoadMap?.(loadMap),
  ]);
}
