import { RpgPlayer } from '../Player/Player'

export const GUI_ACTION_COOLDOWN_MS = 250

export interface GuiOpenOptions {
    waitingAction?: boolean
    blockPlayerInput?: boolean
}

export class Gui {

    private static _openSequence = 0
    private _close: Function = () => {}
    private _blockPlayerInput: boolean = false
    private _events = new Map<string, (data: any) => void>()
    private _closed = false
    openId: string | null = null

    constructor(
        public id: string,
        protected player: RpgPlayer,
    ) {
        
    }

    open(data?: unknown, {
        waitingAction = false,
        blockPlayerInput = false
    }: GuiOpenOptions = {}): Promise<any> {
        return new Promise((resolve) => {
            this._closed = false
            this.openId = `${Date.now()}-${++Gui._openSequence}`
            this.player.emit('gui.open', {
                guiId: this.id,
                guiOpenId: this.openId,
                data
            })
            this._blockPlayerInput = blockPlayerInput
            if (blockPlayerInput) {
               ;(this.player as any).canMove = false
            }
            if (!waitingAction) {
                resolve(null)
            }
            else {
                this._close = resolve
            }
        })
    }

    matchesOpenId(openId?: unknown): boolean {
        if (typeof openId !== 'string' || openId.length === 0) {
            return true
        }
        return this.openId === openId
    }

    on(event: string, callback: (data: any) => void) {
        this._events.set(event, callback)
    }

    async emit(event: string, data: any): Promise<any> {
        const callback = this._events.get(event)
        if (callback) {
            return await callback(data)
        } else {
            return null
        }
    }

    close(data?: unknown) {
        if (this._closed) {
            return
        }
        this._closed = true
        this.player.emit('gui.exit', {
            guiId: this.id,
            guiOpenId: this.openId
        })
        if (this._blockPlayerInput) {
            ;(this.player as any).canMove = true
            ;(this.player as any).__guiActionBlockUntil = Date.now() + GUI_ACTION_COOLDOWN_MS
        }
        delete (this.player as any)._gui?.[this.id]
        this.openId = null
        this._close(data)
    }

    update(data?: unknown, { clientActionId }: { clientActionId?: string } = {}) {
        this.player.emit('gui.update', {
            guiId: this.id,
            data,
            clientActionId
        })
    }
}
