export function Npc() {
    return {
        id: "npc",
        x: 200,
        y: 120,
        onInit() {
            this.setGraphic("female");
        }
    }
}