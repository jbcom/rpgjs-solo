
import { test, expect, describe, vi } from "vitest";
import { Direction } from "@rpgjs/common";
import { Move } from "../src/Player/MoveManager";

describe("Improved Random Movement Unit Tests", () => {
    test("Move.random(repeat) should return array of identical directions", () => {
        // Mock Math.random to return a fixed value
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1); // Should map to index 0 (Right)

        const directions = Move.random(5);

        expect(directions).toHaveLength(5);
        expect(directions.every(d => d === Direction.Right)).toBe(true);

        randomSpy.mockRestore();
    });

    test("Move.random(repeat) should produce different directions with different random values", () => {
        const randomSpy = vi.spyOn(Math, 'random');

        randomSpy.mockReturnValue(0.1); // Right
        const rightDirs = Move.random(1);
        expect(rightDirs[0]).toBe(Direction.Right);

        randomSpy.mockReturnValue(0.3); // Left
        const leftDirs = Move.random(1);
        expect(leftDirs[0]).toBe(Direction.Left);

        randomSpy.mockReturnValue(0.6); // Up
        const upDirs = Move.random(1);
        expect(upDirs[0]).toBe(Direction.Up);

        randomSpy.mockReturnValue(0.9); // Down
        const downDirs = Move.random(1);
        expect(downDirs[0]).toBe(Direction.Down);

        randomSpy.mockRestore();
    });

    test("Move.tileRandom(repeat) should return consistent direction for tiles", () => {
        // Mock Math.random to return a fixed value
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1); // Should map to index 0 (Right)

        const mockPlayer = {
            speed: 3
        } as any;

        const mockMap = {
            tileWidth: 32,
            tileHeight: 32
        } as any;

        const callback = Move.tileRandom(3);
        const directions = callback(mockPlayer, mockMap);

        // repeatTile = Math.floor(32 / 3) * 3 = 10 * 3 = 30
        // So we expect 30 directions, all Right

        expect(directions.length).toBe(30);
        expect(directions.every(d => d === Direction.Right)).toBe(true);

        randomSpy.mockRestore();
    });
});
