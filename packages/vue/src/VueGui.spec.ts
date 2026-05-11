import { describe, expect, test } from "vitest";
import { VueGui } from "./VueGui";

const propagate = (event: Event) => {
    const vueGui = new VueGui({} as any);
    (vueGui as any).propagateEvent(event);
};

const createCanvas = () => {
    document.body.innerHTML = '<div id="rpg"><canvas></canvas></div>';
    return document.querySelector("#rpg canvas") as HTMLCanvasElement;
};

const pointerTest = typeof PointerEvent === "undefined" ? test.skip : test;

describe("VueGui v-propagate", () => {
    test("redispatches mouse events to the RPGJS canvas without changing viewport coordinates", () => {
        const canvas = createCanvas();
        let propagated: MouseEvent | undefined;
        canvas.addEventListener("mousedown", (event) => {
            propagated = event;
        });

        const event = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: 120,
            clientY: 80,
            screenX: 220,
            screenY: 180,
            button: 1,
            buttons: 2,
            ctrlKey: true,
            shiftKey: true,
        });

        propagate(event);

        expect(propagated).toBeDefined();
        expect(propagated?.clientX).toBe(120);
        expect(propagated?.clientY).toBe(80);
        expect(propagated?.screenX).toBe(220);
        expect(propagated?.screenY).toBe(180);
        expect(propagated?.button).toBe(1);
        expect(propagated?.buttons).toBe(2);
        expect(propagated?.ctrlKey).toBe(true);
        expect(propagated?.shiftKey).toBe(true);
    });

    test("redispatches wheel events with their delta values", () => {
        const canvas = createCanvas();
        let propagated: WheelEvent | undefined;
        canvas.addEventListener("wheel", (event) => {
            propagated = event;
        });

        const event = new WheelEvent("wheel", {
            bubbles: true,
            clientX: 50,
            clientY: 40,
            deltaX: 2,
            deltaY: 12,
            deltaZ: 1,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
        });

        propagate(event);

        expect(propagated).toBeDefined();
        expect(propagated?.clientX).toBe(50);
        expect(propagated?.clientY).toBe(40);
        expect(propagated?.deltaX).toBe(2);
        expect(propagated?.deltaY).toBe(12);
        expect(propagated?.deltaZ).toBe(1);
        expect(propagated?.deltaMode).toBe(WheelEvent.DOM_DELTA_LINE);
    });

    pointerTest("redispatches pointer events with pointer metadata", () => {
        const canvas = createCanvas();
        let propagated: PointerEvent | undefined;
        canvas.addEventListener("pointerdown", (event) => {
            propagated = event;
        });

        const event = new PointerEvent("pointerdown", {
            bubbles: true,
            clientX: 30,
            clientY: 25,
            pointerId: 7,
            pointerType: "pen",
            isPrimary: true,
            pressure: 0.5,
        });

        propagate(event);

        expect(propagated).toBeDefined();
        expect(propagated?.clientX).toBe(30);
        expect(propagated?.clientY).toBe(25);
        expect(propagated?.pointerId).toBe(7);
        expect(propagated?.pointerType).toBe("pen");
        expect(propagated?.isPrimary).toBe(true);
        expect(propagated?.pressure).toBe(0.5);
    });

    test("does not throw when the RPGJS canvas is missing", () => {
        document.body.innerHTML = "";

        expect(() => propagate(new MouseEvent("click"))).not.toThrow();
    });
});
