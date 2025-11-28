import { signal } from "@signe/reactive";
import { connected, id, persist, sync, users } from "@signe/sync";
import { Item } from "./database";
export enum Direction {
  Up = "up",
  Down = "down",
  Left = "left",
  Right = "right",
}

export enum Animation {
  Stand = "stand",
  Walk = "walk",
  Attack = "attack",
  Defense = "defense",
  Skill = "skill",
}

export interface Hitbox {
  w: number;
  h: number;
}

export interface ShowAnimationParams {
  graphic?: string | string[];
  animationName: string;
  loop?: boolean;
}

export interface AttachShapeOptions {
  /** Width of the shape in pixels */
  width: number;
  /** Height of the shape in pixels */
  height: number;
  /** Circle radius in pixels (for zone shapes) */
  radius?: number;
  /** Vision aperture in degrees. 360 = full circle, <360 = cone */
  angle?: number;
  /** Facing direction used when angle < 360 */
  direction?: Direction;
  /** If true, walls (static hitboxes) stop vision */
  limitedByWalls?: boolean;
  /** Indicate where the shape is placed relative to the player */
  positioning?: "center" | "top" | "bottom" | "left" | "right";
  /** The name of the shape */
  name?: string;
  /** An object to retrieve information when interacting with the shape */
  properties?: object;
}

export abstract class RpgCommonPlayer {
  @id() id: string;
  @sync() name = signal("");
  @sync() type = signal("");
  // x and y must be @sync() to ensure initial positions are sent to client
  // The positions represent TOP-LEFT coordinates of the character's hitbox
  // @persist() only persists server-side but doesn't sync to client
  @sync() x = signal(0);
  @sync() y = signal(0);
  @sync() z = signal(0);
  @sync() tint = signal("white");
  @sync() direction = signal(Direction.Down);
  @sync() speed = signal(4);
  @sync() graphics = signal<any>([]);
  @sync() canMove = signal(true);
  @sync() hitbox = signal<Hitbox>({
    w: 32,
    h: 32,
  });
  @sync() _gold = signal(0);
  animationName = signal("stand");
  @sync() hpSignal = signal(0);
  @sync() spSignal = signal(0);
  @sync() _exp = signal(0);
  @sync() _level = signal(0);
  @sync() _class = signal({});
  @sync(Item) items = signal<Item[]>([]);
  @sync() equipments = signal<any[]>([]);
  @sync() states = signal<any[]>([]);
  @sync() skills = signal<any[]>([]);
  @sync() _effects = signal<any[]>([]);
  @sync() _through = signal(false);
  @sync() _throughOtherPlayer = signal(true);
  @sync() _throughEvent = signal(false);
  @sync() _frequency = signal(0);
  @sync() _frames = signal<{ x: number; y: number; ts: number }[]>([]);
  @sync() componentsTop = signal<string | null>(null);
  @sync() componentsBottom = signal<string | null>(null);
  @sync() componentsCenter = signal<string | null>(null);
  @sync() componentsLeft = signal<string | null>(null);
  @sync() componentsRight = signal<string | null>(null);
  @connected() isConnected = signal(false)

  // Store intended movement direction (not synced, only used locally)
  private _intendedDirection: Direction | null = null;

  pendingInputs: any[] = [];

  /**
   * Change the player's facing direction
   *
   * Updates the direction the player is facing, which affects animations
   * and directional abilities. This should be called when the player
   * intends to move in a specific direction, not when they are pushed
   * by physics or sliding.
   *
   * @param direction - The new direction to face
   *
   * @example
   * ```ts
   * // Player presses right arrow key
   * player.changeDirection(Direction.Right);
   * ```
   */
  changeDirection(direction: Direction) {
    this.direction.set(direction);
  }

  /**
   * Get the current facing direction
   *
   * @returns Current direction the player is facing
   *
   * @example
   * ```ts
   * const currentDirection = player.getDirection();
   * if (currentDirection === Direction.Up) {
   *   // Player is facing up
   * }
   * ```
   */
  getDirection() {
    return this.direction();
  }

}