import { RpgPlayer } from '../Player/Player'

export interface GuiOpenOptions {
    waitingAction?: boolean
    blockPlayerInput?: boolean
}

export class Gui {

    private _close: Function = () => {}
    private _blockPlayerInput: boolean = false
    private _events = new Map<string, (data: any) => void>()
    private _closed = false

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
            this.player.emit('gui.open', {
                guiId: this.id,
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
        this.player.emit('gui.exit', this.id)
        if (this._blockPlayerInput) {
            ;(this.player as any).canMove = true
        }
        delete (this.player as any)._gui?.[this.id]
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
