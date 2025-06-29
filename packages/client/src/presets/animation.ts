/**
 * Creates an animation spritesheet preset with automatic frame generation
 * 
 * This function generates animation frames based on the provided width and height dimensions.
 * It creates a sequence of frames that progresses through the spritesheet from left to right,
 * top to bottom, with each frame having a 10ms time increment.
 * 
 * @param {number} framesWidth - The number of frames horizontally in the spritesheet
 * @param {number} framesHeight - The number of frames vertically in the spritesheet
 * @returns {Object} Animation preset configuration object
 * 
 * @example
 * ```javascript
 * // For a 4x4 spritesheet
 * const preset = AnimationSpritesheetPreset(4, 4);
 * // This will generate 16 frames with coordinates from (0,0) to (3,3)
 * ```
 */
export const AnimationSpritesheetPreset = (framesWidth: number, framesHeight: number) => {
    
    const animations: Array<{ time: number; frameX: number; frameY: number }> = [];

    for (let y = 0; y < framesHeight; y++) {
        for (let x = 0; x < framesWidth; x++) {
            const frameIndex = y * framesWidth + x;
            animations.push({ 
                time: frameIndex * 10, 
                frameX: x, 
                frameY: y 
            });
        }
    }
    
    return {
        framesWidth,
        framesHeight,
        textures: {
            default: {
                animations: () => [
                    animations
                ],
            }
        }
    };
};
  