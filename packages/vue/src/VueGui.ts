import {
    App,
    ComponentPublicInstance,
    computed,
    createApp,
    defineComponent,
    h,
    reactive,
    resolveComponent,
} from 'vue'
import { RpgClientEngine, RpgGui, inject, Context } from '@rpgjs/client'
import { Observable, Subscription } from 'rxjs'

export const VueGuiToken = "VueGuiToken"

interface GuiState {
    name: string
    component: any
    data: any
    attachToSprite: boolean
    display: boolean
}

interface AttachedTarget {
    id: string
    object: any
    position: {
        x: number
        y: number
    }
}

interface VueInstance extends ComponentPublicInstance {
    gui: Record<string, GuiState>
    tooltips: AttachedTarget[]
}

interface VueGuiOptions {
    /** The HTML element where Vue components will be mounted */
    mountElement?: HTMLElement | string
    /** Custom CSS selector for the mount element */
    selector?: string
    /** Whether to create a new div element if none is found */
    createIfNotFound?: boolean
}

type MaybeSignal<T> = T | (() => T)

const readValue = <T>(value: MaybeSignal<T> | undefined): T | undefined => {
    return typeof value === 'function'
        ? (value as () => T)()
        : value
}

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value)
}

export class VueGui {
    private clientEngine: RpgClientEngine
    private parentGui: RpgGui
    private app: App
    private vm: VueInstance
    private guiState: Record<string, GuiState>
    private tooltipState: AttachedTarget[]
    private mounted = false
    private registeredComponents = new Set<string>()
    private objectSubscriptions: Subscription[] = []
    private tickSubscription?: Subscription

    constructor(private context: Context, private options: VueGuiOptions = {}) {

    }

    mount() {
        if (this.mounted) return

        this.clientEngine = inject(RpgClientEngine)
        this.parentGui = inject(RpgGui)
        this.parentGui._setVueGuiInstance(this)

        const mountElement = this.getMountElement()
        if (!mountElement) {
            throw new Error('No mount element found for VueGui. Please provide a valid element or selector.')
        }

        const guiState = reactive<Record<string, GuiState>>({})
        const tooltipState = reactive<AttachedTarget[]>([])
        this.guiState = guiState
        this.tooltipState = tooltipState
        const vueGui = this

        const Root = defineComponent({
            name: 'RpgVueGuiRoot',
            setup() {
                const fixedGui = computed(() => {
                    return Object.values(guiState).filter((gui) => !gui.attachToSprite)
                })
                const attachedGui = computed(() => {
                    return Object.values(guiState).filter((gui) => gui.attachToSprite)
                })

                return {
                    gui: guiState,
                    tooltips: tooltipState,
                    fixedGui,
                    attachedGui,
                    tooltipPosition: (target: AttachedTarget) => vueGui.tooltipPosition(target.position),
                    tooltipFilter: () => tooltipState.filter((target) => vueGui.parentGui.shouldDisplayAttachedGui(target.id)),
                }
            },
            provide: () => {
                return this.getInjectObject()
            },
            render() {
                const fixedNodes = this.fixedGui.map((ui: GuiState) => {
                    if (!ui.display) return null
                    return h(
                        resolveComponent(ui.name),
                        {
                            key: ui.name,
                            ...ui.data,
                            style: {
                                pointerEvents: 'auto',
                            },
                        },
                    )
                })

                const attachedNodes = this.attachedGui.flatMap((ui: GuiState) => {
                    if (!ui.display) return []
                    return this.tooltipFilter().map((target: AttachedTarget) => {
                        return h(
                            'div',
                            {
                                key: `${ui.name}:${target.id}`,
                                style: this.tooltipPosition(target),
                            },
                            [
                                h(resolveComponent(ui.name), {
                                    ...ui.data,
                                    spriteData: target,
                                    object: target.object,
                                    style: {
                                        pointerEvents: 'auto',
                                    },
                                }),
                            ],
                        )
                    })
                })

                return h('div', { class: 'rpg-vue-gui-root' }, [
                    ...fixedNodes,
                    h('div', {
                        id: 'tooltips',
                        style: {
                            position: 'absolute',
                            top: '0',
                            left: '0',
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                        },
                    }, attachedNodes),
                ])
            },
        })

        this.app = createApp(Root)
        this.registerComponents(this.parentGui.getVueGuis())
        this.registerPropagateDirective()

        this.vm = this.app.mount(mountElement) as VueInstance
        this.mounted = true

        this.parentGui._initializeVueComponents()
        this.bindSceneObjects()
    }

    updateGuiState(state: GuiState) {
        if (!this.mounted || !this.guiState) return
        this.registerComponent(state.name, state.component)
        this.guiState[state.name] = state
    }

