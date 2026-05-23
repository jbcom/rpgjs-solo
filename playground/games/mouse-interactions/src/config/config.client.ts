import {
  hoverPopover,
  provideClientGlobalConfig,
  provideClientModules,
  provideLoadMap,
  selectable,
  type RpgInteractionContext,
} from "@rpgjs/client";
import MapComponent from "../components/map.ce";
import EventShape from "../components/event-shape.ce";
import PlayerMarker from "../components/player-marker.ce";
import GuardPopover from "../components/guard-popover.ce";
import ChestSelection from "../components/chest-selection.ce";
import CrateHint from "../components/crate-hint.ce";
import CrateDragPreview from "../components/crate-drag-preview.ce";
import TreeHint from "../components/tree-hint.ce";
import { provideMain } from "../modules/main";

function read(value: any): any {
  return typeof value === "function" ? value() : value;
}

function spriteId(ctx: RpgInteractionContext): string {
  return String(read(ctx.target.id));
}

function localTile(ctx: RpgInteractionContext) {
  const tile = ctx.pointer.tile();
  if (!tile) return null;

  return {
    ...tile,
    worldX: tile.worldX - ctx.target.x(),
    worldY: tile.worldY - ctx.target.y(),
  };
}

function treeTrunkHitTest(ctx: RpgInteractionContext): boolean {
  const point = ctx.pointer.world();
  if (!point) return false;

  const x = ctx.target.x();
  const y = ctx.target.y();

  return (
    point.x >= x + 14 &&
    point.x <= x + 34 &&
    point.y >= y + 2 &&
    point.y <= y + 34
  );
}

export default {
  providers: [
    provideLoadMap((id: string) => ({
      id,
      component: MapComponent,
      width: 720,
      height: 480,
      tileWidth: 32,
      tileHeight: 32,
      data: {},
      hitboxes: [
        { id: "top-wall", x: 24, y: 24, width: 672, height: 2 },
        { id: "bottom-wall", x: 24, y: 454, width: 672, height: 2 },
        { id: "left-wall", x: 24, y: 24, width: 2, height: 432 },
        { id: "right-wall", x: 694, y: 24, width: 2, height: 432 },
      ],
    })),
    provideClientGlobalConfig(),
    provideMain(),
    provideClientModules([
      {
        sprite: {
          componentsBehind: [PlayerMarker],
          eventComponent(event) {
            const name = read(event.name);
            if (["Guard", "Chest", "Crate", "Tree"].includes(name)) {
              return EventShape;
            }
            return null;
          },
        },

        interactions: {
          setup(engine) {
            engine.interactions.use("Guard", {
              ...hoverPopover(GuardPopover),
              click(ctx) {
                ctx.action("mouse:talk", {
                  eventId: spriteId(ctx),
                });
              },
            });

            engine.interactions.use("Chest", {
              ...selectable(),
              component: ChestSelection,
            });

            engine.interactions.use("Crate", {
              component: CrateHint,
              cursor: "grab",
              hitTest(ctx) {
                return ctx.bounds("hitbox").contains(ctx.pointer.world());
              },
              dragstart(ctx) {
                ctx.overlay.render(CrateDragPreview, {
                  tile: localTile(ctx),
                });
              },
              dragmove(ctx) {
                ctx.overlay.update({
                  tile: localTile(ctx),
                });
              },
              drop(ctx) {
                const tile = ctx.pointer.tile();
                ctx.overlay.clear();
                if (!tile) return;

                ctx.action("mouse:move-crate", {
                  eventId: spriteId(ctx),
                  tile,
                });
              },
              cancel(ctx) {
                ctx.overlay.clear();
              },
            });

            engine.interactions.use("Tree", {
              component: TreeHint,
              cursor: "help",
              hitTest: treeTrunkHitTest,
            });
          },
        },
      },
    ]),
  ],
};
