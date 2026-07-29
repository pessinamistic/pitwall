#!/usr/bin/env node
// Generates the photographic asset set (6 role portraits + hero banner +
// social card) from the prompt-pack in docs/visual-identity.md. Zero npm
// dependencies (Node >= 20) — same single-source model as the sync-*
// scripts: the doc is the source, this script is only the mechanism.
//
// Usage:
//   node scripts/generate-assets.mjs [--dry-run|--check|--list]
//                                    [--only <slug>] [--force]
//                                    [--model <id>] [--out-dir <dir>]
//
//   --dry-run  Parse and validate the pack, print what would be generated,
//              call nothing, write nothing.
//   --check    Same parse + assertions as --dry-run, no output on success,
//              nonzero exit on any problem. CI mode (see docs §5).
//   --list     Print slug -> outputPath for every asset and exit.
//   --only     Generate a single asset by slug (basename of its outputPath).
//   --model    Image model id. Default gemini-3.1-flash-image; use
//              gemini-3-pro-image for final production assets.
//   --image-size  1K | 2K | 4K (flash also supports 0.5K). Default 2K.
//   --api      generateContent (default) | interactions. generateContent is
//              what AI Studio's quickstart uses and is confirmed to accept
//              AQ.* auth keys; interactions is Google's newer API, kept as a
//              migration path.
//   --force    Overwrite outputs that already exist. Without it, existing
//              files are skipped so a partial run is cheap to resume.
//
// Requires GEMINI_API_KEY in the environment for real generation. Neither
// --dry-run, --check, nor --list touch the network, so CI never needs a key.
//
// WHY THE PARSER IS STRICT: consistency rule #1 in docs/visual-identity.md
// says all 8 prompts must end with the §1 style suffix character-for-
// character — that is what makes 8 independent generations read as one
// photographed set. Prose can't enforce that. assertSuffix() does: any
// prompt whose final line has drifted from the canonical suffix fails the
// run before a single token is spent.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PACK_PATH = path.join(REPO_ROOT, 'docs', 'visual-identity.md');

// Gemini 3.1 Flash Image ("Nano Banana"): the speed/volume image model. For
// final production assets `gemini-3-pro-image` is the higher-quality option —
// pass it with --model. Both speak the Interactions API below.
const DEFAULT_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_IMAGE_SIZE = '2K';

// GEMINI_API_BASE exists so the request/response path can be exercised
// against a local mock without spending quota or needing a real key. It is a
// test seam, not a supported way to point this at a third-party endpoint.
// The image-generation REST example documents /v1 for generateContent, while
// AI Studio's text quickstart uses /v1beta. Both appear to serve these models.
// Default to /v1; override in one env var if a call 404s.
const API_BASE = process.env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com/v1';

// The API takes protobuf ENUM NAMES here, not the human ratio strings — the
// published REST example showing "aspectRatio": "16:9" is rejected outright
// with an INVALID_ARGUMENT. These maps were read from the live discovery
// document, which is authoritative:
//   curl 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1'
// The pack keeps writing human-readable ratios; we translate at the boundary.
const ASPECT_RATIO_ENUM = {
  '1:1': 'ASPECT_RATIO_ONE_BY_ONE',
  '2:3': 'ASPECT_RATIO_TWO_BY_THREE',
  '3:2': 'ASPECT_RATIO_THREE_BY_TWO',
  '3:4': 'ASPECT_RATIO_THREE_BY_FOUR',
  '4:3': 'ASPECT_RATIO_FOUR_BY_THREE',
  '4:5': 'ASPECT_RATIO_FOUR_BY_FIVE',
  '5:4': 'ASPECT_RATIO_FIVE_BY_FOUR',
  '9:16': 'ASPECT_RATIO_NINE_BY_SIXTEEN',
  '16:9': 'ASPECT_RATIO_SIXTEEN_BY_NINE',
  '21:9': 'ASPECT_RATIO_TWENTY_ONE_BY_NINE',
  '1:8': 'ASPECT_RATIO_ONE_BY_EIGHT',
  '8:1': 'ASPECT_RATIO_EIGHT_BY_ONE',
  '1:4': 'ASPECT_RATIO_ONE_BY_FOUR',
  '4:1': 'ASPECT_RATIO_FOUR_BY_ONE',
};

const IMAGE_SIZE_ENUM = {
  '512': 'IMAGE_SIZE_FIVE_TWELVE',
  '0.5K': 'IMAGE_SIZE_FIVE_TWELVE',
  '1K': 'IMAGE_SIZE_ONE_K',
  '2K': 'IMAGE_SIZE_TWO_K',
  '4K': 'IMAGE_SIZE_FOUR_K',
};

