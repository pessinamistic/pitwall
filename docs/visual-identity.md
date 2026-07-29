# Visual identity — Scuderia image prompt-pack

This is a **spec and prompt-pack**. No image has been generated from it yet, and
nothing in this file should be read as a claim that generation happened — the
Gemini API key was invalid when the pack was written. Every hex value below was
extracted from the SVGs already shipped in `assets/`, not invented — see the
citations in the palette table.

This document is also the **single source of truth for the generator**:
`scripts/generate-assets.mjs` parses the prompt blocks in §3 directly out of
this file. Edit the prompts here, never in the script. See §5 for usage.

## 1. Master style block

### Palette (extracted, with source)

| Swatch | Hex | Where it's already used |
|---|---|---|
| Rosso Corsa (primary red) | `#E2001A` | `logo.svg` divider bar, `banner.svg` gold-divider stripe, every `assets/roles/*.svg` accent bar |
| Red gradient (car body) | `#C10018` → `#E2001A` → `#FF3B1F` | `banner.svg` `#rosso` gradient (F1 car body) |
| Deep red shadow / stroke | `#9E0014` / `#6E0010` | `banner.svg` car-body stroke and wing shadow |
| Red rim light | `#FF6A4A` | `banner.svg` car top rim light |
| Motion-streak red | `#FF2800` → `#FF3B1F` | `banner.svg` `#streak` gradient |
| Champion gold | `#FFE07A` → `#E9A400` | `logo.svg` and `banner.svg` `#gold` gradient (roundel "S", numbering) |
| Amber accent (mono/labels) | `#FFC400` | `banner.svg` mono comment line; every role card's tier label |
| Carbon black (base) | `#0a0b0e`, `#0d0d0f`, `#08090c` | `logo.svg` body gradient, `roster.svg` page background |
| Carbon black (panel gradient) | `#16181e` → `#0b0c10` | `roster.svg` card gradient |
| Backdrop gradient (wide scenes) | `#17070b` → `#0b0c10` → `#0a0b0f` | `banner.svg` `#bg` gradient |
| Ambient red glow | `#3a1418` | `banner.svg` `#spot` radial glow |
| Garage-floor gradient | `#1c1f26` → `#0c0d11` | `banner.svg` `#floor` gradient |
| Off-white text | `#ffffff`, `#f2f3f0` | `banner.svg` wordmark / subhead |
| Muted grey body copy | `#aab0b8` | every `assets/roles/*.svg` description line |
| Metal / wheel greys | `#141619`, `#40434b`, `#26292f`, `#5a5d64` | `banner.svg` wheel rims |
| Panel stroke | `#2a2d33` | `roster.svg` card border |
| Checkerboard flag | `#0a0b0e` / `#ffffff` | `logo.svg`, `banner.svg`, `divider.svg` `#chk` pattern |
| Italian-tricolor accent (sparing use only) | `#00913A` green, `#F2F3F0` white, `#CD2130` red | `banner.svg` wordmark underline blocks |

The tricolor triad is a one-line accent in the existing wordmark, not a
scene color — it does **not** appear in the image prompts below; the image
system runs on carbon-black + Rosso Corsa + champion gold only, to stay
legible against the existing red/gold brand.

### Art direction: cinematic editorial motorsport photography

One coherent direction, chosen instead of a generic "AI portrait" or
"digital illustration" look, for three concrete reasons:

1. **The vector/flat-badge style is already spoken for.** `logo.svg`,
   `banner.svg`, and `roster.svg` own the flat-gradient iconographic look
   (roundel, italic wordmark, checkerboard pattern). A second illustrated
   style for photos would compete with it. A photographic layer is a
   distinct, complementary register — logo mark vs. photographed crew — the
   way a real team runs both a livery and a press photographer.
2. **The palette is a real livery, not a template default.** Near-black +
   a single bright accent is one of the generic AI-design defaults the
   `frontend-design` skill warns about — but here it isn't an arbitrary
   choice, it's Rosso-Corsa-on-carbon-fibre lifted directly from the shipped
   SVGs (table above). Photographic realism is what makes that livery read
   as material (carbon weave, red lacquer, brushed metal) instead of flat
   marketing color.
3. **One lighting recipe threads every asset.** The same three-note rig —
   red key, near-black fill, gold rim — reads on a human face, an empty
   garage, and a parked car alike. Only its *direction* varies by frame
   (see below). That shared recipe is what makes 8 independently generated
   images read as one photographed universe instead of eight unrelated
   renders.

