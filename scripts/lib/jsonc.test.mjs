import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripJsonComments, stripTrailingCommas, parseJsonc } from './jsonc.mjs';

test('stripJsonComments removes a line comment', () => {
  assert.equal(stripJsonComments('{"a": 1} // trailing\n'), '{"a": 1} \n');
});

test('stripJsonComments removes a block comment', () => {
  assert.equal(stripJsonComments('{"a": /* inline */ 1}'), '{"a":  1}');
});

test('stripJsonComments does not touch // inside a string literal', () => {
  assert.equal(stripJsonComments('{"a": "http://example.com"}'), '{"a": "http://example.com"}');
});

test('stripJsonComments does not touch /* */ inside a string literal', () => {
  assert.equal(stripJsonComments('{"a": "/* not a comment */"}'), '{"a": "/* not a comment */"}');
});

test('stripTrailingCommas removes a comma before a closing brace', () => {
  assert.equal(stripTrailingCommas('{"a": 1,}'), '{"a": 1}');
});

test('stripTrailingCommas removes a comma before a closing bracket', () => {
  assert.equal(stripTrailingCommas('[1, 2,]'), '[1, 2]');
});

test('parseJsonc parses a JSONC string with comments and a trailing comma', () => {
  const text = `{
    // a leading comment
    "a": 1, /* inline */
    "b": [1, 2, 3,],
  }`;
  assert.deepEqual(parseJsonc(text), { a: 1, b: [1, 2, 3] });
});
