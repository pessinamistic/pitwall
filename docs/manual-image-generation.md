# Manual image generation — the fallback path

The supported path is `scripts/generate-assets.mjs` (see
[docs/visual-identity.md](visual-identity.md) §5). This page is the manual
fallback for when the API path is unavailable, plus the diagnosis of the
failure that made a manual route necessary in the first place.

**The prompts are not reproduced here.** They live in
[docs/visual-identity.md](visual-identity.md) §3 and nowhere else. An
earlier draft of this page pasted all eight inline; two copies of the same
prompt drift the moment one is edited, and the whole point of the pack is
that the eight images share a byte-identical style suffix. Copy each prompt
out of §3 when you need it.

## First: `AQ.` keys are normal

Before debugging anything else, rule this out — it is the cheapest check and
the easiest thing to misdiagnose. Current AI Studio keys begin **`AQ.`**, not
`AIza`. These are *auth keys*, bound to a service account and restricted to
the Generative Language API by default. All new keys are created this way, and
`AIza` standard keys stop working entirely in September 2026.

An `AQ.` key is **not** a broken key, and it is not an OAuth token pasted into
the wrong field. If you find a note anywhere claiming the key "looks wrong
because it doesn't start with `AIza`", that note is out of date.

## The actual blocker: image generation is billing-only

Verified against the live API on 2026-07-28 with a valid `AQ.` auth key:

```
text  model (gemini-flash-latest)  → 200, returns "OK"
image model (every one available)  → 429 RESOURCE_EXHAUSTED
    "Quota exceeded for metric: …generate_content_free_tier_requests, limit: 0"
```

**`limit: 0` is not rate limiting.** It means the free tier grants zero image
requests, so retrying or waiting will never succeed. The same key generates
text without complaint. Every image model on the key behaves identically:
`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-2.5-flash-image`.

To use the API path you must **enable billing** on the key's Google Cloud
project. Until then, the manual AI Studio route below is the only way to
produce these assets — AI Studio's own UI has separate allowances from the
public API.

This supersedes the older `API_KEY_INVALID` theory. That error came from a
different key; the current blocker is quota, not authentication.

## Historical note: the original API_KEY_INVALID failure

- **The Gemini API key wired into the media-pipeline MCP server was
  invalid.** Every `create_asset` call returned
  `HTTP 400 API_KEY_INVALID — "API key not valid. Please pass a valid API
  key."` The key *was* present in the server's environment — the server
  reads `GEMINI_API_KEY` from the Claude Code process env at launch — but
  Google rejected it. Confirmed twice, across a restart.
- **The MCP tool does not read your shell.** The key must be in the Claude
  Code *process* environment, not just `~/.zshrc` or a Bash subshell.
  Setting it in a terminal and calling the tool in the same session will
  not work.
- **A running session never picks up a new key.** The MCP server reads it
  only at launch, so a full restart of Claude Code is required.

### Fixing the API path

1. Create a fresh key at <https://aistudio.google.com/apikey>.
2. Enable the **Generative Language API** on that Google Cloud project —
   a key without it returns the same `API_KEY_INVALID`.
3. Export it as `GEMINI_API_KEY`.
4. Fully restart Claude Code if you are going through the MCP server.

Then verify without spending anything:

```bash
node scripts/generate-assets.mjs --dry-run   # parses the pack, no network
node scripts/generate-assets.mjs             # real run, needs the key
```

`scripts/generate-assets.mjs` reads `GEMINI_API_KEY` from its own process
environment, so a plain `export` in the shell you run it from is enough —
it has none of the MCP server's launch-time coupling.

## Generating by hand in Google AI Studio

1. Open <https://aistudio.google.com/> and pick a Gemini image model.
2. Get the list of what you need to make:
   ```bash
   node scripts/generate-assets.mjs --list
   ```
   That prints `slug`, aspect ratio, and the exact output path for all
   eight assets.
3. For each one: open [docs/visual-identity.md](visual-identity.md) §3,
   find the `####` block for that slug, and copy the fenced prompt
   **verbatim** — including the style suffix on the last line. The suffix
   is what makes the set cohere; dropping it produces an image that will
   not sit next to the others.
4. Set the aspect ratio to the value `--list` reported for that asset.
   Accepted values are `1:1, 2:3, 3:2, 3:4, 4:3, 16:9, 9:16`.
5. Regenerate a few times and keep the best result.
6. Save into the repo at the exact path from `--list`, creating
   `assets/generated/roles/` if needed.

**Do the six portraits in one sitting**, on the same model, so lighting and
grade match across the set. If the UI supports reference images, feed the
first good portrait back as a style reference for the other five — that
does more for consistency than any amount of prompt wording.

When the files are in place, add the attribution line from
[docs/visual-identity.md](visual-identity.md) §4 to the README.