**Lighting:** three-point — a warm Rosso Corsa key from camera-left; a
near-black ambient fill on the shadow side; a thin champion-gold rim tracing
the subject's silhouette. No other sources.

The *direction* of that rig ("from camera-left") lives in the six portrait
prompts, not in the shared suffix. A fixed camera-left key is a portrait
instruction: imposing it on an empty-garage establishing shot or a
deliberately symmetric car shot fights the composition those frames need.
The suffix carries what is genuinely universal — film stock, palette,
checkerboard motif, guardrails — and each wide scene states its own
scene-appropriate version of the same warm-red / near-black / gold triad.

**Mood:** quietly intense, controlled-chaos-under-command, focused
professionals mid-shift, night-race atmosphere — not a smiling stock-photo
crew, not a mascot-style cartoon.

**Framing conventions:**
- Portraits: chest-up, centered, three-quarter turn, subject fills the
  middle ~60% of the square frame, shallow depth of field. The one
  exception is `boilerplate`, framed waist-up because its defining prop —
  a tyre held at the hip — does not fit inside a chest-up crop. Stating a
  crop that cannot contain the prop it also asks for is the kind of
  contradiction that makes a model pick one and drop the other.
- Hero (wide scene): rule-of-thirds establishing shot, empty upper-left
  third left uncluttered.
- Social card: same wide-scene vocabulary as the hero, but the key subject
  is held inside the vertical middle band (see §3 note) to survive a 2:1
  crop.

**The signature element** (the one thing this whole set is remembered by):
a small black-and-white **checkerboard-flag** motif visible somewhere in
every frame — a floor marking, a blurred banner edge, a garage sign — as an
abstract graphic pattern, never legible text. It's the one recurring visual
rhyme back to `logo.svg` / `banner.svg` / `divider.svg`, so a viewer who's
seen the repo's existing marks recognizes the photo set as the same brand.

### Reusable style suffix

Append this block, **verbatim, character-for-character**, to the end of
every prompt in §3. Do not paraphrase it prompt-to-prompt — identical text
is what keeps the 8 outputs looking like one set.
`scripts/generate-assets.mjs --check` enforces this mechanically.

```
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### Why this suffix is shorter than the prompts it replaced

The first draft of this pack ran a ~1,100-character suffix — more than half
of every prompt. It was rewritten for four concrete reasons, each of which
is a claim you can check against the outputs:

1. **Hex codes were dropped from the prompts.** An image model does not
   parse `#E2001A`; it steers on color *language*. The hex triplets were
   tokens spent on precision the model cannot act on. They remain in the
   §1 palette table, which is where they do real work — as the source of
   truth for the SVGs and for any human matching a color by hand.
2. **Negations became positive statements.** "no readable text, no
   wordmarks" is a well-known way to *summon* text in an image model.
   "Surfaces are clean and unlettered" asks for the same outcome in the
   affirmative. The one guardrail kept in negative-adjacent form is the
   likeness/branding clause, because the cost of it failing is legal, not
   aesthetic, and it is worth the tokens.
3. **The duplicated header went away.** Every prompt opened with
   "Cinematic editorial motorsport photography" and the suffix then
   repeated it. Said once, at the top of the suffix, it costs a quarter as
   much and reads no differently to the model.
4. **Two contradictions were resolved.** The old suffix asserted
   "night-race atmosphere" while the hero prompt asked for "dusk,
   golden-hour daylight" — the model had to pick one. And a mandated
   camera-left key light is meaningless for a symmetric head-on car shot.
   Blue hour now covers the whole set, and lighting direction moved into
   the prompts that actually need it.

## 2. Consistency rules

1. **Identical suffix, every time.** All 8 prompts end with the exact style
   suffix block above, unedited. This is the single biggest lever for a
   coherent set — it fixes lens, lighting recipe, grain, and the "no real
   people/logos" guardrail everywhere at once.
2. **One lighting recipe, no exceptions.** Red key / carbon-black fill /
   gold rim is the only lighting setup used, whether the subject is a face,
   an empty garage, or a parked car.
3. **Locked palette.** Every prompt draws only from the hex table in §1. No
   role gets a new accent color — if a role needs to read as distinct, it's
   distinct in *prop and setting*, never in palette.
4. **Shared framing grammar for portraits.** All 6 portraits use the same
   chest-up / centered / three-quarter-turn / 1:1 composition and the same
   base garment family (Rosso Corsa red team kit with gold trim) so they
   read as one card system, matching the existing `assets/roles/*.svg`
   card set they'll sit next to.
