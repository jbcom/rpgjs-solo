export interface SaveSlotMeta {
  level?: number;
  exp?: number;
  map?: string;
  date?: string;
  [key: string]: any;
}

export interface SaveSlot extends SaveSlotMeta {
  snapshot?: string;
}

export type SaveSlotList = Array<SaveSlotMeta | null>;
export type SaveSlotEntries = Array<SaveSlot | null>;
