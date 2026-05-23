import { describe, expect, test } from "vitest";
import { EventComponentResolverRegistry, normalizeEventComponent } from "./EventComponentResolver";

describe("EventComponentResolverRegistry", () => {
  test("uses the last resolver returning a custom event component", () => {
    const registry = new EventComponentResolverRegistry();
    const firstComponent = (() => null) as any;
    const secondComponent = (() => null) as any;
    const event = { id: "event-1" } as any;

    registry.add(() => firstComponent);
    registry.add(() => null);
    registry.add(() => ({ component: secondComponent, props: { variant: "open" } }));

    expect(registry.resolve(event)).toEqual({
      component: secondComponent,
      props: { variant: "open" }
    });
  });

  test("returns null when no resolver matches", () => {
    const registry = new EventComponentResolverRegistry();

    registry.add(() => undefined);
    registry.add(() => null);

    expect(registry.resolve({ id: "event-1" } as any)).toBeNull();
  });

  test("can clear registered resolvers", () => {
    const registry = new EventComponentResolverRegistry();
    const component = (() => null) as any;

    registry.add(() => component);
    registry.clear();

    expect(registry.resolve({ id: "event-1" } as any)).toBeNull();
  });

  test("always injects the real sprite prop for direct components", () => {
    const component = (() => null) as any;
    const sprite = { id: "event-1" } as any;

    expect(normalizeEventComponent(component, sprite)).toEqual({
      component,
      props: { sprite },
      dependencies: [],
      renderGraphic: false
    });
  });

  test("keeps custom props from replacing the sprite prop", () => {
    const component = (() => null) as any;
    const sprite = { id: "real-event" } as any;
    const spoofedSprite = { id: "spoofed-event" };

    const normalized = normalizeEventComponent({
      component,
      props: { sprite: spoofedSprite, variant: "wood" },
      dependencies: () => ["ready"],
      renderGraphic: true
    }, sprite);

    expect(normalized).toEqual({
      component,
      props: { variant: "wood", sprite },
      dependencies: ["ready"],
      renderGraphic: true
    });
  });

  test("supports dynamic props", () => {
    const component = (() => null) as any;
    const sprite = { id: "event-1", name: "CHEST" } as any;

    expect(normalizeEventComponent({
      component,
      props: (event) => ({ label: (event as any).name })
    }, sprite)?.props).toEqual({
      label: "CHEST",
      sprite
    });
  });
});
