/**
 * Exact renderer/tooling matrix validated for this Solo source cohort.
 *
 * The public patch package remains consumer-injected. Applications can use
 * this record to check compatibility before renderer bootstrap.
 */
export const rpgjsSoloRendererCompatibility = Object.freeze({
  canvasengine: '2.2.0',
  vite: '8.2.1',
  patches: Object.freeze({
    package: 'rpgjs-patches',
    version: '^0.4.0',
    installer: 'installCanvasEnginePatches',
    timing: 'before-scene-bootstrap'
  })
} as const)
