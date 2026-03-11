import 'vitest-webgl-canvas-mock'

const LOAD_FAILURE_SRC = 'LOAD_FAILURE_SRC';
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function getMessage(args: unknown[]): string {
    return args.map((arg) => String(arg)).join(' ');
}

function shouldIgnoreConsoleMessage(args: unknown[]): boolean {
    const message = getMessage(args);
    return message.includes("Your browser does not support the Gamepad API")
        || message.includes("Not implemented: HTMLCanvasElement's getContext() method")
        || message.includes("PixiJS Warning:")
        || message.includes("PixiJS Deprecation Warning:");
}

if (typeof Image !== "undefined") {
    Object.defineProperty(global.Image.prototype, 'src', {
        set(src) {
            if (src === LOAD_FAILURE_SRC) {
                setTimeout(() => this.onerror(new Error('mocked error')));
            } else if (src.startsWith('data')) {
                setTimeout(() => this.dispatchEvent(new Event("load")));
            }
        },
    });
}

if (typeof window !== "undefined" && typeof window.HTMLMediaElement !== "undefined") {
    Object.defineProperty(global.window.HTMLMediaElement.prototype, 'play', {
        configurable: true,
        get() {
            setTimeout(() => (this.onloadeddata && this.onloadeddata()))
            return () => { }
        }
    });

    Object.defineProperty(global.window.HTMLMediaElement.prototype, 'load', {
        configurable: true,
        get() {
            setTimeout(() => (this.onloadeddata && this.onloadeddata()))
            return () => { }
        }
    });

    window.document.body.innerHTML = `<div id="rpg"></div>`;

    // Définir une variable globale pour que le client puisse détecter l'environnement de test
    (window as any).__RPGJS_TEST__ = true;
}

console.warn = (...args: unknown[]) => {
    if (shouldIgnoreConsoleMessage(args)) {
        return;
    }
    originalConsoleWarn(...args);
};

console.error = (...args: unknown[]) => {
    if (shouldIgnoreConsoleMessage(args)) {
        return;
    }
    originalConsoleError(...args);
};
