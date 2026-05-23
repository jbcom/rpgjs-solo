import type { EventDefinition } from "@rpgjs/server";

export function Npc(): EventDefinition {
    return {
        onInit() {
            this.setGraphic("female");
        },
    }
}
