import { inject } from "../../../core/inject";
import { RpgClientEngine } from "../../../RpgClientEngine";
import MobileGui from "./mobile.ce";
import { computed } from "canvasengine";

export type MobileGuiEnabled = "auto" | "always" | "never" | (() => boolean);

export interface MobileGuiOptions {
    id?: string;
    enabled?: MobileGuiEnabled;
    joystick?: false | {
        outerColor?: string;
        innerColor?: string;
        scale?: number | { x: number; y: number };
        outerScale?: { x: number; y: number };
        innerScale?: { x: number; y: number };
        moveInterval?: number;
        threshold?: number;
    };
    buttons?: {
        action?: boolean;
        back?: boolean;
        dash?: boolean;
    };
}

function isMobile() {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(navigator.userAgent);
}

function resolveEnabled(enabled: MobileGuiEnabled = "auto") {
    if (enabled === "always") return true;
    if (enabled === "never") return false;
    if (typeof enabled === "function") return enabled();
    return isMobile();
}

export const withMobile = (options: MobileGuiOptions = {}) => (
    {
        gui: [
            {
                id: options.id ?? 'mobile-gui',
                component: MobileGui,
                autoDisplay: true,
                data: options,
                dependencies: () => {
                    const engine = inject(RpgClientEngine);
                    return [
                        computed(() => resolveEnabled(options.enabled) || undefined),
                        engine.controlsReady
                    ]
                }
            }
        ]
    }
)
