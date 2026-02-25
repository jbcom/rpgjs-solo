type ParamCurve = {
  start: number;
  end: number;
};

export type ProjectBasic = {
  initialLevel?: number;
  finalLevel?: number;
  expCurve?: {
    basis: number;
    extra: number;
    accelerationA: number;
    accelerationB: number;
  };
  parameters?: Record<string, ParamCurve>;
  startingInventory?: Array<{
    itemId?: string;
    amount: number;
  }>;
  startingEquipment?: Record<string, string>;
};
