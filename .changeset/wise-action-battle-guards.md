---
"@rpgjs/action-battle": patch
---

Preserve native skill and item effect restrictions in Action Battle casts,
including AI startup authorization without basic-attack fallback. Derive AI
planning, player soft-target eligibility, and projectile travel from one
candidate-specific rectangular targeting boundary. Reject every combat input
from defeated players before dispatch side effects, and require explicit
projectile directions to align across player selection, AI planning, and
emission.
