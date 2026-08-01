import { signal } from "@signe/reactive";
import { id, sync } from "@signe/sync";
import { RpgCommonPlayer } from "../Player";
import type { RpgWritableSignal } from "../foundation";

const gameplaySignal = signal as <T>(value: T) => RpgWritableSignal<T>;

type ItemPlayerHook = (player: RpgCommonPlayer) => void | Promise<void>;
type ItemEquipHook = (player: RpgCommonPlayer, equip: boolean) => void | Promise<void>;

interface ItemData {
    name: string;
    description: string;
    price: number;
    quantity: number;
    atk: number;
    pdef: number;
    sdef: number;
    icon: string
    onAdd?: ItemPlayerHook;
    onUse?: ItemPlayerHook;
    onUseFailed?: ItemPlayerHook;
    onRemove?: ItemPlayerHook;
    onEquip?: ItemEquipHook;
}

export class Item {
    @id() id = gameplaySignal('');
    @sync() name = gameplaySignal('');
    description = gameplaySignal('');
    price = gameplaySignal(0);
    atk = gameplaySignal(0);
    pdef = gameplaySignal(0);
    sdef = gameplaySignal(0);
    @sync() icon = gameplaySignal('')
    @sync() quantity = gameplaySignal(1);

    onAdd: ItemPlayerHook = () => {};
    onUse?: ItemPlayerHook;
    onUseFailed?: ItemPlayerHook;
    onRemove?: ItemPlayerHook;
    onEquip?: ItemEquipHook;

    constructor(data?: ItemData) {
        this.description.set(data?.description ?? '');
        this.price.set(data?.price ?? 0);
        this.name.set(data?.name ?? '');
        this.atk.set(data?.atk ?? 0);
        this.pdef.set(data?.pdef ?? 0);
        this.sdef.set(data?.sdef ?? 0);
        this.icon.set(data?.icon ?? '')
        this.onAdd = data?.onAdd?.bind(this) ?? (() => {});
        this.onUse = data?.onUse?.bind(this);
        this.onUseFailed = data?.onUseFailed?.bind(this);
        this.onRemove = data?.onRemove?.bind(this);
        this.onEquip = data?.onEquip?.bind(this);
    }
}
