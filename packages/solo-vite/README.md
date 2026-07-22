# @jbcom/rpgjs-solo-vite

Add `rpgjsSoloBoundary()` to a Vite game build to fail when Signe room/sync,
WebSocket, PartySocket, prediction, or input-buffer architecture leaks into the
production chunks. An optional entry-size budget catches accidental framework
regressions.

The peer Vite version is exact and is refreshed with the private Solo release,
so consumers cannot silently exercise an unverified newer or older build API.
