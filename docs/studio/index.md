---
title: "Studio overview"
description: "Use RPGJS Studio with AI assistants such as Claude Code, Codex, or similar tools."
---

# Studio overview

RPGJS Studio can be used directly from an AI coding assistant such as Claude Code, Codex, or any similar tool that supports skills.

## In this section

- What the Studio skill is for
- How to install the RPGJS Studio skill
- How to create and configure the Studio API key
- How to connect an RPGJS game to Studio data
- How to configure Studio event page options
- How to extend the Studio map renderer with plugins

## Recommended workflow

1. Install the shared skill:

```bash
npx skills add https://github.com/RSamaium/RPG-JS#v5
```

2. When the tool asks which skill to install, choose `RPGJS Studio`.
3. Create an API key from [RPGJS Studio API keys](https://rpgjs.studio/api-keys).
4. Add the key to your environment with `RPGSTUDIO_API_KEY`.

Example:

```bash
export RPGSTUDIO_API_KEY="your-api-key"
```

Or in a `.env` file:

```dotenv
RPGSTUDIO_API_KEY=your-api-key
```

The runtime keeps public `/game/*` reads credential-free. Protected block
collection reads send this value only as the `x-api-key` header; authorization
errors never include the credential. Offline mode remains local, while auto
mode attempts the local bundle before an authenticated online fallback.

Block collections are validated immediately before execution against the same
canonical JSON Schemas used by Studio's runtime block registry. Unknown block
types, missing or invalid data, and malformed nested children are rejected as a
whole before any block runs. Validation follows every executable sequence,
including each `show_choices.data.choiceChildren` branch, so an unknown or
malformed block cannot hide in an unselected choice. Direct hydrated workflows,
Common Event links, and queued fresh-read behavior are unchanged.

## Next step

- [Use a game with Studio](/studio/game-integration)
- [Studio event page options](/studio/event-page-options)
- [Create a Studio plugin](/studio/plugins)
