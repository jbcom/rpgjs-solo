import { ItemInstance } from "@rpgjs/database";
import { PlayerCtor } from "@rpgjs/common";

export function WithItemFixture<TBase extends PlayerCtor>(
  Base: TBase
) {
  return class extends Base {
    protected getFeature(name, prop): any {
      const array = {};
      for (let item of this.equipments()) {
        if (item[name]) {
          for (let feature of item[name]) {
            const { rate } = feature;
            const instance = feature[prop];
            const cache = array[instance.id];
            if (cache && cache.rate >= rate) continue;
            array[instance.id] = feature;
          }
        }
      }
      return Object.values(array);
    }
  } as unknown as TBase;
}

export interface ItemFixture {
  equipments: ItemInstance[];
}
