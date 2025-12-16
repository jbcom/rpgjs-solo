import { beforeEach, test, expect, afterEach, describe } from "vitest";
import { testing, TestingFixture } from "@rpgjs/testing";
import { defineModule, createModule, Direction } from "@rpgjs/common";
import { RpgPlayer, RpgServer, Move } from "../src";
import { RpgClient } from "../../client/src";

// Define server module with test map
const serverModule = defineModule<RpgServer>({
  maps: [
    {
      id: "test-map",
      file: "",
    },
  ],
  player: {
    async onConnected(player) {
      await player.changeMap("test-map", { x: 100, y: 100 });
    },
  },
});

// Define client module
const clientModule = defineModule<RpgClient>({
  // Client-side logic
});

let player: RpgPlayer;
let client: any;
let fixture: TestingFixture;

beforeEach(async () => {
  const myModule = createModule("TestModule", [
    {
      server: serverModule,
      client: clientModule,
    },
  ]);

  fixture = await testing(myModule);
  client = await fixture.createClient();
  player = await client.waitForMapChange("test-map");
});

afterEach(async () => {
  await fixture.clear();
});



describe("Move Routes - Basic Movements", () => {

  test("should move right using Direction enum", async () => {
    const initialX = player.x();
    const initialY = player.y();
  
    await fixture.waitUntil(
      player.moveRoutes([Direction.Right])
    );
  
    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBe(initialY);
  });

 test("should move left using Direction enum", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Direction.Left])
    );

    expect(player.x()).toBeLessThan(initialX);
    expect(player.y()).toBe(initialY);
  });

  test("should move up using Direction enum", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Direction.Up])
    );

    expect(player.x()).toBe(initialX);
    expect(player.y()).toBeLessThan(initialY);
  });

  test("should move down using Direction enum", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Direction.Down])
    );

    expect(player.x()).toBe(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });

  test("should execute multiple movements in sequence", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([
        Direction.Right,
        Direction.Down,
        Direction.Left,
        Direction.Up,
      ])
    );

    // Player should have moved in a square pattern
    // Final position might not be exactly the same due to physics
    expect(Math.abs(player.x() - initialX)).toBeLessThan(50);
    expect(Math.abs(player.y() - initialY)).toBeLessThan(50);
  });
});

describe("Move Routes - Move Helper Functions", () => {
  test("should move right using Move.right()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.right()])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBe(initialY);
  });

  test("should move left using Move.left()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.left()])
    );

    expect(player.x()).toBeLessThan(initialX);
    expect(player.y()).toBe(initialY);
  });

  test("should move up using Move.up()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.up()])
    );

    expect(player.x()).toBe(initialX);
    expect(player.y()).toBeLessThan(initialY);
  });

  test("should move down using Move.down()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.down()])
    );

    expect(player.x()).toBe(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });

  test("should move multiple times with repeat parameter", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.right(3)])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBe(initialY);
  });
});

describe("Move Routes - Tile Movements", () => {
  test("should move right by tiles using Move.tileRight()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.tileRight()])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBe(initialY);
  });

  test("should move left by tiles using Move.tileLeft()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.tileLeft()])
    );

    expect(player.x()).toBeLessThan(initialX);
    expect(player.y()).toBe(initialY);
  });

  test("should move up by tiles using Move.tileUp()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.tileUp()])
    );

    expect(player.x()).toBe(initialX);
    expect(player.y()).toBeLessThan(initialY);
  });

  test("should move down by tiles using Move.tileDown()", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.tileDown()])
    );

    expect(player.x()).toBe(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });

  test("should move multiple tiles with repeat parameter", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([Move.tileRight(2)])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBe(initialY);
  });
});

describe("Move Routes - Turn Commands", () => {
  test("should turn right using Move.turnRight()", async () => {
    const initialDirection = player.getDirection();

    await fixture.waitUntil(
      player.moveRoutes([Move.turnRight()])
    );

    // Direction should have changed
    expect(player.getDirection()).not.toBe(initialDirection);
  });

  test("should turn left using Move.turnLeft()", async () => {
    const initialDirection = player.getDirection();

    await fixture.waitUntil(
      player.moveRoutes([Move.turnLeft()])
    );

    expect(player.getDirection()).not.toBe(initialDirection);
  });

  test("should turn up using Move.turnUp()", async () => {
    await fixture.waitUntil(
      player.moveRoutes([Move.turnUp()])
    );

    // turnUp() returns a string command, direction should be Up after execution
    expect(player.getDirection()).toBe(Direction.Up);
  });

  test("should turn down using Move.turnDown()", async () => {
    await fixture.waitUntil(
      player.moveRoutes([Move.turnDown()])
    );

    // turnDown() returns a string command, direction should be Down after execution
    expect(player.getDirection()).toBe(Direction.Down);
  });

  test("should combine turn and movement", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([
        Move.turnRight(),
        Move.right(),
        Move.turnDown(),
        Move.down(),
      ])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });
});

