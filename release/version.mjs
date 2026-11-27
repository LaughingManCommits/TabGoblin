// Reads or changes TabGoblin's version, in every file that carries it.
//   node release/version.mjs                 prints the version; exits 1 if the files disagree
//   node release/version.mjs 0.3.0           changes it in all of them
//   node release/version.mjs 0.3.0 --dry-run says what it would change, and writes nothing
// From any folder: the files are found from this script's place in the tree.
//
// The places are the seven the runbook names ("Change the version") and the three lock files,
// whose own version npm would otherwise change on the next install. Each place is one exact spot
// in its file; if one is not found once, nothing is written. After a change it lists the other
// lines of the tree that still name the old version, to be read by hand: the documentation
// speaks of the published release, which is not the version in the tree until it is tagged.
// It runs nothing else: no npm, no Maven, no git commit and no tag.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Each pattern has three groups: what stands before the version, the version, what follows.
const TOP_LEVEL_JSON = /^( {2}"version": ")([^"]*)(")/m;
const LOCK_ROOT_PACKAGE = /("packages": \{\s*"": \{[^{}]*?"version": ")([^"]*)(")/;

export const PLACES = [
  { file: 'pom.xml', pattern: /(<artifactId>tabgoblin-parent<\/artifactId>\s*<version>)([^<]*)(<\/version>)/ },
  { file: 'java-server/pom.xml', pattern: /(<artifactId>tabgoblin<\/artifactId>\s*<version>)([^<]*)(<\/version>)/ },
  { file: 'chrome-extension/manifest.json', pattern: TOP_LEVEL_JSON },
  { file: 'chrome-extension/package.json', pattern: TOP_LEVEL_JSON },
  { file: 'chrome-extension/package-lock.json', pattern: TOP_LEVEL_JSON },
  { file: 'chrome-extension/package-lock.json', pattern: LOCK_ROOT_PACKAGE },
  { file: 'e2e/package.json', pattern: TOP_LEVEL_JSON },
  { file: 'e2e/package-lock.json', pattern: TOP_LEVEL_JSON },
  { file: 'e2e/package-lock.json', pattern: LOCK_ROOT_PACKAGE },
  { file: 'e2e/editors/package.json', pattern: TOP_LEVEL_JSON },
  { file: 'e2e/editors/package-lock.json', pattern: TOP_LEVEL_JSON },
  { file: 'e2e/editors/package-lock.json', pattern: LOCK_ROOT_PACKAGE },
  { file: 'e2e/mcp-client.mjs', pattern: /(clientInfo: \{ name: this\.name, version: ')([^']*)(')/ },
];

// Records of what was, which keep old versions on purpose.
const HISTORY = ['TODO.md', 'docs/agents/state.md', 'docs/agents/validation-log.md'];

/**
 * Why a version cannot be TabGoblin's, or null if it can. Chrome takes one to four numbers of
 * 0 to 65535 without leading zeros and nothing else (no "-beta"); TabGoblin uses three.
 */
export function refusal(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return `"${version}" is not three numbers with dots between them, as 0.3.0; Chrome takes no suffix such as -beta.`;
  }
  for (const part of version.split('.')) {
    if (part.length > 1 && part.startsWith('0')) return `"${version}" has a number with a leading zero, which Chrome refuses.`;
    if (Number(part) > 65535) return `"${version}" has a number above 65535, which Chrome refuses.`;
  }
  return null;
}

function count(text, pattern) {
  return text.match(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'))?.length ?? 0;
}

/** The version at each place: [{ file, version }]. Throws if a place is not found exactly once. */
export function readVersions(root = ROOT) {
  return PLACES.map(({ file, pattern }) => {
    const text = readFileSync(join(root, file), 'utf8');
    const found = count(text, pattern);
    if (found !== 1) {
      throw new Error(`${file}: the version's place was found ${found} times, not once. Has the file's layout changed? Then change PLACES in release/version.mjs.`);
    }
    return { file, version: text.match(pattern)[2] };
  });
}

/**
 * Puts the version into every place, all or nothing. Returns the files that changed. With
 * dryRun, returns them and writes nothing.
 */
export function setVersion(version, { root = ROOT, dryRun = false } = {}) {
  const why = refusal(version);
  if (why) throw new Error(why);
  readVersions(root); // every place is there, or nothing is written
  const texts = new Map();
  for (const { file, pattern } of PLACES) {
    const text = texts.get(file) ?? readFileSync(join(root, file), 'utf8');
    texts.set(file, text.replace(pattern, (_, before, _old, after) => before + version + after));
  }
  const changed = [];
  for (const [file, text] of texts) {
    if (text === readFileSync(join(root, file), 'utf8')) continue;
    changed.push(file);
    if (!dryRun) writeFileSync(join(root, file), text);
  }
  return changed;
}

/** The lines git tracks that name the version outside its places, the lock files and the records. */
export function otherMentions(version, root = ROOT) {
  const escaped = version.replaceAll('.', '\\.');
  const excluded = [...new Set(PLACES.map((place) => place.file)), ...HISTORY]
    .map((file) => `:(exclude)${file}`);
  try {
    return execFileSync('git', ['grep', '-n', '-E', `(^|[^0-9.])${escaped}([^0-9]|$)`, '--', '.', ':(exclude)*package-lock.json', ...excluded],
      { cwd: root, encoding: 'utf8' }).trimEnd().split('\n');
  } catch (error) {
    if (error.status === 1) return []; // git grep found nothing
    throw error;
  }
}

function main(args) {
  const dryRun = args.includes('--dry-run');
  const rest = args.filter((arg) => arg !== '--dry-run');
  if (rest.length > 1 || rest.some((arg) => arg.startsWith('-'))) {
    console.error('Use: node release/version.mjs [<version>] [--dry-run]');
    return 2;
  }
  const versions = readVersions();
  const distinct = [...new Set(versions.map((place) => place.version))];
  if (rest.length === 0) {
    if (distinct.length === 1) {
      console.log(distinct[0]);
      return 0;
    }
    console.error('The files disagree about the version:');
    for (const { file, version } of versions) console.error(`  ${version.padEnd(10)} ${file}`);
    console.error('Set one for all of them: node release/version.mjs <version>');
    return 1;
  }
  const [version] = rest;
  const changed = setVersion(version, { dryRun });
  const was = distinct.join(', ');
  if (changed.length === 0) {
    console.log(`The version is ${version} in every file already.`);
    return 0;
  }
  console.log(`${dryRun ? 'Would change' : 'Changed'} the version from ${was} to ${version} in:`);
  for (const file of changed) console.log(`  ${file}`);
  const mentions = distinct.filter((old) => old !== version).flatMap((old) => otherMentions(old));
  if (mentions.length > 0) {
    console.log('\nThese lines still name the old version. Read them; most speak of a published release and stay until it is replaced:');
    for (const line of mentions) console.log(`  ${line}`);
  }
  if (!dryRun) {
    console.log('\nNext: the suites, and one commit with all of it (runbook: "Change the version").');
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