5. **One flagged, deliberate exception:** the FIA Scrutineer (`code-reviewer`)
   wears a neutral charcoal blazer instead of team red, because the role is
   an independent auditor, not team crew — this is real-world accurate (FIA
   scrutineers are not liveried in team colors) and mirrors how
   `code-reviewer` is the one role denied edit access in the permission
   config. The red/gold accent trim is kept on that garment so the palette
   rule (#3) still holds; only the base garment color differs, and only
   for this one role.
6. **Role differentiation = prop + setting only.** Each portrait's F1
   persona and engineering function are conveyed through what the subject
   is holding/doing and where they're standing, not through a new visual
   language per role.
7. **Hero and social card share the portraits' environment vocabulary**
   (checkerboard floor motif, red-car silhouette, pit-wall monitor glow),
   so the wide shots and the close-ups feel like the same physical garage.

## 3. Prompt-pack

8 asset prompts total: 6 role portraits + 1 hero banner + 1 social card.

### Role portraits (aspectRatio: `1:1`)

#### `tech-lead` — Race Engineer

- **outputPath:** `assets/generated/roles/tech-lead.png`
- **aspectRatio:** `1:1`
- **prompt:**
```
Portrait of a composed Formula 1 race engineer in their mid-forties, seen chest-up in three-quarter turn, filling the middle sixty percent of a square frame. They wear a fitted Rosso Corsa red softshell with gold piping and a plain circular roundel patch at the chest; a slim radio headset rests around the neck. The gaze is level and direct — the expression of someone announcing a decision already made. Behind them a bank of pit-wall monitors falls away into soft focus, the screens abstract sweeps of red and gold light. Setting: a pit wall at blue hour, distant garage lamps blooming behind. Lighting: a warm red key from camera-left, near-black ambient fill on the shadow side, a thin gold rim tracing the silhouette. 50mm lens, f/2.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### `senior-dev` — Technical Director

- **outputPath:** `assets/generated/roles/senior-dev.png`
- **aspectRatio:** `1:1`
- **prompt:**
```
Portrait of a senior Formula 1 technical director, chest-up in three-quarter turn, filling the middle sixty percent of a square frame. Sleeves rolled over a dark waistcoat worn atop a Rosso Corsa red team polo with gold trim. They look down in concentration at an illuminated drafting table, one hand flat on its edge; the lightbox throws a cool upward glow across the face and holds an abstract wing cross-section in pure linework. Setting: the back office of a pit garage late at night, carbon-fibre offcuts and rolled drawings blurred behind. Lighting: a warm red key from camera-left, near-black ambient fill, a thin gold rim along the shoulders. 50mm lens, f/2.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### `implementer` — Race Mechanic

- **outputPath:** `assets/generated/roles/implementer.png`
- **aspectRatio:** `1:1`
- **prompt:**
```
Portrait of a Formula 1 race mechanic kneeling beside a front wheel assembly, torso and face angled up toward the camera with the coiled energy of someone mid-stop. Rosso Corsa red pit-crew overalls with gold sleeve stripes, safety glasses pushed up on the forehead, both hands on a cordless wheel gun. The wheel sits low in frame as a softly lit foreground mass; the face is the plane of focus. Square frame, subject filling the middle sixty percent. Setting: a garage floor under overhead work lights, tyre stack and tool trolley dissolving behind. Lighting: a warm red key from camera-left, near-black ambient fill, a thin gold rim along the shoulder and jaw. 50mm lens, f/2.8.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### `boilerplate` — Tyre Technician

- **outputPath:** `assets/generated/roles/boilerplate.png`
- **aspectRatio:** `1:1`
- **prompt:**
```
Portrait of a Formula 1 tyre technician, waist-up in a slight three-quarter turn, filling the middle sixty percent of a square frame. Rosso Corsa red team kit with gold accents; a fresh slick tyre balanced against one hip, a pressure gauge pressed to its valve. The expression is brisk and unhesitating — the half-smile of routine competence. Setting: a wall of stacked tyres in soft focus, tyre-warmer blankets glowing faint amber at the edges of frame. Lighting: a warm red key from camera-left, near-black ambient fill, a thin gold rim along the arm and shoulder. 50mm lens, f/2.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### `code-reviewer` — FIA Scrutineer

- **outputPath:** `assets/generated/roles/code-reviewer.png`
- **aspectRatio:** `1:1`
- **prompt:**
```
Portrait of a scrutineering official, deliberately apart from the team: a neutral charcoal blazer carrying only thin red and gold trim piping, no team colours anywhere on the garment. Chest-up, arms loosely folded, one eyebrow fractionally raised, looking straight down the lens as though inspecting the viewer. Square frame, subject filling the middle sixty percent. Setting: a parc fermé holding area at night, a car silhouette under floodlight dissolving behind. Lighting: a warm red key from camera-left, near-black ambient fill, a thin gold rim tracing the silhouette. 50mm lens, f/2.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### `debugger` — Telemetry Engineer

- **outputPath:** `assets/generated/roles/debugger.png`
- **aspectRatio:** `1:1`
- **prompt:**
```
Portrait of a telemetry engineer seated at a bank of curved monitors, chest-up, leaning slightly in, one hand resting on a keyboard. Rosso Corsa red crew jacket, headset with a boom microphone. Abstract waveform traces on the screens throw faint moving light across the face. Square frame, subject filling the middle sixty percent. Setting: a dim telemetry room during a night race, cool screen glow meeting warm red light. Lighting: a warm red key from camera-left, near-black ambient fill, a thin gold rim along the jaw and headset. 50mm lens, f/2.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

### Wide scenes (aspectRatio: `16:9`)

#### `hero` — README hero banner

- **outputPath:** `assets/generated/hero.png`
- **aspectRatio:** `16:9`
- **note:** does **not** overwrite the existing `assets/banner.png` /
  `assets/banner.svg` — the vector banner stays the primary README mark; the
  hero is the photographic companion.
- **prompt:**
```
Wide establishing shot of an empty Scuderia pit garage at blue hour — the space itself is the subject, with no people, or at most small unrecognisable silhouettes far back and out of focus. A black-and-white checkerboard floor marking runs out of the foreground and leads the eye toward a Rosso Corsa red racing car standing mid-garage under a single overhead spotlight. Pit-wall monitor stacks glow faintly in the middle distance. The upper-left third of the frame is left deliberately open and low in contrast to carry a title overlay. Lighting: warm red work lights raking across the floor, deep near-black shadow filling the volume of the room, a gold spill along the car's upper edges. 35mm lens, f/4. Still, held, charged — the hour before a race.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

#### `social-card` — GitHub social/OG card

- **outputPath:** `assets/generated/social-card.png`
- **aspectRatio:** `16:9`
- **note on cropping:** GitHub renders social previews at roughly 2:1, which
  crops a 16:9 image down from a height ratio of 0.5625 to 0.5 — about 11%
  of total height, split top and bottom, i.e. roughly the top 5–6% and the
  bottom 5–6% get trimmed. Keep the key subject and any future title-safe
  area within the **vertical middle 85–90%** of the frame, horizontally
  centered with generous side margins, so the 2:1 crop never clips it.
- **prompt:**
```
Wide symmetric hero shot: the nose and front wing of a Rosso Corsa red racing car parked dead-centre in a pit garage, flanked by soft-focus monitor stacks on either side. The car is held within the vertical middle eighty-five percent of the frame with generous near-black space to left and right; a black-and-white checkerboard floor marking runs symmetrically inward from both edges. Nothing of importance sits in the outer top or bottom six percent, so the composition survives a tight 2:1 crop. Lighting: warm red work light glancing off lacquered bodywork, near-black shadow between the panels, a gold rim along the wing's leading edge. 35mm lens, f/4. A held breath on the grid.
Style: cinematic editorial motorsport photography on 35mm film — fine grain, high dynamic range, physically-based materials, photorealistic. Palette strictly limited to three notes: deep Rosso Corsa red, carbon-fibre near-black, and warm champion gold; no other hues. A black-and-white checkerboard pattern sits somewhere in frame as an abstract graphic accent — floor marking, blurred banner edge, or painted panel. Surfaces are clean and unlettered; garments and equipment plain and unbranded. Any person shown is an original fictional character, not a real or recognisable individual.
```

## 4. Attribution note (for the README)

Once generated, add a short line near the images, e.g. directly under the
hero banner or in an "Images" note at the bottom of the README:

> Role portraits, hero banner, and social card are AI-generated (Google
> Gemini) from the prompt-pack in [docs/visual-identity.md](docs/visual-identity.md)
> and depict fictional crew members only — not real people or teams.

## 5. Generating the assets

`scripts/generate-assets.mjs` reads §3 of this file and generates every
asset. Zero npm dependencies, Node >= 20 — same discipline as the `sync-*`
scripts.

### The contract this file must satisfy

The parser is deliberately strict so a malformed edit fails loudly instead
of silently generating the wrong image. Each asset in §3 is an `####`
heading followed by, in any order:

- a `- **outputPath:** \`<path>\`` line — path relative to the repo root
- a `- **aspectRatio:** \`<ratio>\`` line — one of `1:1`, `16:9`, `4:3`, `3:4`, `9:16`
- a `- **prompt:**` line immediately followed by a fenced ``` block

The fenced block's **last line must be the style suffix from §1, verbatim**.
The script asserts this on every asset and refuses to run if any prompt has
drifted — that check is the mechanical enforcement of consistency rule #1,
which is otherwise only a promise in prose.

### Usage

```bash
# Parse and validate the prompt-pack without calling the API or writing
# files. Run this after any edit to §3. Also the CI-safe mode.
node scripts/generate-assets.mjs --dry-run

# Same parse + suffix-drift assertions, exits nonzero on any problem.
node scripts/generate-assets.mjs --check

# Generate everything (needs GEMINI_API_KEY). Skips assets whose output
# file already exists.
export GEMINI_API_KEY=AQ....
node scripts/generate-assets.mjs

# Regenerate one asset, overwriting it.
node scripts/generate-assets.mjs --only tech-lead --force

# Higher-quality model for final production assets.
node scripts/generate-assets.mjs --model gemini-3-pro-image --image-size 4K

# List what would be generated, with output paths.
node scripts/generate-assets.mjs --list
```

### API keys and endpoints

Current AI Studio keys are **auth keys** beginning `AQ.` — bound to a service
account and restricted to the Generative Language API by default. The older
`AIza…` standard keys still work if explicitly restricted, but the Gemini API
rejects them outright from September 2026. An `AQ.` key is the expected shape,
not a sign of something being wrong.

Two documented APIs reach the same image models, selectable with `--api`:

| `--api` | Endpoint | Notes |
|---|---|---|
| `generateContent` (default) | `/v1/models/<model>:generateContent` | What AI Studio's quickstart hands out; confirmed to accept `AQ.` keys |
| `interactions` | `/v1/interactions` | Google's newer API, recommended going forward. Migration path |

Two details that are easy to get wrong on `generateContent`, both of which
this script gets right and both of which fail confusingly if you hand-roll
the call:

- `responseModalities` must be `["TEXT", "IMAGE"]`. An `IMAGE`-only list is
  rejected. The model emits a short narration part alongside the image part;
  the extractor ignores it.
- The size/ratio block is `generationConfig.responseFormat.image`, *not*
  `generationConfig.imageConfig`.

If a call 404s, the endpoint version is the first thing to try —
`GEMINI_API_BASE=https://generativelanguage.googleapis.com/v1beta` switches
it in one variable.

### Enum values, not ratio strings

The published REST example shows `"aspectRatio": "16:9"` and
`"imageSize": "2K"`. **The API rejects both** with `INVALID_ARGUMENT`. These
fields are protobuf enums and need their enum names:

| Pack writes | Wire value |
|---|---|
| `1:1` | `ASPECT_RATIO_ONE_BY_ONE` |
| `16:9` | `ASPECT_RATIO_SIXTEEN_BY_NINE` |
| `2K` | `IMAGE_SIZE_TWO_K` |

The pack keeps human-readable ratios; the script translates at the boundary.
The authoritative list — used to build that mapping, and worth re-reading if
Google adds ratios — comes from the live discovery document:

```bash
curl 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1' \
  | python3 -c "import json,sys; p=json.load(sys.stdin)['schemas']['ImageResponseFormat']['properties']; print(p['aspectRatio']['enum']); print(p['imageSize']['enum'])"
```

### Image generation requires billing

A free-tier key returns `429 RESOURCE_EXHAUSTED` with `limit: 0` for every
image model, while generating text on the same key succeeds. `limit: 0` means
no free allowance exists — waiting will not help. Enable billing on the key's
Cloud project, or use [manual-image-generation.md](manual-image-generation.md).

`--only` matches on the asset's slug, which is derived from its
`outputPath` basename: `tech-lead`, `senior-dev`, `implementer`,
`boilerplate`, `code-reviewer`, `debugger`, `hero`, `social-card`.

### Why generation is not in CI

The drift-gate job runs `--check` (parse + suffix assertions only, no
network). Actual generation is manual and deliberate: it costs money, is
non-deterministic, and the outputs are committed binaries that should be
reviewed by a human before landing. CI verifies the *pack* is well-formed;
a person decides when to spend tokens on it.
