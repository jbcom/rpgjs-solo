type ParamCurve = {
  start: number;
  end: number;
};

type ParamValue = ParamCurve | number;

export type ProjectBasic = {
  initialLevel?: number;
  finalLevel?: number;
  expCurve?: {
    basis: number;
    extra: number;
    accelerationA: number;
    accelerationB: number;
  };
  parameters?: Record<string, ParamValue>;
  startingInventory?: Array<{
    itemId?: string;
    amount: number;
  }>;
  startingEquipment?: Record<string, string>;
};