describe("Move Routes - Callback Functions", () => {
  test("should execute callback function routes", async () => {
    const initialX = player.x();
    const initialY = player.y();

    const callbackRoute = (player: RpgPlayer, map: any) => {
      return Move.right(2);
    };

    await fixture.waitUntil(
      player.moveRoutes([callbackRoute])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBe(initialY);
  });

  test("should execute multiple callback functions", async () => {
    const initialX = player.x();
    const initialY = player.y();

    const callback1 = (player: RpgPlayer, map: any) => Move.right();
    const callback2 = (player: RpgPlayer, map: any) => Move.down();

    await fixture.waitUntil(
      player.moveRoutes([callback1, callback2])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });
});

describe("Move Routes - Promises", () => {
  test("should wait for promise before continuing", async () => {
    const initialX = player.x();
    const initialY = player.y();

    const waitPromise = Move.wait(0.1); // 100ms wait

    await fixture.waitUntil(
      player.moveRoutes([
        Move.right(),
        waitPromise,
        Move.down(),
      ])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });
});

describe("Move Routes - Nested Arrays", () => {
  test("should flatten nested route arrays", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([
        [Move.right(), Move.right()] as any,
        [Move.down(), Move.down()] as any,
      ])
    );

    expect(player.x()).toBeGreaterThan(initialX);
    expect(player.y()).toBeGreaterThan(initialY);
  });
});

describe("Move Routes - Infinite Routes", () => {
  test("should start infinite route", async () => {
    const initialX = player.x();

    player.infiniteMoveRoute([Move.right()]);

    // Let it run for a bit
    await fixture.nextTickTimes(20);
    await fixture.wait(400);

    // Player should have moved
    expect(player.x()).toBeGreaterThan(initialX);

    // Stop the infinite route
    player.breakRoutes();
  });

  test("should stop infinite route with breakRoutes()", async () => {
    const initialX = player.x();

    player.infiniteMoveRoute([Move.right()]);

    // Let it run briefly
    await fixture.nextTickTimes(5);
    await fixture.wait(100);

    const xBeforeBreak = player.x();
    player.breakRoutes();

    // Wait a bit more
    await fixture.nextTickTimes(10);
    await fixture.wait(200);

    // Player should have stopped moving (or moved very little)
    expect(Math.abs(player.x() - xBeforeBreak)).toBeLessThan(10);
  });

  test("should force stop infinite route", async () => {
    const initialX = player.x();

    player.infiniteMoveRoute([Move.right()]);

    // Let it run briefly
    await fixture.nextTickTimes(5);
    await fixture.wait(100);

    const xBeforeBreak = player.x();
    player.breakRoutes(true); // Force stop

    // Wait a bit more
    await fixture.nextTickTimes(10);
    await fixture.wait(200);

    // Player should have stopped moving
    expect(Math.abs(player.x() - xBeforeBreak)).toBeLessThan(10);
  });

  test("should replay infinite route", async () => {
    const initialX = player.x();

    player.infiniteMoveRoute([Move.right()]);

    // Let it run
    await fixture.nextTickTimes(10);
    await fixture.wait(200);

    const xAfterStart = player.x();
    player.breakRoutes();

    // Wait a bit
    await fixture.nextTickTimes(5);
    await fixture.wait(100);

    // Replay
    player.replayRoutes();

    // Let it run again
    await fixture.nextTickTimes(10);
    await fixture.wait(200);

    // Player should have moved more
    expect(player.x()).toBeGreaterThan(xAfterStart);

    player.breakRoutes();
  });
});

describe("Move Routes - Route Completion", () => {
  test("should resolve promise when route completes", async () => {
    let completed = false;

    const promise = player.moveRoutes([Move.right()]);
    
    promise.then(() => {
      completed = true;
    });

    await fixture.waitUntil(promise);
    expect(completed).toBe(true);
  });

  test("should return true when route completes successfully", async () => {
    const result = await fixture.waitUntil(
      player.moveRoutes([Move.right()])
    );
    expect(result).toBe(true);
  });
});

describe("Move Routes - Complex Scenarios", () => {
  test("should execute complex route with multiple types", async () => {
    const initialX = player.x();
    const initialY = player.y();

    await fixture.waitUntil(
      player.moveRoutes([
        Move.turnRight(),
        Move.right(2),
        Move.turnDown(),
        Move.down(2),
        Move.turnLeft(),
        Move.left(2),
        Move.turnUp(),
        Move.up(2),
      ])
    );

    // Player should have moved in a square pattern
    expect(Math.abs(player.x() - initialX)).toBeLessThan(100);
    expect(Math.abs(player.y() - initialY)).toBeLessThan(100);
  });

  test("should clear movements when starting new route", async () => {
    const initialX = player.x();

    // Start first route
    const promise1 = player.moveRoutes([Move.right()]);
    
    // Start second route immediately (should clear first)
    const promise2 = player.moveRoutes([Move.left()]);

    await fixture.waitUntil(Promise.all([promise1, promise2]));

    // Player should have moved left (second route)
    expect(player.x()).toBeLessThan(initialX);
  });
  
});