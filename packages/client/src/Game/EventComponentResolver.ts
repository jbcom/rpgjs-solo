import type { EventComponentConfig, EventComponentSprite } from "../RpgClient";
import type { RpgClientEvent } from "./Event";

export type EventComponentResolver = (event: EventComponentSprite) => EventComponentConfig | null | undefined;

export interface NormalizedEventComponentConfig {
  component: any;
  props: Record<string, any>;
  dependencies: any[];
  renderGraphic: boolean;
}

export class EventComponentResolverRegistry {
  private resolvers: EventComponentResolver[] = [];

  add(resolver: EventComponentResolver) {
    this.resolvers.push(resolver);
    return resolver;
  }

  resolve(event: RpgClientEvent): EventComponentConfig | null {
    let resolved: EventComponentConfig | null = null;
    this.resolvers.forEach((resolver) => {
      const result = resolver(event as EventComponentSprite);
      if (result !== undefined && result !== null) {
        resolved = result;
      }
    });
    return resolved;
  }

  clear() {
    this.resolvers = [];
  }
}

function withoutReservedSpriteProp(props: unknown): Record<string, any> {
  if (!props || typeof props !== "object") return {};
  const { sprite: _ignoredSprite, ...safeProps } = props as Record<string, any>;
  return safeProps;
}

export function normalizeEventComponent(
  componentConfig: EventComponentConfig | null | undefined,
  sprite: RpgClientEvent
): NormalizedEventComponentConfig | null {
  if (!componentConfig) return null;

  if (typeof componentConfig === "object" && "component" in componentConfig) {
    const propsValue = componentConfig.props !== undefined
      ? componentConfig.props
      : componentConfig.data;
    const props = typeof propsValue === "function"
      ? propsValue(sprite as EventComponentSprite)
      : propsValue;

    return {
      component: componentConfig.component,
      props: {
        ...withoutReservedSpriteProp(props),
        sprite
      },
      dependencies: componentConfig.dependencies ? componentConfig.dependencies(sprite as EventComponentSprite) : [],
      renderGraphic: componentConfig.renderGraphic === true
    };
  }

  return {
    component: componentConfig,
    props: { sprite },
    dependencies: [],
    renderGraphic: false
  };
}
