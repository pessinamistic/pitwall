// Minimal, dependency-free TOML *encoding* helpers for the shapes this repo
// emits (scalar string keys + one multiline string). NOT a TOML parser and
// not a general encoder — arrays, tables, dates, and numbers are out of
// scope on purpose. Anything unrepresentable is a hard error, never a
// silent mangle.

// Encodes a one-line TOML basic string: "..." with backslash escapes.
export function tomlBasicString(value) {
  if (typeof value !== 'string') {
    throw new Error(`tomlBasicString: expected a string, got ${typeof value}`);
  }
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (code < 0x20 || code === 0x7f) {
      throw new Error(
        `tomlBasicString: unrepresentable control character U+${code.toString(16).padStart(4, '0')} — refusing to emit mangled TOML.`
      );
    } else out += ch;
  }
  return out + '"';
}

// Encodes a TOML multiline basic string ("""..."""). Escapes backslashes,
// breaks up any run of three-or-more double quotes (""" would terminate the
// literal), and escapes a trailing quote that would collide with the
// closing delimiter. Only \n and \t are allowed as control characters —
// anything else (including \r: the repo is LF-only) is a hard error.
export function tomlMultilineBasicString(value) {
  if (typeof value !== 'string') {
    throw new Error(`tomlMultilineBasicString: expected a string, got ${typeof value}`);
  }
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if ((code < 0x20 && ch !== '\n' && ch !== '\t') || code === 0x7f) {
      throw new Error(
        `tomlMultilineBasicString: unrepresentable control character U+${code.toString(16).padStart(4, '0')} — refusing to emit mangled TOML.`
      );
    }
  }
  let body = value.replace(/\\/g, '\\\\');
  // Any run of 3+ quotes would close the literal: escape every third quote.
  body = body.replace(/"""/g, '""\\"');
  // A trailing quote would produce 4+ quotes at the delimiter: escape it.
  if (body.endsWith('"')) body = body.slice(0, -1) + '\\"';
  return '"""\n' + body + '"""';
}
