# Changesets

Run `pnpm changeset` for every user-facing package change. Select the affected
`@rpgjs/*` packages, choose the semver bump, and write a short release note.

Changesets keeps package versions independent. When an internal `@rpgjs/*`
dependency is released, dependent packages receive at least a patch release so
their published npm dependency ranges stay consistent.
