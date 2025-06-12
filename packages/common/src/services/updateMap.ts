import { Context } from "@signe/di";

export const UpdateMapToken = "UpdateMapToken";

export abstract class UpdateMapService {
  constructor(protected context: Context) {}

  abstract update(map: any): Promise<void>;
}
