export type GameRuntimeMode = 'online' | 'offline' | 'auto';

export interface ProjectQuery {
  projectId?: string | null;
  mapId?: string | null;
}

export interface GameDataProvider {
  readonly kind: GameRuntimeMode | 'auto-fallback';
  getProject(query: ProjectQuery): Promise<any>;
  getMap(mapId: string): Promise<any>;
  getMedia(mediaId: string): Promise<any>;
  getDatabase(projectId?: string): Promise<any[]>;
}

export interface ProviderConfig {
  apiBaseUrl: string;
  bundleBasePath: string;
}
