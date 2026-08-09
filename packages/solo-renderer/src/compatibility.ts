/**
 * Exact renderer/tooling matrix validated for this Solo source cohort.
 *
 * The patch package remains consumer-injected so this public fork does not
 * acquire a dependency on the fleet's private registry. Fleet games can use
 * this record as a deterministic admission check before renderer bootstrap.
 */
export const rpgjsSoloRendererCompatibility = Object.freeze({
  canvasengine: '2.2.0',
  vite: '8.2.1',
  patches: Object.freeze({
    package: '@arcade-cabinet/rpgjs-patches',
    version: '0.3.0',
    installer: 'installCanvasEnginePatches',
    timing: 'before-scene-bootstrap'
  })
} as const)
