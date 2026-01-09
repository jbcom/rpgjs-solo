import { PrebuiltGui } from '@rpgjs/common'
import { Gui } from './Gui'
import { RpgPlayer } from '../Player/Player'
import { SaveLoadGui, SaveSlot } from './SaveLoadGui'
import { resolveAutoSaveStrategy } from '../services/save'

export type MenuEntryId = 'items' | 'skills' | 'equip' | 'options' | 'save' | 'exit'

export interface MenuEntry {
    id: MenuEntryId
    label: string
    disabled?: boolean
}

export interface MenuGuiOptions {
    menus?: MenuEntry[]
    disabled?: MenuEntryId[]
    saveSlots?: SaveSlot[]
    saveMaxSlots?: number
    saveShowAutoSlot?: boolean
    saveAutoSlotIndex?: number
    saveAutoSlotLabel?: string
}

export class MenuGui extends Gui {
    private menuOptions: MenuGuiOptions = {}

    constructor(player: RpgPlayer) {
        super(PrebuiltGui.MainMenu, player)
    }

    private buildSaveLoad(options: MenuGuiOptions) {
        const autoSave = resolveAutoSaveStrategy()
        const canSave = autoSave.canSave ? autoSave.canSave(this.player, { reason: "manual", source: "menu" }) : true
        const autoSlotIndex = options.saveAutoSlotIndex ?? autoSave.getDefaultSlot?.(this.player, { reason: "auto", source: "menu" }) ?? 0
        return {
            mode: 'save',
            canSave,
            showAutoSlot: options.saveShowAutoSlot === true,
            autoSlotIndex,
            autoSlotLabel: options.saveAutoSlotLabel
        }
    }

    private buildMenuData(options: MenuGuiOptions) {
        const disabledSet = new Set(options.disabled || [])
        const defaultMenus: MenuEntry[] = [
            { id: 'items', label: 'Items' },
            { id: 'skills', label: 'Skills' },
            { id: 'equip', label: 'Equip' },
            { id: 'options', label: 'Options' },
            { id: 'save', label: 'Save' },
            { id: 'exit', label: 'Exit' }
        ]
        const menus = (options.menus && options.menus.length ? options.menus : defaultMenus)
            .map(menu => ({
                ...menu,
                disabled: menu.disabled || disabledSet.has(menu.id)
            }))

        const player = this.player as any
        const databaseById = player.databaseById?.bind(player)
        const equippedIds = new Set(
            (player.equipments?.() || []).map((it) => it?.id?.() ?? it?.id ?? it?.name)
        )

        const buildStats = () => {
            const statKeys = [
                'str',
                'dex',
                'int',
                'agi',
                'maxHp',
                'maxSp'
            ]
            const stats: Record<string, number> = {}
            statKeys.forEach((key) => {
                stats[key] = player.param[key]
            })
            stats.pdef = player.pdef
            stats.sdef = player.sdef
            stats.atk = player.atk
            return stats
        }

        const items = (player.items?.() || []).map((item) => {
            const id = item.id()
            const data = databaseById ? databaseById(id) : {}
            const type = data?._type ?? 'item'
            const consumable = data?.consumable
            const isConsumable = consumable !== undefined ? consumable : type === 'item'
            const usable = isConsumable === false
                ? false
                : consumable === undefined && type !== 'item'
                    ? false
                    : true
            return {
                id,
                name: item.name(),
                description: item.description(),
                quantity: item.quantity(),
                icon: data?.icon ?? (item as any)?.icon,
                atk: item.atk(),
                pdef: item.pdef(),
                sdef: item.sdef(),
                consumable: isConsumable,
                type,
                usable,
                equipped: equippedIds.has(id)
            }
        })
        const menuEquips = items.filter((item) => item.type === 'weapon' || item.type === 'armor')
        const skills = (player.skills?.() || []).map((skill) => ({
            id: skill?.id() ?? skill?.name(),
            name: skill?.name() ?? skill?.id() ?? 'Skill',
            description: skill?.description() ?? '',
            spCost: skill?.spCost() ?? 0
        }))
        const saveLoad = this.buildSaveLoad(options)

        return { menus, items, equips: menuEquips, skills, saveLoad, playerStats: buildStats() }
    }

    private refreshMenu(clientActionId?: string) {
        const data = this.buildMenuData(this.menuOptions)
        this.update(data, { clientActionId })
    }

    open(options: MenuGuiOptions = {}) {
        this.menuOptions = options
        const data = this.buildMenuData(options)

        this.on('useItem', ({ id, clientActionId }) => {
            try {
                this.player.useItem(id)
                this.player.syncChanges()
            }
            catch (err: any) {
                this.player.showNotification(err.msg)
            }
            finally {
                this.refreshMenu(clientActionId)
            }
        })
        this.on('equipItem', ({ id, equip, clientActionId }) => {
            try {
                this.player.equip(id, equip)
                this.player.syncChanges()
            }
            catch (err: any) {
                this.player.showNotification(err.msg)
            }
            finally {
                this.refreshMenu(clientActionId)
            }
        })
        this.on('openSave', async () => {
            this.close()
            const gui = new SaveLoadGui(this.player)
            player._gui[gui.id] = gui
            await gui.open(options.saveSlots || [], {
                mode: 'save',
                maxSlots: options.saveMaxSlots
            })
        })
        this.on('exit', () => {
            this.close('exit')
        })
        return super.open(data, {
            waitingAction: true,
            blockPlayerInput: true
        })
    }
}
