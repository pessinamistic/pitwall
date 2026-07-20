import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitFrontmatter,
  parseYamlMapping,
  parseFrontmatterFile,
} from './frontmatter.mjs';

test('splitFrontmatter returns null when there is no "---" at byte 0', () => {
  assert.equal(splitFrontmatter('no frontmatter here\n---\nnope\n---\n'), null);
});

test('splitFrontmatter splits the frontmatter block from the body', () => {
  const raw = '---\nname: foo\ndescription: bar\n---\nbody text here\n';
  const result = splitFrontmatter(raw);
  assert.ok(result);
  assert.equal(result.frontmatterText, 'name: foo\ndescription: bar');
  assert.equal(result.body, 'body text here\n');
});

test('parseYamlMapping parses nested block mappings', () => {
  const yaml = [
    'name: foo',
    'permission:',
    '  edit: deny',
    '  bash:',
    '    "*": allow',
    '    "git push*": ask',
  ].join('\n');
  assert.deepEqual(parseYamlMapping(yaml), {
    name: 'foo',
    permission: {
      edit: 'deny',
      bash: {
        '*': 'allow',
        'git push*': 'ask',
      },
    },
  });
});

test('parseYamlMapping parses a ">-" folded block scalar as a space-joined string', () => {
  const yaml = ['description: >-', '  first line', '  second line', 'name: foo'].join('\n');
  assert.deepEqual(parseYamlMapping(yaml), {
    description: 'first line second line',
    name: 'foo',
  });
});

test('parseYamlMapping parses a "|" literal block scalar preserving newlines', () => {
  const yaml = ['body: |', '  line one', '  line two', 'name: foo'].join('\n');
  assert.deepEqual(parseYamlMapping(yaml), {
    body: 'line one\nline two',
    name: 'foo',
  });
});

test('parseYamlMapping parses quoted keys and values', () => {
  const yaml = `"my key": 'my value'`;
  assert.deepEqual(parseYamlMapping(yaml), { 'my key': 'my value' });
});

test('parseYamlMapping strips a trailing "# ..." comment outside quotes', () => {
  const yaml = 'name: foo # this is a comment';
  assert.deepEqual(parseYamlMapping(yaml), { name: 'foo' });
});

test('parseYamlMapping does not strip a "#" that lives inside a quoted value', () => {
  const yaml = `name: "foo # not a comment"`;
  assert.deepEqual(parseYamlMapping(yaml), { name: 'foo # not a comment' });
});

test('parseFrontmatterFile returns {frontmatter, body} for a real file string', () => {
  const raw = '---\nname: foo\ndescription: does a thing\n---\n# Foo\n\nBody content.\n';
  const result = parseFrontmatterFile(raw);
  assert.ok(result);
  assert.deepEqual(result.frontmatter, { name: 'foo', description: 'does a thing' });
  assert.equal(result.body, '# Foo\n\nBody content.\n');
});

test('parseFrontmatterFile returns null for a file with no frontmatter', () => {
  assert.equal(parseFrontmatterFile('# Just a heading\n\nNo frontmatter here.\n'), null);
});
