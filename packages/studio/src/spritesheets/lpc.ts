import { Animation, Direction } from "./types";

export const LPCSpritesheetPreset = (options: {
  id: string;
  imageSource: string;
  scale?: [number, number];
  includeAttack3?: boolean;
}) => {
  const frameY = (direction: Direction) => {
    return {
      [Direction.Down]: 2,
      [Direction.Left]: 1,
      [Direction.Right]: 3,
      [Direction.Up]: 0,
    }[direction];
  };

  const stand = (direction: Direction) => [
    { time: 0, frameX: 0, frameY: frameY(direction) },
  ];
  const anim = (
    direction: Direction,
    framesWidth: number,
    speed: number = 5
  ) => {
    const array: any = [];
    for (let i = 0; i < framesWidth; i++) {
      array.push({ time: i * speed, frameX: i, frameY: frameY(direction) });
    }
    return array;
  };

  const ratio = 1;
  const scale = options.scale ?? [1, 1];

  return {
    id: options.id,
    image: options.imageSource,
    opacity: 1,
    rectWidth: 64 * ratio,
    rectHeight: 64 * ratio,
    framesWidth: 6,
    framesHeight: 4,
    scale: scale,
    spriteRealSize: {
      width: 48,
      height: 52,
    },
    textures: {
      [Animation.Stand]: {
        offset: {
          x: 0,
          y: 512 * ratio,
        },
        animations: ({ direction }) => [stand(direction)],
      },
      [Animation.Walk]: {
        offset: {
          x: 0,
          y: 512 * ratio,
        },
        framesWidth: 9,
        framesHeight: 4,
        animations: ({ direction }) => [anim(direction, 9)],
      },
      [Animation.Attack]: {
        offset: {
          x: 0,
          y: 768 * ratio,
        },
        framesWidth: 6,
        framesHeight: 4,
        animations: ({ direction }) => [anim(direction, 6, 3)],
      },
      [Animation.Skill]: {
        framesWidth: 7,
        framesHeight: 4,
        animations: ({ direction }) => [anim(direction, 7, 3)],
      },
      attack2: {
        offset: {
          x: 0,
          y: 256 * ratio,
        },
        framesWidth: 7,
        framesHeight: 8,
        animations: ({ direction }) => [anim(direction, 7, 3)],
      },
      ...(options.includeAttack3
        ? {
            attack3: {
              offset: {
                x: 0,
                y: -864,
              },
              rectWidth: 216,
              rectHeight: 216,
              framesWidth: 6,
              framesHeight: 4,
              animations: ({ direction }) => [anim(direction, 6, 3)],
            },
          }
        : {}),
    },
  };
};
