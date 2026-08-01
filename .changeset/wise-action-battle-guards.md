---
"@rpgjs/action-battle": patch
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
