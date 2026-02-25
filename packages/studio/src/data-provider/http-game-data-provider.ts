import type { GameDataProvider, ProviderConfig, ProjectQuery } from './types';

const fetchJson = async (url: string, label: string): Promise<any> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[HttpGameDataProvider] ${label} failed (${response.status}) for ${url}`);
  }
  return response.json();
};

export class HttpGameDataProvider implements GameDataProvider {
  readonly kind = 'online' as const;

  constructor(private readonly config: ProviderConfig) {}

  async getProject(query: ProjectQuery): Promise<any> {
    if (query.projectId) {
      return fetchJson(
        `${this.config.apiBaseUrl}/game/project?projectId=${query.projectId}`,
        'project query by projectId'
      );
    }

    if (query.mapId) {
      return fetchJson(
        `${this.config.apiBaseUrl}/game/project?mapId=${query.mapId}`,
        'project query by mapId'
      );
    }

    throw new Error('[HttpGameDataProvider] getProject requires projectId or mapId');
  }

  getMap(mapId: string): Promise<any> {
    return fetchJson(`${this.config.apiBaseUrl}/game/maps/${mapId}`, 'map query');
  }

  getMedia(mediaId: string): Promise<any> {
    return fetchJson(`${this.config.apiBaseUrl}/game/media/${mediaId}`, 'media query');
  }

  async getDatabase(projectId?: string): Promise<any[]> {
    if (!projectId) {
      throw new Error('[HttpGameDataProvider] getDatabase requires projectId');
    }

    const value = await fetchJson(
      `${this.config.apiBaseUrl}/game/database/all?projectId=${projectId}`,
      'database query'
    );

    return Array.isArray(value) ? value : [];
  }
}
