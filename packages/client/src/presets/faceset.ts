/**
 * Creates a faceset preset for character expressions
 * 
 * This preset allows you to define multiple facial expressions for a character,
 * where each expression corresponds to a specific frame position (frameX, frameY)
 * within a single faceset texture. Each expression is defined by its position
 * in the faceset grid.
 * 
 * @param options - Object containing the faceset configuration
 * @param framesWidth - Number of frames horizontally in the faceset texture
 * @param framesHeight - Number of frames vertically in the faceset texture
 * @param expressions - Object mapping expression names to their frame positions as tuples [frameX, frameY]
 * @returns Faceset configuration with animations for each expression
 * 
 * @example
 * ```typescript
 * const faceset = FacesetPreset({
 *   id: "facesetId",
 *   image: "faceset.png",
 *   width: 1024,
 *   height: 1024,
 * }, 4, 2, {
 *   happy: [0, 0],
 *   sad: [1, 0],
 *   angry: [2, 0],
 *   surprised: [3, 0]
 * });
 * ```
 */
export const FacesetPreset = (
    options: any,
    framesWidth: number, 
    framesHeight: number,
    expressions: Record<string, [number, number]>,
) => {
    
    const textures: Record<string, any> = {};
    
    // Create texture configuration for each expression
    Object.keys(expressions).forEach((expressionName) => {
        const [frameX, frameY] = expressions[expressionName];
        textures[expressionName] = {
            animations: () => [
                [{ 
                    time: 0, 
                    frameX: frameX, 
                    frameY: frameY 
                }]
            ],
        };
    });
    
    return {
        ...options,
        framesWidth,
        framesHeight,
        textures
    };
};
  