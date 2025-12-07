import { inject } from "../../../core/inject";
import { RpgClientEngine } from "../../../RpgClientEngine";
import MobileGui from "./mobile.ce";
import { signal } from "canvasengine";

function isMobile() {
    return /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(navigator.userAgent);
  }

export const withMobile = () => (
    {
        gui: [
            {
                id: 'mobile-gui',
                component: MobileGui,
                autoDisplay: true,
                dependencies: () => {
                    const engine = inject(RpgClientEngine);
                    return [signal(isMobile() ||undefined), engine.scene.currentPlayer, undefined]
                }
            }
        ]
    }
)