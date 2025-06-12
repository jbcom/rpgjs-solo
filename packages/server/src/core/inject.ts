import { Context, inject as injector } from "@signe/di";

export let context: Context | null = null

export function inject<T>(service: (new (...args: any[]) => T) | string, _context?: Context): T {
    const c = _context ?? context
    if (!c) throw new Error("Context is not set. use setInject() to set the context");
    return injector(c, service);
}

export function setInject(_context: Context) {
    context = _context;
}

export function clearInject() {
    context = null
}