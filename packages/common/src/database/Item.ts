import { signal } from "@signe/reactive";
import { id, sync } from "@signe/sync";
import { RpgCommonPlayer } from "../Player";

interface ItemData {
    name: string;
    description: string;
    price: number;
    quantity: number;
    atk: number;
    pdef: number;
    sdef: number;
    icon: string
    onAdd: (player: RpgCommonPlayer) => void;
}

export class Item {
    @id() id = signal('');
    @sync() name = signal('');
    description = signal('');
    price = signal(0);
    atk = signal(0);
    pdef = signal(0);
    sdef = signal(0);
    @sync() icon = signal('')
    @sync() quantity = signal(1);

    onAdd: (player: RpgCommonPlayer) => void = () => {};

    constructor(data?: ItemData) {
        this.description.set(data?.description ?? '');
        this.price.set(data?.price ?? 0);
        this.name.set(data?.name ?? '');
        this.atk.set(data?.atk ?? 0);
        this.pdef.set(data?.pdef ?? 0);
        this.sdef.set(data?.sdef ?? 0);
        this.icon.set(data?.icon ?? '')
        this.onAdd = data?.onAdd?.bind(this) ?? (() => {});
    }
}