    initializeGuiStates(states: GuiState[]) {
        if (!this.mounted || !this.guiState) return
        this.registerComponents(states)
        Object.keys(this.guiState).forEach((key) => {
            if (!states.some((state) => state.name === key)) {
                delete this.guiState[key]
            }
        })
        states.forEach((state) => {
            this.guiState[state.name] = state
        })
    }

    destroy() {
        this.objectSubscriptions.forEach(subscription => subscription.unsubscribe())
        this.objectSubscriptions = []
        this.tickSubscription?.unsubscribe()
        this.tickSubscription = undefined
        this.app?.unmount()
        this.mounted = false
    }

    private registerComponents(guis: Array<{ name: string, component: any }>) {
        guis.forEach((gui) => this.registerComponent(gui.name, gui.component))
    }

    private registerComponent(name: string, component: any) {
        if (this.registeredComponents.has(name)) return
        this.app.component(name, component)
        this.registeredComponents.add(name)
    }

    private registerPropagateDirective() {
        this.app.directive('propagate', {
            mounted: (el: HTMLElement) => {
                const eventListeners: Record<string, EventListener> = {}
                const mouseEvents = ['click', 'mousedown', 'mouseup', 'mousemove', 'wheel']
                mouseEvents.forEach(eventType => {
                    const callback = (event: Event) => this.propagateEvent(event)
                    eventListeners[eventType] = callback
                    el.addEventListener(eventType, callback)
                });
                (el as any).__rpgVuePropagateListeners = eventListeners
            },
            unmounted(el: HTMLElement) {
                const eventListeners: Record<string, EventListener> = (el as any).__rpgVuePropagateListeners || {}
                Object.entries(eventListeners).forEach(([eventType, callback]) => {
                    el.removeEventListener(eventType, callback)
                })
                delete (el as any).__rpgVuePropagateListeners
            },
        })
    }

    private getMountElement(): HTMLElement {
        const { mountElement, selector, createIfNotFound = true } = this.options

        if (mountElement) {
            if (typeof mountElement === 'string') {
                const element = document.querySelector(mountElement) as HTMLElement
                if (element) return element
            } else {
                return mountElement
            }
        }

        if (selector) {
            const element = document.querySelector(selector) as HTMLElement
            if (element) return element
        }

        const defaultElement = document.querySelector('#vue-gui-overlay') as HTMLElement
        if (defaultElement) return defaultElement

        if (createIfNotFound) {
            const newElement = document.createElement('div')
            newElement.id = 'vue-gui-overlay'
            newElement.style.position = 'absolute'
            newElement.style.top = '0'
            newElement.style.left = '0'
            newElement.style.width = '100%'
            newElement.style.height = '100%'
            newElement.style.pointerEvents = 'none'

            const gameContainer = document.querySelector('#rpg')
            if (gameContainer) {
                const style = getComputedStyle(gameContainer)
                if (style.position === 'static') {
                    ;(gameContainer as HTMLElement).style.position = 'relative'
                }
                gameContainer.appendChild(newElement)
                return newElement
            }

            document.body.appendChild(newElement)
            return newElement
        }

        throw new Error('Could not find or create mount element for VueGui')
    }

    private getInjectObject() {
        return {
            engine: this.clientEngine,
            socket: this.clientEngine.socket,
            gui: this.parentGui,

            rpgEngine: this.clientEngine,
            rpgSocket: () => this.clientEngine.socket,
            rpgGui: this.parentGui,
            rpgScene: () => this.clientEngine.scene,
            rpgStage: (this.clientEngine as any).canvasApp?.stage,
            rpgResource: {
                spritesheets: this.clientEngine.spritesheets,
                sounds: this.clientEngine.sounds,
            },
            rpgObjects: this.createObjectsObservable(),
            rpgCurrentPlayer: this.createCurrentPlayerObservable(),
            rpgGuiClose: (name: string, data?: any) => {
                this.parentGui.guiClose(name, data)
            },
            rpgGuiInteraction: (guiId: string, name: string, data: any = {}) => {
                this.parentGui.guiInteraction(guiId, name, data)
            },
            rpgKeypress: this.createKeypressObservable(),
            rpgSound: this.createSoundService(),
        }
    }

    private createObjectsObservable() {
        const scene = this.clientEngine.scene
        if (!scene) return null

        return new Observable((observer) => {
            const emit = () => {
                const objects: Record<string, any> = {}
                for (const [id, player] of Object.entries(scene.players())) {
                    objects[id] = {
                        object: player,
                        paramsChanged: player,
                    }
                }
                for (const [id, event] of Object.entries(scene.events())) {
                    objects[id] = {
                        object: event,
                        paramsChanged: event,
                    }
                }
                observer.next(objects)
            }

            const subscriptions = [
                scene.players.observable.subscribe(emit),
                scene.events.observable.subscribe(emit),
            ]
            emit()

            return () => {
                subscriptions.forEach(subscription => subscription.unsubscribe())
            }
        })
    }

