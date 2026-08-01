---
"@rpgjs/tiledmap": patch
"@rpgjs/vite": patch
---

Keep Tiled development and static-production URLs aligned by deriving build output from `publicPath`, rejecting accidental path mismatches unless an external rewrite is explicitly acknowledged, and honoring Vite root/base normalization without permitting traversal. Standalone Tiled loading now identifies an SPA HTML fallback before XML parsing and reports the mismatched deployed URL instead of leaving a blank map.
Development serving opens the canonical in-root file once and reads that stable descriptor, so a file cannot be swapped between validation and response.
