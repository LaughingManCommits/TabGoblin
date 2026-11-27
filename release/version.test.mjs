// Tests of version.mjs.
//   node --test release/version.test.mjs        from the repository root
// Each test works on a copy of the files that carry the version, in a folder of its own.

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLACES, chromeVersion, compare, currentVersion, plan, previousTag, readVersions, refusal, setVersion } from './version.mjs';

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
  const refused = ['0.3', '0.3.0.1', '0.3.0-beta', '0.3.0-beta.0', '0.3.0-beta.01', '0.3.0-beta.65536',
    '0.3.0-rc.1', '0.3.0-beta1', 'v0.3.0', '0.03.0', '0.65536.0', '', ' 0.3.0'];
  for (const version of refused) {
    assert.notEqual(refusal(version), null, version);
    assert.throws(() => setVersion(version, { root }), undefined, version);
  }
  for (const version of ['0.3.0', '1.0.0', '10.0.65535', '0.3.0-beta.1', '0.3.0-beta.65535']) {
    assert.equal(refusal(version), null, version);
  }
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

test('a beta is the manifest\'s fourth number, and its full name is the manifest\'s version_name', (t) => {
  const root = copyOfTree(t);
  const [{ version: old }] = readVersions(root);
  const original = Object.fromEntries(FILES.map((file) => [file, read(root, file)]));
  assert.equal(chromeVersion('0.3.0-beta.2'), '0.3.0.2');
  assert.equal(chromeVersion('0.3.0'), '0.3.0');

  setVersion('0.3.0-beta.2', { root });
  const manifest = JSON.parse(read(root, 'chrome-extension/manifest.json'));
  assert.equal(manifest.version, '0.3.0.2');
  assert.equal(manifest.version_name, '0.3.0-beta.2');
  assert.equal(JSON.parse(read(root, 'chrome-extension/package.json')).version, '0.3.0-beta.2');
  assert.match(read(root, 'java-server/pom.xml'), /<version>0\.3\.0-beta\.2<\/version>/);
  assert.equal(currentVersion(root), '0.3.0-beta.2');

  // The next beta replaces the name; the release takes it out, and the file is as it was.
  setVersion('0.3.0-beta.3', { root });
  assert.equal(JSON.parse(read(root, 'chrome-extension/manifest.json')).version_name, '0.3.0-beta.3');
  assert.equal(count(read(root, 'chrome-extension/manifest.json'), 'version_name'), 1);
  setVersion(old, { root });
  for (const file of FILES) assert.equal(read(root, file), original[file], file);
});

test('a manifest whose version_name does not fit its version disagrees with the rest', (t) => {
  const root = copyOfTree(t);
  setVersion('0.3.0-beta.2', { root });
  const file = join(root, 'chrome-extension/manifest.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"0.3.0.2"', '"0.3.0.5"'));
  assert.throws(() => currentVersion(root), /disagree[\s\S]*0\.3\.0\.5 \(version_name 0\.3\.0-beta\.2\)/);
});

test('a release from main is the version given; from another branch, the next beta of it', () => {
  const tags = ['v0.2.0', 'v0.2.1', 'v0.3.0-beta.1', 'v0.3.0-beta.2', 'v0.3.0-beta.10', 'v0.3.1-beta.4'];
  assert.equal(plan('0.3.0', { branch: 'main', tags, current: '0.2.1' }), '0.3.0');
  assert.equal(plan('0.3.0', { branch: 'main', tags, current: '0.3.0-beta.10' }), '0.3.0');
  assert.equal(plan('0.3.0', { branch: 'feature/x', tags, current: '0.2.1' }), '0.3.0-beta.11');
  assert.equal(plan('0.4.0', { branch: 'feature/x', tags, current: '0.2.1' }), '0.4.0-beta.1');
  assert.equal(plan('1.0.0', { branch: 'main', tags: [], current: '0.2.1' }), '1.0.0');
});

test('a release is refused below the tree, when it is out already, and with a beta given', () => {
  const tags = ['v0.2.0', 'v0.2.1', 'v0.3.0-beta.1'];
  assert.throws(() => plan('0.2.0', { branch: 'main', tags, current: '0.2.1' }), /below 0\.2\.1/);
  assert.throws(() => plan('0.2.1', { branch: 'main', tags, current: '0.2.1' }), /released already/);
  assert.throws(() => plan('0.2.1', { branch: 'feature/x', tags, current: '0.2.1' }), /released already/);
  assert.throws(() => plan('0.3.0-beta.2', { branch: 'feature/x', tags, current: '0.2.1' }), /without "-beta"/);
  assert.throws(() => plan('0.3', { branch: 'main', tags, current: '0.2.1' }), /neither three numbers/);
});

test('versions are ordered with a beta below its release', () => {
  const sorted = ['0.3.1-beta.1', '0.3.0', '0.2.1', '0.3.0-beta.10', '0.3.0-beta.2', '0.10.0', '0.3.0-beta.1'].sort(compare);
  assert.deepEqual(sorted, ['0.2.1', '0.3.0-beta.1', '0.3.0-beta.2', '0.3.0-beta.10', '0.3.0', '0.3.1-beta.1', '0.10.0']);
});

test('the list of changes starts at the release before, or for a beta at the beta before', () => {
  const tags = ['v0.2.0', 'v0.2.1', 'v0.3.0-beta.1', 'v0.3.0-beta.2', 'v0.3.1-beta.1', 'not-a-version', 'v0.9'];
  // A release counts from the release before it, past its betas and past a beta of a later one.
  assert.equal(previousTag('0.3.0', tags), 'v0.2.1');
  assert.equal(previousTag('0.4.0', tags), 'v0.2.1');
  // A beta counts from the beta before it, or from the release before it.
  assert.equal(previousTag('0.3.0-beta.3', tags), 'v0.3.0-beta.2');
  assert.equal(previousTag('0.4.0-beta.1', tags), 'v0.2.1');
  assert.equal(previousTag('0.3.1-beta.2', tags), 'v0.3.1-beta.1');
  // None before the first.
  assert.equal(previousTag('0.1.0', tags), null);
  assert.equal(previousTag('0.2.0', []), null);
});

function count(text, word) {
  return text.split(word).length - 1;
}