// Mirrors the ratios the prompt-pack is allowed to request. Anything else is
// a typo, not a new format — fail rather than silently pass it upstream.
const VALID_ASPECT_RATIOS = Object.keys(ASPECT_RATIO_ENUM);

/** Diagnostics stream. Keeps stdout reserved for --list / --dry-run reports. */
const log = (msg) => process.stderr.write(`${msg}\n`);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Extracts the canonical style suffix from the §1 "Reusable style suffix"
 * fenced block. This is the ONE definition; every prompt is checked against
 * it. Returns the trimmed single-line suffix.
 */
export function parseStyleSuffix(markdown) {
  const heading = markdown.indexOf('### Reusable style suffix');
  if (heading === -1) {
    throw new Error(
      'docs/visual-identity.md: could not find the "### Reusable style suffix" ' +
        'heading — the style-suffix contract (§1) is missing.'
    );
  }
  const fenceOpen = markdown.indexOf('```', heading);
  if (fenceOpen === -1) {
    throw new Error(
      'docs/visual-identity.md: "### Reusable style suffix" has no fenced code block after it.'
    );
  }
  const bodyStart = markdown.indexOf('\n', fenceOpen) + 1;
  const fenceClose = markdown.indexOf('```', bodyStart);
  if (fenceClose === -1) {
    throw new Error(
      'docs/visual-identity.md: the style-suffix code block is never closed.'
    );
  }
  const suffix = markdown.slice(bodyStart, fenceClose).trim();
  if (!suffix) {
    throw new Error('docs/visual-identity.md: the style-suffix code block is empty.');
  }
  return suffix;
}

/**
 * Parses every asset entry out of §3. An asset is an #### heading followed
 * by an outputPath line, an aspectRatio line, and a `- **prompt:**` line
 * whose next fenced block is the prompt body.
 *
 * Returns [{ slug, title, outputPath, aspectRatio, prompt }].
 */
export function parseAssets(markdown) {
  const packStart = markdown.indexOf('## 3. Prompt-pack');
  if (packStart === -1) {
    throw new Error(
      'docs/visual-identity.md: could not find the "## 3. Prompt-pack" section.'
    );
  }
  // §3 ends at the next H2 (## 4. ...). Slicing first means an #### heading
  // elsewhere in the doc can never be mistaken for an asset.
  const nextH2 = markdown.indexOf('\n## ', packStart + 1);
  const section = nextH2 === -1 ? markdown.slice(packStart) : markdown.slice(packStart, nextH2);

  const assets = [];
  // Split on #### headings, keeping the heading text with its block.
  const blocks = section.split(/\n#### /).slice(1);

  for (const block of blocks) {
    const title = block.slice(0, block.indexOf('\n')).trim();

    const outMatch = block.match(/- \*\*outputPath:\*\*\s*`([^`]+)`/);
    if (!outMatch) {
      throw new Error(
        `docs/visual-identity.md: asset "${title}" has no ` +
          '`- **outputPath:** `<path>`` line.'
      );
    }
    const outputPath = outMatch[1].trim();

    const ratioMatch = block.match(/- \*\*aspectRatio:\*\*\s*`([^`]+)`/);
    if (!ratioMatch) {
      throw new Error(
        `docs/visual-identity.md: asset "${title}" has no ` +
          '`- **aspectRatio:** `<ratio>`` line.'
      );
    }
    const aspectRatio = ratioMatch[1].trim();
    if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      throw new Error(
        `docs/visual-identity.md: asset "${title}" declares aspectRatio ` +
          `"${aspectRatio}", which is not one of ${VALID_ASPECT_RATIOS.join(', ')}.`
      );
    }

    const promptMarker = block.indexOf('- **prompt:**');
    if (promptMarker === -1) {
      throw new Error(
        `docs/visual-identity.md: asset "${title}" has no \`- **prompt:**\` line.`
      );
    }
    const fenceOpen = block.indexOf('```', promptMarker);
    if (fenceOpen === -1) {
      throw new Error(
        `docs/visual-identity.md: asset "${title}" has a **prompt:** line but no ` +
          'fenced code block after it.'
      );
    }
    const bodyStart = block.indexOf('\n', fenceOpen) + 1;
    const fenceClose = block.indexOf('```', bodyStart);
    if (fenceClose === -1) {
      throw new Error(
        `docs/visual-identity.md: asset "${title}" has an unclosed prompt code block.`
      );
    }
    const prompt = block.slice(bodyStart, fenceClose).trim();
    if (!prompt) {
      throw new Error(`docs/visual-identity.md: asset "${title}" has an empty prompt.`);
    }

    assets.push({
      slug: path.basename(outputPath, path.extname(outputPath)),
      title,
      outputPath,
      aspectRatio,
      prompt,
    });
  }

  if (assets.length === 0) {
    throw new Error(
      'docs/visual-identity.md: §3 parsed to zero assets — check the #### heading format.'
    );
  }
  return assets;
}

