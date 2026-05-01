# Media API

Use this reference for browsing media, updating metadata, replacing files, or calling AI media generation endpoints.

## Search first

When another API needs a media reference such as an icon, character appearance, faceset, BGM, BGS, or other media field, search first:

- Search media: `GET /api/media?query=<search>`

Workflow:

1. Search `/api/media?query=<search>`.
2. If a suitable media record exists, use its `_id`.
3. If not found, decide whether to upload/create it or generate it.
4. If generation is needed, call `POST /api/media/generate` with `action: "estimate"` first.
5. Tell the user how many credits will be used and whether the current actor has enough credits.
6. Ask for explicit confirmation before calling `action: "execute"`.
7. Reuse the created media `_id` in the original request.

## Read endpoints

- List all media: `GET /api/media/all`
- List media by type: `GET /api/media/all/:type`
- Get media group: `GET /api/media/group/:groupId`
- Read game-ready media data: `GET /api/game/media/:mediaId`

`GET /api/game/media/:mediaId` returns the media data shape intended for the RPGJS runtime. Use it when the game needs to inspect a Studio media record and consume the fields available in-game. Prefer this endpoint over admin media endpoints from runtime code.

## Write and generation endpoints

- Update media metadata: `PUT /api/media/:id`
- Replace media file: `POST /api/media/replace/:id`
- Estimate or execute generation: `POST /api/media/generate`

## Generation inputs

Common payload confirmed in server code:

- `POST /api/media/generate`: `{ "action": "estimate" | "execute", "type": string, "userPrompt": string, "metadata"?: { "source"?: string, "referenceImage"?: string, ... } }`
- `GET /api/media/generate/:instanceId`: returns the workflow status and, once complete, the generated `media` record. The public API does not expose internal workflow `steps`.

 Generated animations use a 4x4 spritesheet workflow and should include `frameWidth: 4` and `frameHeight: 4` for frame-by-frame previews. Character-editor animations should generate `type: "spritesheet"`, pass the complete base image as execution-only `metadata.referenceImage`, and pass the character media id as `metadata.groupId`; the persisted `groupId` makes the generated spritesheet appear in `GET /api/media/group/:groupId`. Generated tilesets may include `metadata.elements`, a JSON string of packed rectangles produced by the image-processing container.

Workflow to follow:

1. Call `POST /api/media/generate` with `action: "estimate"`.
2. Report the returned `credits`, `availableCredits`, and `hasEnoughCredits`.
3. Ask the user to confirm the spend.
4. Only after confirmation, call the same endpoint with `action: "execute"`.
5. Poll `GET /api/media/generate/:instanceId` until completion if the task requires the final media record.

Credit costs available in `common/permissions/credit.ts`:

- `icon`: 2
- `soundEffect`: 2
- `backgroundAmbientSound`: 5
- `backgroundMusic`: 10
- `faceset`: 5
- `spritesheet`: 10
- `spritesheetPreview`: 1
- `terrain`: 5
- `tileset`: 15

## Example: list all media

```bash
curl -sS "$BASE_URL/api/media/all" \
  -H "x-api-key:$RPGSTUDIO_API_KEY" \
  -H "Content-Type: application/json"
```

## Example: read game media data

```bash
curl -sS "$BASE_URL/api/game/media/$MEDIA_ID"
```

## Example: generate an icon

```bash
curl -sS -X POST "$BASE_URL/api/media/generate" \
  -H "x-api-key:$RPGSTUDIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "estimate",
    "type": "icon",
    "userPrompt": "Golden potion bottle icon for a 2D RPG inventory",
    "metadata": {
      "source": "rpgjs"
    }
  }'
```

## Example: replace a media file

For file replacement, do not force the JSON content type on the multipart body. Keep the API key header and let `curl` set the form boundary.

```bash
curl -sS -X POST "$BASE_URL/api/media/replace/$MEDIA_ID" \
  -H "x-api-key:$RPGSTUDIO_API_KEY" \
  -F "file=@/absolute/path/to/image.png"
```

## Notes

- Use `GET /api/media/all` or `GET /api/media/all/:type` first when the user knows a file by name but not by ID.
- Prefer `GET /api/media?query=<search>` for name-based lookup when a task needs a specific referenced asset.
- Use `GET /api/game/media/:mediaId` when the caller is game/runtime code and needs the media fields usable in the game.
- For metadata-only updates, use `PUT /api/media/:id` with JSON.
- Media generation is now unified and workflow-based. Always estimate first, ask for confirmation, then execute.
