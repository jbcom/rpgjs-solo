import { RpgClientEngine } from './RpgClientEngine';

/**
 * RpgResource class
 * 
 * Provides a unified API to access resource file links (images and sounds) in the game.
 * Resources are stored as Maps of resource IDs to file paths/URLs.
 * 
 * ## Design
 * 
 * RpgResource acts as a facade over the engine's resource storage, providing
 * easy access to resource file links. It maintains Maps that are synchronized
 * with the engine's internal storage, but only stores the file paths/URLs,
 * not the full resource objects.
 * 
 * @example
 * ```ts
 * import { RpgResource } from '@rpgjs/client'
 * 
 * // Get spritesheet image link
 * const imageLink = RpgResource.spritesheets.get('hero')
 * 
 * // Get sound file link
 * const soundLink = RpgResource.sounds.get('town-music')
 * 
 * // Set a new resource link
 * RpgResource.spritesheets.set('new-sprite', './assets/new-sprite.png')
 * ```
 */
export class RpgResource {
  private static engine: RpgClientEngine | null = null;
  private static _spritesheets: Map<string, string> = new Map();
  private static _sounds: Map<string, string> = new Map();

  /**
   * Initialize RpgResource with the engine instance
   * 
   * This is called automatically by the engine during initialization.
   * It synchronizes the resource Maps with the engine's internal storage.
   * 
   * @param engine - The RpgClientEngine instance
   */
  static init(engine: RpgClientEngine): void {
    RpgResource.engine = engine;
    RpgResource.syncResources();
  }

  /**
   * Synchronize resource Maps with the engine's internal storage
   * 
   * Extracts file links from spritesheets and sounds stored in the engine
   * and updates the Maps accordingly.
   * 
   * @private
   */
  private static syncResources(): void {
    if (!RpgResource.engine) {
      return;
    }

    // Sync spritesheets
    RpgResource._spritesheets.clear();
    RpgResource.engine.spritesheets.forEach((spritesheet, id) => {
      // Extract image path from spritesheet
      const imageLink = spritesheet?.image || spritesheet?.imageSource || undefined;
      if (imageLink) {
        RpgResource._spritesheets.set(String(id), imageLink);
      }
    });

    // Sync sounds
    RpgResource._sounds.clear();
    RpgResource.engine.sounds.forEach((sound, id) => {
      // Extract src path from sound
      let soundLink: string | undefined;
      
      // If it's a Howler instance, try to get src from _src or src property
      if (sound && typeof sound === 'object') {
        if (sound._src && Array.isArray(sound._src) && sound._src.length > 0) {
          soundLink = sound._src[0];
        } else if (sound.src && typeof sound.src === 'string') {
          soundLink = sound.src;
        } else if (sound.src && Array.isArray(sound.src) && sound.src.length > 0) {
          soundLink = sound.src[0];
        }
      }
      
      if (soundLink) {
        RpgResource._sounds.set(id, soundLink);
      }
    });
  }

  /**
   * Get/Set image links for spritesheets
   * 
   * Map of spritesheet IDs to their image file paths/URLs.
   * This Map is synchronized with the engine's spritesheet storage.
   * 
   * @type {Map<string, string>}
   * 
   * @example
   * ```ts
   * // Get an image link
   * const imageLink = RpgResource.spritesheets.get('hero')
   * 
   * // Set a new image link
   * RpgResource.spritesheets.set('new-sprite', './assets/new-sprite.png')
   * 
   * // Check if a spritesheet exists
   * if (RpgResource.spritesheets.has('monster')) {
   *   const link = RpgResource.spritesheets.get('monster')
   * }
   * ```
   */
  static get spritesheets(): Map<string, string> {
    // Sync before returning to ensure we have the latest data
    RpgResource.syncResources();
    return RpgResource._spritesheets;
  }

  /**
   * Get/Set sound file links
   * 
   * Map of sound IDs to their audio file paths/URLs.
   * This Map is synchronized with the engine's sound storage.
   * 
   * @type {Map<string, string>}
   * 
   * @example
   * ```ts
   * // Get a sound link
   * const soundLink = RpgResource.sounds.get('town-music')
   * 
   * // Set a new sound link
   * RpgResource.sounds.set('new-sound', './assets/new-sound.ogg')
   * 
   * // Iterate over all sounds
   * RpgResource.sounds.forEach((link, id) => {
   *   console.log(`Sound ${id}: ${link}`)
   * })
   * ```
   */
  static get sounds(): Map<string, string> {
    // Sync before returning to ensure we have the latest data
    RpgResource.syncResources();
    return RpgResource._sounds;
  }
}
