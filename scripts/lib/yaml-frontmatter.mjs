// Minimal, dependency-free YAML *encoding* helpers for the frontmatter
// shapes agents/*.md actually uses (the mirror image of the decoder in
// scripts/lib/frontmatter.mjs): bare or double-quoted scalar keys, bare or
// double-quoted string values, numbers, booleans, and arbitrarily nested
// block mappings. NOT a general YAML encoder — arrays, multi-line block
// scalars, anchors, and flow collections are all out of scope on purpose;
// scripts/sync-fleet-agents.mjs is the only consumer today. Quoting a key
// or value that didn't strictly need it is always valid YAML (just more
// verbose than necessary) — this module only has to avoid emitting an
// UNQUOTED token that would parse back as something else, never the
// reverse, so every "leave it bare" check below is conservative on purpose.

// A key (or value) is safe to leave bare only if it's a simple
// identifier-ish token: starts with a letter or underscore, then
// letters/digits/underscore/hyphen. Every quoted key actually used in
// agents/*.md today ("*", "npm test*", "git diff*", ...) fails this check
// because of the leading wildcard (YAML's alias sigil) or an embedded
// space — exactly why the source quotes them.
const BARE_TOKEN_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

// Values frontmatter.mjs's own parseScalar() treats as non-string literals
// when unquoted (see its "true"/"false"/"null"/"~" checks) — a bare token
// that happens to equal one of these must stay quoted on the way back out,
// or a round-trip would silently change its type.
const RESERVED_BARE_VALUES = new Set(['true', 'false', 'null', '~']);

export function escapeYamlDoubleQuoted(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function yamlKey(key) {
  const s = String(key);
  if (BARE_TOKEN_RE.test(s)) return s;
  return `"${escapeYamlDoubleQuoted(s)}"`;
}

export function yamlScalar(value) {
  if (typeof value === 'string') {
    if (BARE_TOKEN_RE.test(value) && !RESERVED_BARE_VALUES.has(value)) {
      return value;
    }
    return `"${escapeYamlDoubleQuoted(value)}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) return 'null';
  throw new Error(`yamlScalar: unsupported value type "${typeof value}" (${JSON.stringify(value)})`);
}

// Serializes a plain object as a block mapping, one "key: value" line per
// entry (or "key:" followed by a recursively-indented nested block for an
// object value), at the given indent width in spaces. Preserves
// Object.entries() insertion order — callers rely on that to mirror the
// source frontmatter's own key order exactly.
export function serializeYamlMapping(obj, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${pad}${yamlKey(key)}:`);
      lines.push(...serializeYamlMapping(value, indent + 2));
    } else {
      lines.push(`${pad}${yamlKey(key)}: ${yamlScalar(value)}`);
    }
  }
  return lines;
}