/**
 * Enforces consistency rule #1: every prompt ends with the §1 style suffix,
 * verbatim. Throws listing every offender rather than the first, so one run
 * tells you everything that drifted.
 */
export function assertSuffix(assets, styleSuffix) {
  const offenders = [];
  for (const asset of assets) {
    if (!asset.prompt.endsWith(styleSuffix)) {
      const lastLine = asset.prompt.split('\n').pop().trim();
      offenders.push({ slug: asset.slug, lastLine });
    }
  }
  if (offenders.length) {
    const detail = offenders
      .map(
        (o) =>
          `  - ${o.slug}: last line does not match the §1 suffix.\n` +
          `      got ...${o.lastLine.slice(-80)}`
      )
      .join('\n');
    throw new Error(
      `generate-assets.mjs: ${offenders.length} prompt(s) have drifted from the ` +
        'canonical style suffix in docs/visual-identity.md §1. Consistency rule #1 ' +
        'requires the suffix be appended verbatim, character-for-character:\n' +
        detail
    );
  }
}

/** Duplicate slugs would make --only ambiguous and silently overwrite output. */
export function assertUniqueSlugs(assets) {
  const seen = new Map();
  for (const a of assets) {
    if (seen.has(a.slug)) {
      throw new Error(
        `generate-assets.mjs: duplicate slug "${a.slug}" — "${seen.get(a.slug)}" and ` +
          `"${a.title}" both resolve to the same output basename.`
      );
    }
    seen.set(a.slug, a.title);
  }
}

