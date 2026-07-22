# RPGJS Solo contributor context

Read `CONTRIBUTING.md` completely before changing this repository.

- `v5` is the upstream-tracking branch; product changes belong on `solo` via a
  feature branch.
- The shipped Solo runtime must converge on one in-process authoritative game
  state. Do not add a socket, fake HTTP request, room transport, serialized
  message, prediction, reconciliation, or multiplayer abstraction to solve a
  local-runtime problem.
- Preserve useful RPGJS authoring APIs where doing so does not preserve the
  client/server architecture.
- Every publishable package change needs a Changeset and focused tests.
- Before release, advance to the next prerelease version and ensure the npm
  latest tag points to that exact release.
