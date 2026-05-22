export const normalizeRoomMapId = (mapId: string | undefined): string | undefined =>
  typeof mapId === "string" ? mapId.replace(/^map-/, "") : undefined;
