// Minimal, dependency-free JSONC support: strips "//" and "/* */" comments
// (respecting string literals) and tolerates trailing commas before a
// closing "}" or "]". Not a full JSON5/JSONC implementation — just enough
// for config/opencode.*.jsonc.

export function stripJsonComments(input) {
  let out = '';
  let i = 0;
  const n = input.length;
  let inString = false;
  while (i < n) {
    const c = input[i];
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && input[i + 1] === '/') {
      i += 2;
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function stripTrailingCommas(input) {
  return input.replace(/,(\s*[}\]])/g, '$1');
}

export function parseJsonc(text) {
  const noComments = stripJsonComments(text);
  const noTrailingCommas = stripTrailingCommas(noComments);
  return JSON.parse(noTrailingCommas);
}
