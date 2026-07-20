// Minimal, dependency-free frontmatter + YAML-subset parser.
//
// Deliberately NOT a general YAML parser. It only supports the shapes
// actually used by agents/*.md and .claude/skills/*/SKILL.md frontmatter:
//   - a top-level block mapping
//   - nested block mappings (arbitrary depth)
//   - bare or double/single-quoted keys and scalar values
//   - ">-" / ">" / "|" / "|-" block scalars (used for `description`)
//   - "#" full-line comments and trailing "# ..." comments on scalar lines
//     (never stripped from inside block-scalar bodies or quoted strings)
//
// Used by both validate.mjs and sync-agents.mjs so the two scripts agree
// on what the frontmatter actually says.

export function splitFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  return {
    frontmatterText: match[1],
    body: raw.slice(match[0].length),
    frontmatterBlockLength: match[0].length,
  };
}

function stripInlineQuotes(s) {
  if (s.length >= 2) {
    if (s[0] === '"' && s[s.length - 1] === '"') {
      return s.slice(1, -1).replace(/\\"/g, '"');
    }
    if (s[0] === "'" && s[s.length - 1] === "'") {
      return s.slice(1, -1).replace(/''/g, "'");
    }
  }
  return s;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return '';
  const unquoted = stripInlineQuotes(s);
  if (unquoted !== s) return unquoted;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function indentOf(line) {
  const m = line.match(/^ */);
  return m[0].length;
}

// Strips a trailing "# ..." comment from a line, respecting quoted
// strings. Never called on block-scalar body lines, where "#" is literal.
function removeLineComment(line) {
  let inQuote = null;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (inQuote) {
      if (inQuote === '"' && c === '\\' && i + 1 < line.length) {
        i += 2;
        continue;
      }
      if (c === inQuote) inQuote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      i++;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
    i++;
  }
  return line;
}

// Splits "key: value" (or "key:" with empty value) out of a line's content
// (the part after leading indentation has already been stripped). Returns
// null if no top-level colon can be found.
function parseKeyValue(content) {
  let key;
  let rest;
  if (content[0] === '"' || content[0] === "'") {
    const quote = content[0];
    let i = 1;
    let raw = '';
    while (i < content.length) {
      if (quote === '"' && content[i] === '\\' && content[i + 1] === '"') {
        raw += '"';
        i += 2;
        continue;
      }
      if (content[i] === quote) break;
      raw += content[i];
      i++;
    }
    key = raw;
    rest = content.slice(i + 1);
  } else {
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) return null;
    key = content.slice(0, colonIdx).trim();
    rest = content.slice(colonIdx);
  }
  const colonPos = rest.indexOf(':');
  if (colonPos === -1) return null;
  return { key, valueRaw: rest.slice(colonPos + 1) };
}

const BLOCK_SCALAR_RE = /^([>|])([+-]?)\d*\s*$/;

// Parses a run of mapping lines starting at `pos` whose keys sit at
// exactly `indent` spaces. Returns [object, nextPos].
function parseMapping(lines, pos, indent) {
  const obj = {};
  while (pos < lines.length) {
    const rawLine = lines[pos];
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) {
      pos++;
      continue;
    }
    const lineIndent = indentOf(rawLine);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new Error(`Unexpected indentation at line ${pos + 1}: "${rawLine}"`);
    }
    const cleaned = removeLineComment(rawLine);
    const content = cleaned.slice(indent);
    const kv = parseKeyValue(content);
    if (!kv) {
      throw new Error(`Could not parse "key: value" at line ${pos + 1}: "${rawLine}"`);
    }
    const { key } = kv;
    const valueTrimmed = kv.valueRaw.trim();
    pos++;

    if (valueTrimmed === '') {
      let childIndent = null;
      let scan = pos;
      while (scan < lines.length) {
        const l = lines[scan];
        if (l.trim() === '' || l.trim().startsWith('#')) {
          scan++;
          continue;
        }
        childIndent = indentOf(l);
        break;
      }
      if (childIndent !== null && childIndent > indent) {
        const [child, next] = parseMapping(lines, pos, childIndent);
        obj[key] = child;
        pos = next;
      } else {
        obj[key] = null;
      }
      continue;
    }

    const blockMatch = valueTrimmed.match(BLOCK_SCALAR_RE);
    if (blockMatch) {
      const style = blockMatch[1]; // '>' folded or '|' literal
      const collected = [];
      let blockIndent = null;
      while (pos < lines.length) {
        const l = lines[pos];
        if (l.trim() === '') {
          collected.push('');
          pos++;
          continue;
        }
        const li = indentOf(l);
        if (li <= indent) break;
        if (blockIndent === null) blockIndent = li;
        collected.push(l.slice(blockIndent));
        pos++;
      }
      while (collected.length && collected[collected.length - 1] === '') {
        collected.pop();
      }
      obj[key] = style === '>' ? collected.join(' ') : collected.join('\n');
      continue;
    }

    obj[key] = parseScalar(valueTrimmed);
  }
  return [obj, pos];
}

export function parseYamlMapping(frontmatterText) {
  const lines = frontmatterText.replace(/\r\n/g, '\n').split('\n');
  const [obj] = parseMapping(lines, 0, 0);
  return obj;
}

// Parses a full markdown file with frontmatter. Returns null if the file
// does not start with a "---" delimiter at byte 0.
export function parseFrontmatterFile(raw) {
  const split = splitFrontmatter(raw);
  if (!split) return null;
  const frontmatter = parseYamlMapping(split.frontmatterText);
  return {
    frontmatter,
    body: split.body,
    frontmatterText: split.frontmatterText,
  };
}
