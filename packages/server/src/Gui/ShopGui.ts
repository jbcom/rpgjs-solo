import { PrebuiltGui } from '@rpgjs/common'
import { Gui } from './Gui'
import { RpgPlayer } from '../Player/Player'

export class ShopGui extends Gui {
    private itemsInput: any[] = []

    constructor(player: RpgPlayer) {
        super(PrebuiltGui.Shop, player)
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

        const items = this.itemsInput.map(item => {
            const rawId = typeof item === 'string' ? item : item?.id ?? item?.name ?? item?.id
            const data = databaseById(rawId)
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
                price: data?.price ?? item.price,
                name: data?.name ?? item.name,
                description: data?.description ?? item.description,
                id: rawId,
                type: data?._type ?? item.type ?? item?._type,
                stats: Object.keys(stats).length ? stats : undefined,
                equipped: rawId ? equippedIds.has(rawId) : false
            }
        })
        return { items, playerParams }
    }

    private refreshShop(clientActionId?: string) {
        this.update(this.buildShopData(), { clientActionId })
    }

    open(items: any[]) {
        this.itemsInput = items
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
                this.player.sellItem(id, nb)
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
