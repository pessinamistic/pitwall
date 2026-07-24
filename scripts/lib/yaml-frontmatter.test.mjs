import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yamlKey, yamlScalar, serializeYamlMapping, escapeYamlDoubleQuoted } from './yaml-frontmatter.mjs';
import { parseFrontmatterFile, parseYamlMapping } from './frontmatter.mjs';
import { TEAM_ROLES } from './team.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('yamlKey leaves a simple hyphenated identifier bare', () => {
  assert.equal(yamlKey('senior-dev'), 'senior-dev');
  assert.equal(yamlKey('edit'), 'edit');
});

test('yamlKey quotes a leading wildcard (YAML alias sigil)', () => {
  assert.equal(yamlKey('*'), '"*"');
});

test('yamlKey quotes a key containing a space', () => {
  assert.equal(yamlKey('npm test*'), '"npm test*"');
  assert.equal(yamlKey('git diff*'), '"git diff*"');
});

test('yamlScalar leaves permission shorthand values bare', () => {
  assert.equal(yamlScalar('allow'), 'allow');
  assert.equal(yamlScalar('deny'), 'deny');
  assert.equal(yamlScalar('ask'), 'ask');
});

test('yamlScalar quotes a bare token that would parse back as a different type', () => {
  assert.equal(yamlScalar('null'), '"null"');
  assert.equal(yamlScalar('true'), '"true"');
});

test('yamlScalar renders numbers without added precision', () => {
  assert.equal(yamlScalar(0), '0');
  assert.equal(yamlScalar(20), '20');
  assert.equal(yamlScalar(0.1), '0.1');
});

test('yamlScalar renders booleans and null', () => {
  assert.equal(yamlScalar(true), 'true');
  assert.equal(yamlScalar(false), 'false');
  assert.equal(yamlScalar(null), 'null');
});

test('yamlScalar throws on an unsupported value type', () => {
  assert.throws(() => yamlScalar(undefined), /unsupported value type/);
  assert.throws(() => yamlScalar([1, 2]), /unsupported value type/);
});

test('escapeYamlDoubleQuoted escapes backslash and double quote', () => {
  assert.equal(escapeYamlDoubleQuoted('a\\b"c'), 'a\\\\b\\"c');
});

test('serializeYamlMapping renders a nested pattern map with "*" first', () => {
  const lines = serializeYamlMapping({ bash: { '*': 'ask', 'npm test*': 'allow' } }, 2);
  assert.deepEqual(lines, ['  bash:', '    "*": ask', '    "npm test*": allow']);
});

test('serializeYamlMapping preserves key insertion order', () => {
  const lines = serializeYamlMapping({ b: 1, a: 2 }, 0);
  assert.deepEqual(lines, ['b: 1', 'a: 2']);
});

test('round-trips every agents/*.md permission block through parse -> serialize -> parse unchanged', () => {
  for (const role of TEAM_ROLES) {
    const raw = fs.readFileSync(path.join(REPO_ROOT, 'agents', `${role}.md`), 'utf8');
    const parsed = parseFrontmatterFile(raw);
    assert.ok(parsed, `agents/${role}.md: expected a frontmatter block`);
    const fm = parsed.frontmatter;
    if (!fm.permission) continue;
    const reserialized = serializeYamlMapping(fm.permission, 0).join('\n');
    const reparsed = parseYamlMapping(reserialized);
    assert.deepEqual(reparsed, fm.permission, `agents/${role}.md: permission block did not round-trip`);
  }
});