/** Reads, parses and fully validates the pack. The one entry point. */
export function loadPack(packPath = PACK_PATH) {
  if (!fs.existsSync(packPath)) {
    throw new Error(`generate-assets.mjs: prompt-pack not found at ${packPath}`);
  }
  const markdown = fs.readFileSync(packPath, 'utf8');
  const styleSuffix = parseStyleSuffix(markdown);
  const assets = parseAssets(markdown);
  assertUniqueSlugs(assets);
  assertSuffix(assets, styleSuffix);
  return { assets, styleSuffix };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Calls the Gemini image API for one asset and returns the decoded PNG bytes.
 * Kept deliberately small: one request, no retry-on-content-failure. A
 * refusal or an empty candidate is surfaced as an error rather than retried,
 * because silently re-rolling a prompt that tripped a safety filter just
 * burns quota.
 */
/**
 * Walks an arbitrary JSON tree and returns the first plausible base64 image
 * payload it finds.
 *
 * WHY NOT A FIXED PATH: this script was written without the ability to make a
 * live call (the authoring sandbox had no egress to Google), so the exact
 * nesting of the Interactions response is taken from documentation rather
 * than from an observed payload. The SDKs expose a convenience accessor
 * (`interaction.output_image.data`) that hides the raw shape. Hard-coding a
 * guessed path would fail with "no image" on a response that plainly
 * contains one; searching for the payload succeeds across any of the
 * plausible shapes, and dumpShape() below makes a genuine miss diagnosable
 * in one run instead of several.
 */
function findImageData(node, depth = 0) {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findImageData(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  // Common spellings across REST/SDK variants, in rough order of likelihood.
  for (const key of ['data', 'b64_json', 'bytesBase64Encoded', 'imageBytes']) {
    const v = node[key];
    // Guard on length: base64 for a real image is large. This rejects short
    // incidental strings that happen to sit under a "data" key.
    if (typeof v === 'string' && v.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 256))) {
      return v;
    }
  }
  for (const v of Object.values(node)) {
    const hit = findImageData(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Compact structural summary of a response, for when no image was found. */
function dumpShape(node, depth = 0) {
  if (node === null || depth > 3) return typeof node;
  if (Array.isArray(node)) return node.length ? [dumpShape(node[0], depth + 1)] : [];
  if (typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node)
        .slice(0, 12)
        .map(([k, v]) => [
          k,
          typeof v === 'string' && v.length > 64 ? `<string:${v.length}>` : dumpShape(v, depth + 1),
        ])
    );
  }
  return typeof node;
}

/**
 * Calls the Interactions API for one asset and returns decoded image bytes.
 * One request, no retry-on-content-failure: a refusal or empty result is
 * surfaced rather than re-rolled, because silently retrying a prompt that
 * tripped a safety filter just burns quota.
 */
async function generateOne(asset, { apiKey, model, imageSize, api }) {
  // Two documented APIs reach the same image models:
  //
  //   generateContent — what AI Studio's own quickstart hands out, and what
  //     the image-generation REST example uses. Confirmed working with an
  //     AQ.* auth key. This is the default.
  //   interactions    — the newer API Google recommends going forward. Kept
  //     behind --api interactions so this script has a migration path when
  //     generateContent is eventually retired.
  //
  // Neither has been exercised against the live service from this repo; the
  // shapes below come from documentation. See the header note.
  const isInteractions = api === 'interactions';
  const url = isInteractions
    ? `${API_BASE}/interactions`
    : `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`;

  const body = isInteractions
    ? {
        model,
        input: asset.prompt,
        response_format: {
          type: 'image',
          mime_type: 'image/png',
          aspect_ratio: asset.aspectRatio,
          image_size: imageSize,
        },
      }
    : {
        contents: [{ role: 'user', parts: [{ text: asset.prompt }] }],
        generationConfig: {
          // Must be ["TEXT","IMAGE"] — an IMAGE-only modality list is
          // rejected. The model narrates alongside the image; the text part
          // is simply ignored when extracting bytes.
          responseModalities: ['TEXT', 'IMAGE'],
          responseFormat: {
            image: {
              aspectRatio: ASPECT_RATIO_ENUM[asset.aspectRatio],
              imageSize: IMAGE_SIZE_ENUM[imageSize],
            },
          },
        },
      };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    // Name the failures whose cause is not obvious from the status line.
    let hint = '';
    if (body.includes('API_KEY_INVALID')) {
      hint =
        '\n  hint: the key was rejected. Auth keys (AQ.…) must belong to a project with the\n' +
        '        Generative Language API enabled. Confirm at https://aistudio.google.com/api-keys';
    } else if (res.status === 403) {
      hint =
        '\n  hint: 403 usually means the key is valid but lacks access to this model —\n' +
        '        check the key is not restricted away from the Generative Language API.';
    } else if (res.status === 429 && /limit: 0/.test(body)) {
      // "limit: 0" is categorically different from ordinary rate limiting:
      // it means this key has NO free-tier allowance for image generation at
      // all, so waiting and retrying will never succeed. Verified against the
      // live API — every image model returns this on a free-tier key, while
      // text models on the same key work fine.
      hint =
        '\n  hint: limit: 0 means no free-tier quota for image generation — not a rate\n' +
        '        limit you can wait out. Image models are billing-only. Enable billing on\n' +
        '        the key\'s Cloud project, or generate by hand in AI Studio\n' +
        '        (see docs/manual-image-generation.md).';
    } else if (res.status === 429) {
      hint = '\n  hint: rate limited. Wait and retry, or use --only to pace the run.';
    } else if (res.status === 400 && /Invalid value at/.test(body)) {
      hint =
        '\n  hint: the API rejected an enum. aspectRatio/imageSize must be protobuf enum\n' +
        '        names (ASPECT_RATIO_ONE_BY_ONE, IMAGE_SIZE_TWO_K), not "1:1"/"2K".\n' +
        "        Re-read them from: curl 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1'";
    } else if (res.status === 404) {
      hint =
        `\n  hint: model "${model}" was not found. List what your key can reach, or try\n` +
        '        --model gemini-3-pro-image.';
    }
    throw new Error(
      `${asset.slug}: API returned ${res.status} ${res.statusText}${hint}\n  ${body.slice(0, 400)}`
    );
  }

  const json = await res.json();
  const data = findImageData(json);
  if (!data) {
    throw new Error(
      `${asset.slug}: the request succeeded but no image was found in the response.\n` +
        `  response shape: ${JSON.stringify(dumpShape(json))}\n` +
        '  If an image is clearly present above, findImageData() needs the new key name.'
    );
  }
  return Buffer.from(data.replace(/\s/g, ''), 'base64');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = {
    dryRun: false,
    check: false,
    list: false,
    force: false,
    only: null,
    model: DEFAULT_MODEL,
    imageSize: DEFAULT_IMAGE_SIZE,
    api: 'generateContent',
    outDir: REPO_ROOT,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--check') opts.check = true;
    else if (arg === '--list') opts.list = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--only') opts.only = argv[++i];
    else if (arg === '--model') opts.model = argv[++i];
    else if (arg === '--image-size') opts.imageSize = argv[++i];
    else if (arg === '--api') opts.api = argv[++i];
    else if (arg === '--out-dir') opts.outDir = path.resolve(argv[++i] ?? '');
    else {
      console.error(`generate-assets.mjs: unknown argument "${arg}".`);
      process.exit(1);
    }
  }
  if (!IMAGE_SIZE_ENUM[opts.imageSize]) {
    console.error(
      `generate-assets.mjs: --image-size must be one of ${Object.keys(IMAGE_SIZE_ENUM).join(', ')}, ` +
        `got "${opts.imageSize}".`
    );
    process.exit(1);
  }
  if (!['generateContent', 'interactions'].includes(opts.api)) {
    console.error(
      `generate-assets.mjs: --api must be "generateContent" or "interactions", got "${opts.api}".`
    );
    process.exit(1);
  }
  if (opts.only !== undefined && opts.only !== null && !opts.only) {
    console.error('generate-assets.mjs: --only requires a slug.');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let pack;
  try {
    pack = loadPack();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  let { assets } = pack;

  if (opts.only) {
    const match = assets.filter((a) => a.slug === opts.only);
    if (match.length === 0) {
      console.error(
        `generate-assets.mjs: --only "${opts.only}" matched no asset. Available slugs: ` +
          assets.map((a) => a.slug).join(', ')
      );
      process.exit(1);
    }
    assets = match;
  }

  if (opts.check) {
    // Parse + assertions already ran in loadPack(). Getting here means clean.
    console.log(
      `generate-assets.mjs --check: prompt-pack valid — ${pack.assets.length} asset(s), ` +
        'all prompts carry the §1 style suffix verbatim.'
    );
    return;
  }

  if (opts.list) {
    for (const a of assets) {
      console.log(`${a.slug.padEnd(14)} ${a.aspectRatio.padEnd(5)} ${a.outputPath}`);
    }
    return;
  }

  if (opts.dryRun) {
    console.log(
      `generate-assets.mjs --dry-run: ${assets.length} asset(s) would be generated ` +
        `with model "${opts.model}". Nothing written, no API calls made.\n`
    );
    for (const a of assets) {
      const abs = path.join(opts.outDir, a.outputPath);
      const exists = fs.existsSync(abs);
      const verdict = exists && !opts.force ? 'SKIP (exists)' : exists ? 'OVERWRITE' : 'create';
      console.log(
        `  ${a.slug.padEnd(14)} ${a.aspectRatio.padEnd(5)} ${verdict.padEnd(14)} ${a.outputPath}\n` +
          `                 prompt: ${a.prompt.length} chars, suffix OK`
      );
    }
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(
      'generate-assets.mjs: GEMINI_API_KEY is not set.\n' +
        '  Real generation needs a key. To validate the pack without one:\n' +
        '    node scripts/generate-assets.mjs --dry-run'
    );
    process.exit(1);
  }

  let written = 0;
  let skipped = 0;
  const failures = [];

  for (const asset of assets) {
    const abs = path.join(opts.outDir, asset.outputPath);
    if (fs.existsSync(abs) && !opts.force) {
      log(`generate-assets.mjs: ${asset.slug}: exists, skipping (--force to overwrite)`);
      skipped++;
      continue;
    }
    // Progress and errors both go to stderr, as complete lines. Two streams
    // (or a half-written line) interleave unpredictably when piped, which
    // put one asset's failure detail in the middle of the next asset's
    // progress line. stdout stays clean for --list/--dry-run report output.
    log(`generate-assets.mjs: ${asset.slug}: requesting (${asset.aspectRatio})...`);
    try {
      const bytes = await generateOne(asset, {
        apiKey,
        model: opts.model,
        imageSize: opts.imageSize,
        api: opts.api,
      });
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
      log(
        `generate-assets.mjs: ${asset.slug}: ok, ${(bytes.length / 1024).toFixed(0)} KB -> ${asset.outputPath}`
      );
      written++;
    } catch (e) {
      log(`generate-assets.mjs: ${asset.slug}: FAILED\n  ${e.message}`);
      failures.push(asset.slug);
    }
  }

  log(`\ngenerate-assets.mjs: ${written} written, ${skipped} skipped, ${failures.length} failed.`);
  if (failures.length) {
    log(
      `generate-assets.mjs: failed asset(s): ${failures.join(', ')}. ` +
        'Re-run with --only <slug> once the cause is addressed.'
    );
    process.exit(1);
  }
  if (written) {
    log(
      'Review the outputs before committing, then add the attribution line from ' +
        'docs/visual-identity.md §4 to the README.'
    );
  }
}

// Gate direct execution so validate.mjs (and tests) can import loadPack /
// assertSuffix without triggering a generation run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