    private createCurrentPlayerObservable() {
        const scene = this.clientEngine.scene
        if (!scene) return null

        return new Observable((observer) => {
            const emit = () => {
                const player = scene.currentPlayer()
                if (player) {
                    observer.next({
                        object: player,
                        paramsChanged: player,
                    })
                }
            }
            const subscription = scene.currentPlayer.observable.subscribe(emit)
            emit()

            return () => subscription.unsubscribe()
        })
    }

    private createKeypressObservable() {
        return new Observable((observer) => {
            const keyHandler = (event: KeyboardEvent) => {
                const keyMap = this.clientEngine.globalConfig?.keyboardControls || {
                    up: 'up',
                    down: 'down',
                    left: 'left',
                    right: 'right',
                    action: 'space',
                    escape: 'escape',
                }

                const inputName = event.key.toLowerCase()
                let control: { actionName: string; options: any } | null = null

                for (const [actionName, keyName] of Object.entries(keyMap)) {
                    if (keyName === inputName || keyName === event.code.toLowerCase()) {
                        control = {
                            actionName,
                            options: {},
                        }
                        break
                    }
                }

                if (control) {
                    observer.next({
                        inputName,
                        control,
                    })
                }
            }

            document.addEventListener('keydown', keyHandler)

            return () => {
                document.removeEventListener('keydown', keyHandler)
            }
        })
    }

    private createSoundService() {
        return {
            get: (id: string) => {
                const sound = this.clientEngine.sounds.get(id)
                return {
                    play: () => sound?.play?.(),
                    stop: () => sound?.stop?.(),
                    pause: () => sound?.pause?.(),
                }
            },
            play: (id: string) => {
                this.clientEngine.sounds.get(id)?.play?.()
            },
        }
    }

    private bindSceneObjects() {
        const scene = this.clientEngine.scene
        if (!scene || !this.tooltipState) return

        const updateTargets = () => {
            const objects = {
                ...scene.players(),
                ...scene.events(),
            }
            const targets = Object.entries(objects)
                .filter(([id]) => this.parentGui.shouldDisplayAttachedGui(id))
                .map(([id, object]) => {
                    return {
                        id,
                        object,
                        position: this.objectScreenPosition(object as any),
                    }
                })

            this.tooltipState.splice(0, this.tooltipState.length, ...targets)
        }

        this.objectSubscriptions = [
            scene.players.observable.subscribe(updateTargets),
            scene.events.observable.subscribe(updateTargets),
            this.parentGui.attachedGuiDisplayState.observable.subscribe(updateTargets),
        ]

        this.tickSubscription = this.clientEngine.tick?.subscribe(updateTargets)
        updateTargets()
    }

    private objectScreenPosition(object: any) {
        const canvas = document.querySelector('#rpg canvas') as HTMLCanvasElement | null
        const rect = canvas?.getBoundingClientRect()
        const width = rect?.width || (this.clientEngine.renderer as any)?.screen?.width || 0
        const height = rect?.height || (this.clientEngine.renderer as any)?.screen?.height || 0
        const currentPlayer = this.clientEngine.scene?.getCurrentPlayer?.()
        const objectX = this.readObjectCoordinate(object, 'x')
        const objectY = this.readObjectCoordinate(object, 'y')
        const cameraX = this.readObjectCoordinate(currentPlayer, 'x')
        const cameraY = this.readObjectCoordinate(currentPlayer, 'y')

        if (
            isFiniteNumber(objectX)
            && isFiniteNumber(objectY)
            && isFiniteNumber(cameraX)
            && isFiniteNumber(cameraY)
        ) {
            return {
                x: width / 2 + objectX - cameraX,
                y: height / 2 + objectY - cameraY,
            }
        }

        return {
            x: isFiniteNumber(objectX) ? objectX : 0,
            y: isFiniteNumber(objectY) ? objectY : 0,
        }
    }

    private readObjectCoordinate(object: any, key: 'x' | 'y') {
        if (!object) return undefined
        const bodyPosition = this.clientEngine.scene?.getBodyPosition?.(object.id, 'top-left')
        const bodyValue = bodyPosition?.[key]
        if (isFiniteNumber(bodyValue)) return bodyValue
        return readValue<number>(object[key])
    }

    private propagateEvent(event: Event) {
        const canvas = document.querySelector('#rpg canvas') as HTMLCanvasElement
        if (!canvas || !canvas.getBoundingClientRect) return

        const rect = canvas.getBoundingClientRect()
        const mouseEvent = event as MouseEvent

        canvas.dispatchEvent(new MouseEvent(event.type, {
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            clientX: mouseEvent.clientX - rect.left,
            clientY: mouseEvent.clientY - rect.top,
            button: mouseEvent.button,
            buttons: mouseEvent.buttons,
        }))
    }

    private tooltipPosition(position: { x: number, y: number }) {
        return {
            left: `${position.x}px`,
            top: `${position.y}px`,
            position: 'absolute',
            pointerEvents: 'none',
        }
    }
}
