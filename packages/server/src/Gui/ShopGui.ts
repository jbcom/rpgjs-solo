import { PrebuiltGui } from '@rpgjs/common'
import { Gui } from './Gui'
import { RpgPlayer } from '../Player/Player'

export class ShopGui extends Gui {
    constructor(player: RpgPlayer) {
        super(PrebuiltGui.Shop, player)
    }

    open(items: any[]) {
        items = items.map(item => {
            return {
                price: item.price,
                name: item.name,
                description: item.description,
                id: item.id,
                type: item.type
            }
        })
        this.on('buyItem', ({ id, nb }) => {
            try {
                this.player.buyItem(id, nb)
            }
            catch (err) {
                console.log(err)
            }
        })
        this.on('sellItem', ({ id, nb }) => {
            try {
                this.player.sellItem(id, nb)
            }
            catch (err) {
                console.log(err)
            }
        })
        return super.open({ items }, {
            waitingAction: true,
            blockPlayerInput: true
        })
    }
}