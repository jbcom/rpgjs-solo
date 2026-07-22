# @jbcom/rpgjs-solo-pixi

Thin PixiJS 8.19 bindings for RPGJS Solo. Use the fleet's
`@arcade-cabinet/pixi-mount` to own application/canvas lifecycle; this package
only feeds Pixi ticker time into `SoloRuntime` and projects authoritative entity
positions into display objects.

It creates no gameplay copy and owns no renderer lifecycle.
