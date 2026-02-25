import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";
import { provideLoadMap } from "@rpgjs/client";
import loadMap from "./map-loader";
import { configureStudioGameRuntime } from "./data-provider";

export interface StudioGameModuleConfig {
  projectId?: string | null;
  apiBaseUrl?: string;
  bundleBasePath?: string;
}

export function provideStudioGame(config: StudioGameModuleConfig = {}) {
  configureStudioGameRuntime({
    projectId: config.projectId ?? null,
    apiBaseUrl: config.apiBaseUrl,
    bundleBasePath: config.bundleBasePath,
  });

  return createModule("StudioGame", [
    {
      server,
      client,
    },
    provideLoadMap?.(loadMap),
  ]);
}
