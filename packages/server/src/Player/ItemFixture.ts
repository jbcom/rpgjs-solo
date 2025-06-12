import { ItemInstance } from "@rpgjs/database";
import { RpgCommonPlayer, type Constructor } from "@rpgjs/common";
export class ItemFixture {}

export function WithItemFixture<TBase extends Constructor<RpgCommonPlayer>>(
  Base: TBase
) {
  return class extends Base implements IItemFixture {
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
  };
}

export interface ItemFixture {
  equipments: ItemInstance[];
}
