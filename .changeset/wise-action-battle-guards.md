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
Advance an authoritative monotonic life generation at each HP defeat and revival
transition, and capture it across player and AI startup, active frames, combos,
charges, dashes, and counters so transient defeat cannot revive stale work.
Bind every delayed AI attack pattern to the telegraphed target object and its
life generation so target revival or replacement cancels rather than redirects
pending melee, combo, charge, dash, or counter work. Keep actor-centered zone
attacks independent of one selected target and bind planned support to its actual
evaluation targets.
Replan delayed AI skills against the same target identity and current defeat,
policy, range, mask, blocker, cooldown, and resource state before hooks or spend.
Use one blocker-aware collision policy for projectile admission and simulation,
preserving owner and ally pass-through while world geometry occludes farther
targets. Resolve projectile collision size as radius, then width, then height,
and transmit the radius so client prediction uses the matching capsule cast.
Make physics-only projectile impacts a no-op for default combat effects while
retaining explicit custom wall-impact hooks. Treat polygon edges and corners as
distance-zero overlaps for parallel rays without letting a repeated closing
vertex contain arbitrary points.
