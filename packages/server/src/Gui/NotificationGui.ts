import { PrebuiltGui } from '@rpgjs/common'
import { Gui } from './Gui'
import { RpgPlayer } from '../Player/Player'

export class NotificationGui extends Gui {
    constructor(player: RpgPlayer) {
        super(PrebuiltGui.Notification, player)
    }
}