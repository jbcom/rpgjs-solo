import { signal } from "@signe/reactive";
import { id, sync } from "@signe/sync";
import { RpgCommonPlayer } from "../Player";

interface ItemData {
    name: string;
    description: string;
    price: number;
    quantity: number;
    onAdd: (player: RpgCommonPlayer) => void;
}

export class Item {
    @id() id = signal('');
    name = signal('');
    description = signal('');
    price = signal(0);
    quantity = signal(1);

    onAdd: (player: RpgCommonPlayer) => void = () => {};

    constructor(data?: ItemData) {
        this.description.set(data?.description ?? '');
        this.price.set(data?.price ?? 0);
        this.name.set(data?.name ?? '');
        this.onAdd = data?.onAdd?.bind(this) ?? (() => {});
    }
}
