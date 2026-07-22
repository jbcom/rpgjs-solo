# RPGJS Solo contributor context

Read `CONTRIBUTING.md` completely before changing this repository.

- Gitea `main` is the canonical product branch. GitHub is a public downstream
  mirror, not the development record.
- `v5` is the exact upstream-tracking branch; product changes belong on focused
  feature branches based on `main` and merge back to `main`.
- Do not open pull requests or contribute changes to upstream RPGJS. Preserve
  its MIT attribution and audit its `v5` line as an input only.
- The shipped Solo runtime must converge on one in-process authoritative game
  state. Do not add a socket, fake HTTP request, room transport, serialized
  message, prediction, reconciliation, or multiplayer abstraction to solve a
  local-runtime problem.
- Preserve useful RPGJS authoring APIs where doing so does not preserve the
  client/server architecture.
- Every publishable package change needs a Changeset and focused tests.
- Before release, advance to the next prerelease version and ensure the npm
  latest tag points to that exact release.
