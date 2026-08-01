---
"@rpgjs/action-battle": patch
"@rpgjs/client": patch
"@rpgjs/common": patch
"@rpgjs/physic": patch
"@rpgjs/server": patch
"@jbcom/rpgjs-solo": patch
---

Preserve native skill and item effect restrictions in Action Battle casts,
including AI startup authorization without basic-attack fallback. Derive AI
planning, player soft-target eligibility, and projectile emission from one
physical descriptor, including authored origin, normalized direction,
trajectory-first range precedence, rectangular tile fallback, and swept
collision radius. Admit target collider intersections instead of requiring an
exact centerline, and simulate that same radius in persistent and instant
server projectiles. Reject defeated actors at every combat entry, including
direct use, queued melee, AI, hotbar dispatch, and the server-owned GUI callback.
Recursively recheck delayed AI startup, combo, dash, and counterattack work at
execution time while preserving already-emitted projectiles after caster defeat.
Use one blocker-aware collision policy for projectile admission and simulation,
preserving owner and ally pass-through while world geometry occludes farther
targets. Resolve projectile collision size as radius, then width, then height,
and transmit the radius so client prediction uses the matching capsule cast.
Treat polygon edges and corners as distance-zero overlaps for parallel rays.
