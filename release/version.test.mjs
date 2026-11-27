// Tests of version.mjs.
//   node --test release/version.test.mjs        from the repository root
// Each test works on a copy of the files that carry the version, in a folder of its own.

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLACES, readVersions, refusal, setVersion } from './version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [...new Set(PLACES.map((place) => place.file))];

function copyOfTree(t) {
  const root = mkdtempSync(join(tmpdir(), 'tabgoblin-version-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(ROOT, file), join(root, file));
  }
  return root;
}

const read = (root, file) => readFileSync(join(root, file), 'utf8');

test('the files in the tree agree on one version', () => {
  const versions = new Set(readVersions().map((place) => place.version));
  assert.equal(versions.size, 1, `the files name ${[...versions].join(', ')}`);
  assert.equal(refusal([...versions][0]), null);
});

test('a new version reaches every place and changes nothing else', (t) => {
  const root = copyOfTree(t);
  const [{ version: old }] = readVersions(root);
  const before = Object.fromEntries(FILES.map((file) => [file, read(root, file)]));
  const changed = setVersion('12.34.56', { root });
  assert.deepEqual(changed, FILES);
  assert.deepEqual(new Set(readVersions(root).map((place) => place.version)), new Set(['12.34.56']));
  for (const file of FILES) {
    // Put the old version back in place of the new one: the file is as it was, byte for byte.
    assert.equal(read(root, file).replaceAll('12.34.56', old), before[file], file);
  }
  for (const file of FILES.filter((name) => name.endsWith('.json'))) JSON.parse(read(root, file));
  assert.equal(JSON.parse(read(root, 'chrome-extension/package-lock.json')).packages[''].version, '12.34.56');
});

test('the same version again changes no file', (t) => {
  const root = copyOfTree(t);
  const [{ version }] = readVersions(root);
  assert.deepEqual(setVersion(version, { root }), []);
});

test('a dry run writes nothing', (t) => {
  const root = copyOfTree(t);
  const before = FILES.map((file) => read(root, file));
  assert.equal(setVersion('9.9.9', { root, dryRun: true }).length, FILES.length);
  assert.deepEqual(FILES.map((file) => read(root, file)), before);
});

test('a version Chrome would refuse is refused before anything is written', (t) => {
  const root = copyOfTree(t);
  const before = FILES.map((file) => read(root, file));
  for (const version of ['0.3', '0.3.0.1', '0.3.0-beta', 'v0.3.0', '0.03.0', '0.65536.0', '', ' 0.3.0']) {
    assert.notEqual(refusal(version), null, version);
    assert.throws(() => setVersion(version, { root }), undefined, version);
  }
  for (const version of ['0.3.0', '1.0.0', '10.0.65535']) assert.equal(refusal(version), null, version);
  assert.deepEqual(FILES.map((file) => read(root, file)), before);
});

test('a place that is not found stops the change, and no file is written', (t) => {
  const root = copyOfTree(t);
  const file = 'e2e/mcp-client.mjs';
  writeFileSync(join(root, file), read(root, file).replace('clientInfo:', 'clientDetails:'));
  const before = FILES.map((name) => read(root, name));
  assert.throws(() => setVersion('9.9.9', { root }), /e2e\/mcp-client\.mjs: the version's place was found 0 times/);
  assert.deepEqual(FILES.map((name) => read(root, name)), before);
});
