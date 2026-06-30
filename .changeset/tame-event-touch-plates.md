---
"@rpgjs/common": patch
"@rpgjs/client": patch
"@rpgjs/server": patch
"@rpgjs/studio": patch
---

Let Studio event-touch pressure plates overlap pushed events without physical separation, wait until ground sensors are mostly covered before firing, clean up touch tracking when collisions exit after z changes, and clamp route overshoot frames that could make pushed events jitter.
