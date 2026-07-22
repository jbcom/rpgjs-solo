const frameRow = (direction: string, framesHeight: number): number => {
  const gap = Math.max(4 - framesHeight, 0)
  return {
    down: 0,
    left: Math.max(0, 1 - gap),
    right: Math.max(0, 2 - gap),
    up: Math.max(0, 3 - gap)
  }[direction] ?? 0
}

/** RPG Maker-style four-direction spritesheet, retained from RPGJS' native preset. */
export const createRpgMakerSpritesheet = (
  image: string,
  framesWidth: number,
  framesHeight: number,
  frameStand = 1
) => {
  const standFrame = Math.min(Math.max(0, frameStand), framesWidth - 1)
  const stand = (direction: string) => [
    { time: 0, frameX: standFrame, frameY: frameRow(direction, framesHeight) }
  ]
  const walk = (direction: string) => {
    const frames = Array.from({ length: framesWidth }, (_, index) => ({
      time: index * 10,
      frameX: index,
      frameY: frameRow(direction, framesHeight)
    }))
    return [...frames, { time: frames.length * 10 }]
  }

  return {
    image,
    framesWidth,
    framesHeight,
    textures: {
      stand: { animations: ({ direction = 'down' } = {}) => [stand(direction)] },
      walk: { animations: ({ direction = 'down' } = {}) => [walk(direction)] }
    }
  }
}
