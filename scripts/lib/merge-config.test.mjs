import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfigs, mergeAgentWins, mergeExistingWins } from './merge-config.mjs';

test('mergeConfigs: outside "agent", existing wins on a leaf conflict', () => {
  const existing = { $schema: 'existing-schema', theme: 'dark' };
  const profile = { $schema: 'profile-schema' };
  const merged = mergeConfigs(existing, profile);
  assert.equal(merged.$schema, 'existing-schema');
});

test('mergeConfigs: outside "agent", unique profile keys are added (union)', () => {
  const existing = { theme: 'dark' };
  const profile = { permission: { edit: 'allow' } };
  const merged = mergeConfigs(existing, profile);
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.permission, { edit: 'allow' });
});

test('mergeConfigs: inside "agent", the profile wins on a leaf conflict', () => {
  const existing = { agent: { 'tech-lead': { model: 'existing-model' } } };
  const profile = { agent: { 'tech-lead': { model: 'profile-model' } } };
  const merged = mergeConfigs(existing, profile);
  assert.equal(merged.agent['tech-lead'].model, 'profile-model');
});

test('mergeConfigs: inside "agent", a user-only agent key is preserved', () => {
  const existing = {
    agent: {
      'tech-lead': { model: 'existing-model' },
      'my-custom-agent': { model: 'custom-model' },
    },
  };
  const profile = { agent: { 'tech-lead': { model: 'profile-model' } } };
  const merged = mergeConfigs(existing, profile);
  assert.deepEqual(merged.agent['my-custom-agent'], { model: 'custom-model' });
  assert.equal(merged.agent['tech-lead'].model, 'profile-model');
});

test('mergeConfigs: nested deep-merge outside "agent" keeps existing leaves and adds new ones', () => {
  const existing = {
    permission: {
      edit: 'deny',
      bash: { '*': 'allow' },
    },
  };
  const profile = {
    permission: {
      edit: 'ask',
      bash: { 'git push*': 'ask' },
      webfetch: 'deny',
    },
  };
  const merged = mergeConfigs(existing, profile);
  assert.deepEqual(merged.permission, {
    edit: 'deny',
    bash: { '*': 'allow', 'git push*': 'ask' },
    webfetch: 'deny',
  });
});

test('mergeAgentWins: profile wins on conflict, unique keys from both sides survive', () => {
  const existing = { a: { model: 'old' }, onlyExisting: { model: 'x' } };
  const incoming = { a: { model: 'new' }, onlyIncoming: { model: 'y' } };
  assert.deepEqual(mergeAgentWins(existing, incoming), {
    a: { model: 'new' },
    onlyExisting: { model: 'x' },
    onlyIncoming: { model: 'y' },
  });
});

test('mergeExistingWins: existing wins on conflict, unique keys from both sides survive', () => {
  const existing = { a: 'old', onlyExisting: 'x' };
  const incoming = { a: 'new', onlyIncoming: 'y' };
  assert.deepEqual(mergeExistingWins(existing, incoming), {
    a: 'old',
    onlyExisting: 'x',
    onlyIncoming: 'y',
  });
});
