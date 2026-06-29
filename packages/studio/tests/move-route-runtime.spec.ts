import { describe, expect, test } from "vitest";
import { move_route } from "../runtime/blocks/executors/move-route";

describe("Studio move route runtime", () => {
  test("applies always on bottom route command", async () => {
    const zValues: number[] = [];
    const event: any = {
      z: {
        set: (value: number) => zValues.push(value),
      },
      moveRoutes: (routes: Array<(target: unknown) => void>) => {
        routes.forEach((route) => route(event));
      },
    };

    await move_route(
      {
        event,
        player: null,
        moveApi: {},
      } as any,
      {
        eventId: "$this",
        route: [
          {
            action: "set_always_on_bottom",
            value: true,
          },
        ],
      },
    );

    expect(zValues).toEqual([-1000]);
  });
});
