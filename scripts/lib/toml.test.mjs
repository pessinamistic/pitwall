import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tomlBasicString, tomlMultilineBasicString } from './toml.mjs';

test('tomlBasicString escapes backslash', () => {
  assert.equal(tomlBasicString('a\\b'), '"a\\\\b"');
});

test('tomlBasicString escapes double quote', () => {
  assert.equal(tomlBasicString('a"b'), '"a\\"b"');
});

test('tomlBasicString escapes newline', () => {
  assert.equal(tomlBasicString('a\nb'), '"a\\nb"');
});

test('tomlBasicString escapes tab', () => {
  assert.equal(tomlBasicString('a\tb'), '"a\\tb"');
});

test('tomlBasicString escapes carriage return', () => {
  assert.equal(tomlBasicString('a\rb'), '"a\\rb"');
});

test('tomlBasicString throws on an unrepresentable control character', () => {
  assert.throws(() => tomlBasicString('a\x01b'), /unrepresentable control character/);
});

test('tomlBasicString throws on the given typedef', () => {
  assert.throws(() => tomlBasicString(42), /expected a string/);
});

test('tomlMultilineBasicString wraps the value in triple quotes', () => {
  assert.equal(tomlMultilineBasicString('hello'), '"""\nhello"""');
});

test('tomlMultilineBasicString splits a run of three quotes so it cannot terminate early', () => {
  const result = tomlMultilineBasicString('a"""b');
  // The closing delimiter must be the only unescaped triple-quote run.
  assert.equal(result, '"""\na""\\"b"""');
  const inner = result.slice(4, -3);
  assert.ok(!/(?<!\\)"""/.test(inner));
});

test('tomlMultilineBasicString escapes a trailing quote', () => {
  const result = tomlMultilineBasicString('ends with "');
  assert.equal(result, '"""\nends with \\""""');
});

test('tomlMultilineBasicString throws on carriage return', () => {
  assert.throws(() => tomlMultilineBasicString('a\rb'), /unrepresentable control character/);
});

test('tomlMultilineBasicString throws on other control characters', () => {
  assert.throws(() => tomlMultilineBasicString('a\x01b'), /unrepresentable control character/);
});

test('tomlMultilineBasicString allows newline and tab', () => {
  assert.equal(tomlMultilineBasicString('a\nb\tc'), '"""\na\nb\tc"""');
});
