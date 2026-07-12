import { PrebuiltGui } from '@rpgjs/common'
import { Gui } from './Gui'
import { RpgPlayer } from '../Player/Player'

export interface BaseInputOptions {
    /** Optional heading displayed above the prompt. */
    title?: string
    /** Hint displayed while the field is empty. */
    placeholder?: string
    /** Reject an empty value when true. */
    required?: boolean
    /** Label for the submit button. Defaults to `Confirm`. */
    confirmText?: string
    /** Label for the cancellation button. Defaults to `Cancel`. */
    cancelText?: string
}

/** Options for a single-line text, password, or email input. */
export interface TextInputOptions extends BaseInputOptions {
    /** Render a single-line HTML input. */
    control?: 'input'
    /** HTML input type. Defaults to `text`. */
    type?: 'text' | 'password' | 'email'
    /** Initial string value. */
    defaultValue?: string
    /** Minimum accepted string length. */
    minLength?: number
    /** Maximum accepted string length. */
    maxLength?: number
}

/** Options for a single-line numeric input that resolves to a number. */
export interface NumberInputOptions extends BaseInputOptions {
    /** Numeric fields always render a single-line HTML input. */
    control?: 'input'
    /** Select numeric parsing and a `number | null` result. */
    type: 'number'
    /** Initial numeric value. */
    defaultValue?: number
    /** Minimum accepted number. */
    min?: number
    /** Maximum accepted number. */
    max?: number
    /** Accepted numeric increment, based on `min` or zero. */
    step?: number
}

/** Options for a multiline text field that resolves to a string. */
export interface TextareaInputOptions extends BaseInputOptions {
    /** Render a multiline HTML textarea. */
    control: 'textarea'
    /** Textareas only accept text values. */
    type?: 'text'
    /** Initial string value. */
    defaultValue?: string
    /** Minimum accepted string length. */
    minLength?: number
    /** Maximum accepted string length. */
    maxLength?: number
    /** Number of visible textarea rows. Defaults to 4. */
    rows?: number
}

/** Supported player input form options. */
export type InputOptions = TextInputOptions | NumberInputOptions | TextareaInputOptions
/** Result inferred from an input options type. */
export type InputResult<T extends InputOptions> = T extends NumberInputOptions ? number | null : string | null

type InputGuiData = BaseInputOptions & {
    message: string
    control: 'input' | 'textarea'
    type: 'text' | 'password' | 'email' | 'number'
    defaultValue: string | number
    required: boolean
    errorKey?: string
    errorParams?: Record<string, string | number>
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    step?: number
    rows?: number
}

const normalizeNonNegativeInteger = (value: unknown): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return Math.max(0, Math.floor(value))
}

export class InputGui extends Gui {
    private data!: InputGuiData

    constructor(player: RpgPlayer) {
        super(PrebuiltGui.Input, player)
        this.on('submit', ({ value }: { value?: unknown } = {}) => this.submit(value))
        this.on('cancel', () => this.close(null))
    }

    openInput(message: string, options: InputOptions = {}): Promise<string | number | null> {
        const control = options.control === 'textarea' ? 'textarea' : 'input'
        const requestedType = control === 'textarea' ? 'text' : options.type
        const type = requestedType === 'number' || requestedType === 'password' || requestedType === 'email'
            ? requestedType
            : 'text'

        this.data = {
            ...options,
            message,
            control,
            type,
            defaultValue: options.defaultValue ?? '',
            required: options.required === true,
            minLength: 'minLength' in options ? normalizeNonNegativeInteger(options.minLength) : undefined,
            maxLength: 'maxLength' in options ? normalizeNonNegativeInteger(options.maxLength) : undefined,
            rows: 'rows' in options ? Math.max(1, normalizeNonNegativeInteger(options.rows) ?? 4) : undefined,
        }

        return super.open(this.data, {
            waitingAction: true,
            blockPlayerInput: true,
        })
    }

    private submit(rawValue: unknown): void {
        const result = this.validate(rawValue)
        if ('errorKey' in result) {
            this.data = { ...this.data, errorKey: result.errorKey, errorParams: result.errorParams }
            this.update(this.data)
            return
        }
        this.close(result.value)
    }

    private validate(rawValue: unknown): { value: string | number | null } | { errorKey: string, errorParams?: Record<string, string | number> } {
        if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
            return { errorKey: 'rpg.input.error.invalid' }
        }

        const value = String(rawValue)
        if (this.data.type === 'number') {
            if (value.trim() === '') {
                return this.data.required ? { errorKey: 'rpg.input.error.required' } : { value: null }
            }
            const number = Number(value)
            if (!Number.isFinite(number)) return { errorKey: 'rpg.input.error.number' }
            if (typeof this.data.min === 'number' && number < this.data.min) {
                return { errorKey: 'rpg.input.error.min', errorParams: { min: this.data.min } }
            }
            if (typeof this.data.max === 'number' && number > this.data.max) {
                return { errorKey: 'rpg.input.error.max', errorParams: { max: this.data.max } }
            }
            if (typeof this.data.step === 'number' && Number.isFinite(this.data.step) && this.data.step > 0) {
                const base = typeof this.data.min === 'number' ? this.data.min : 0
                const quotient = (number - base) / this.data.step
                if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * 100) {
                    return { errorKey: 'rpg.input.error.step', errorParams: { step: this.data.step } }
                }
            }
            return { value: number }
        }

        if (this.data.required && value.length === 0) return { errorKey: 'rpg.input.error.required' }
        if (typeof this.data.minLength === 'number' && value.length < this.data.minLength) {
            return { errorKey: 'rpg.input.error.min-length', errorParams: { minLength: this.data.minLength } }
        }
        if (typeof this.data.maxLength === 'number' && value.length > this.data.maxLength) {
            return { errorKey: 'rpg.input.error.max-length', errorParams: { maxLength: this.data.maxLength } }
        }
        if (this.data.type === 'email' && value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return { errorKey: 'rpg.input.error.email' }
        }
        return { value }
    }
}
