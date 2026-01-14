import { PrebuiltGui } from '@rpgjs/common'
import { Gui } from './Gui'
import { RpgPlayer } from '../Player/Player'

export type ShopSellList = Record<string, number> | Array<{ id: string; multiplier: number }>
export type ShopItemInput = string | { id?: string; [key: string]: any }

export interface ShopGuiOptions {
    items: ShopItemInput[]
    sell?: ShopSellList
    sellMultiplier?: number
    message?: string
    face?: {
        id: string
        expression?: string
    }
}

export class ShopGui extends Gui {
    private itemsInput: ShopItemInput[] = []
    private sellMultipliers: Record<string, number> = {}
    private baseSellMultiplier = 0.5
    private messageInput?: string
    private faceInput?: { id: string; expression?: string }

    constructor(player: RpgPlayer) {
        super(PrebuiltGui.Shop, player)
    }

    private normalizeSellMultipliers(sell?: ShopSellList) {
        if (!sell) return {}
        if (Array.isArray(sell)) {
            return sell.reduce<Record<string, number>>((acc, entry) => {
                if (entry && entry.id) acc[entry.id] = entry.multiplier ?? 0
                return acc
            }, {})
        }
        return { ...sell }
    }

    private buildShopData() {
        const player = this.player as any
        const databaseById = player.databaseById?.bind(player)
        const equippedIds = new Set(
            (player.equipments?.() || []).map((it) => it?.id?.() ?? it?.id ?? it?.name)
        )
        const playerParams = {
            ...(player.param || {}),
            atk: player.atk ?? 0,
            def: player.pdef ?? 0,
            pdef: player.pdef ?? 0,
            sdef: player.sdef ?? 0
        }

        const getStatValue = (data, key, fallbackKeys: string[] = []) => {
            if (data && typeof data[key] === 'number') return data[key]
            for (const fallbackKey of fallbackKeys) {
                if (data && typeof data[fallbackKey] === 'number') return data[fallbackKey]
            }
            const modifier = data?.paramsModifier?.[key]
            if (modifier && typeof modifier.value === 'number') return modifier.value
            for (const fallbackKey of fallbackKeys) {
                const fallbackModifier = data?.paramsModifier?.[fallbackKey]
                if (fallbackModifier && typeof fallbackModifier.value === 'number') return fallbackModifier.value
            }
            return undefined
        }

        const buildItemData = (item: ShopItemInput, overrides: { price?: number; quantity?: number } = {}) => {
            const rawId = typeof item === 'string'
                ? item
                : (typeof item?.id === 'function' ? item.id() : (item?.id ?? item?.name))
            const data = databaseById(rawId)
            const itemName = typeof item?.name === 'function' ? item.name() : item?.name
            const itemDescription = typeof item?.description === 'function' ? item.description() : item?.description
            const itemPrice = typeof item?.price === 'function' ? item.price() : item?.price
            const itemIcon = typeof item?.icon === 'function' ? item.icon() : item?.icon
            const atk = getStatValue(data, 'atk')
            const def = getStatValue(data, 'def', ['pdef', 'sdef'])
            const intValue = getStatValue(data, 'int')
            const agi = getStatValue(data, 'agi')
            const stats = {
                ...(atk !== undefined ? { atk } : {}),
                ...(def !== undefined ? { def } : {}),
                ...(intValue !== undefined ? { int: intValue } : {}),
                ...(agi !== undefined ? { agi } : {})
            }
            return {
                price: overrides.price ?? data?.price ?? itemPrice ?? 0,
                name: data?.name ?? itemName ?? rawId,
                description: data?.description ?? itemDescription ?? '',
                icon: data?.icon ?? itemIcon,
                id: rawId,
                type: data?._type ?? item.type ?? item?._type,
                stats: Object.keys(stats).length ? stats : undefined,
                equipped: rawId ? equippedIds.has(rawId) : false,
                ...(overrides.quantity !== undefined ? { quantity: overrides.quantity } : {})
            }
        }

        const items = this.itemsInput.map(item => buildItemData(item))

        const sellItems = (player.items?.() || [])
            .map((item) => {
                const id = item?.id?.()
                if (!id) return null
                const multiplier = Object.prototype.hasOwnProperty.call(this.sellMultipliers, id)
                    ? this.sellMultipliers[id]
                    : this.baseSellMultiplier
                const basePrice = databaseById(id)?.price ?? (typeof item?.price === 'function' ? item.price() : item?.price) ?? 0
                const price = basePrice * multiplier
                const quantity = item?.quantity?.()
                return buildItemData(item, { price, quantity })
            })
            .filter(Boolean)

        return { items, sellItems, playerParams, message: this.messageInput, face: this.faceInput }
    }

    private refreshShop(clientActionId?: string) {
        this.update(this.buildShopData(), { clientActionId })
    }

    open(itemsOrOptions: any[] | ShopGuiOptions) {
        const options: ShopGuiOptions = Array.isArray(itemsOrOptions)
            ? { items: itemsOrOptions }
            : (itemsOrOptions || { items: [] })
        this.itemsInput = options.items || []
        this.baseSellMultiplier = typeof options.sellMultiplier === 'number' ? options.sellMultiplier : 0.5
        this.sellMultipliers = this.normalizeSellMultipliers(options.sell)
        this.messageInput = options.message
        this.faceInput = options.face
        this.on('buyItem', ({ id, nb, clientActionId }) => {
            try {
                this.player.buyItem(id, nb)
                this.player.syncChanges()
            }
            catch (err) {
                console.log(err)
            }
            finally {
                this.refreshShop(clientActionId)
            }
        })
        this.on('sellItem', ({ id, nb, clientActionId }) => {
            try {
                const multiplier = Object.prototype.hasOwnProperty.call(this.sellMultipliers, id)
                    ? this.sellMultipliers[id]
                    : this.baseSellMultiplier
                const basePrice = (this.player as any).databaseById?.(id)?.price ?? (typeof (inventory as any)?.price === 'function' ? (inventory as any).price() : (inventory as any)?.price) ?? 0
                const price = basePrice * multiplier
                if (!basePrice || price <= 0) return
                const inventory = (this.player as any).getItem?.(id)
                if (!inventory) return
                const quantity = inventory.quantity()
                if (quantity - nb < 0) return
                ;(this.player as any)._gold.update((gold) => gold + price * nb)
                ;(this.player as any).removeItem(id, nb)
                this.player.syncChanges()
            }
            catch (err) {
                console.log(err)
            }
            finally {
                this.refreshShop(clientActionId)
            }
        })
        return super.open(this.buildShopData(), {
            waitingAction: true,
            blockPlayerInput: true
        })
    }
}
