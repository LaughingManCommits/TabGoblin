// Reads or changes TabGoblin's version, in every file that carries it.
//   node release/version.mjs                       prints the version; exits 1 if the files disagree
//   node release/version.mjs 0.3.0                 changes it in all of them
//   node release/version.mjs 0.3.0-beta.1          the same, for a beta
//   node release/version.mjs 0.3.0 --dry-run       says what it would change, and writes nothing
//   node release/version.mjs --plan 0.3.0 --branch <name>
//                                                  prints the version a release from that branch
//                                                  gets, or refuses; reads the tags, writes nothing
// From any folder: the files are found from this script's place in the tree.
//
// A version is three numbers, as 0.3.0, or a beta of one, as 0.3.0-beta.1. Chrome takes only
// numbers in the manifest's "version", so a beta is written there as 0.3.0.1, and its full name
// goes into "version_name", which is what chrome://extensions shows.
//
// The places are the two POMs, the manifest, the three package.json files with their lock files
// (the root package's version, as npm writes it), and the e2e client's clientInfo. Each place is
// one exact spot in its file; if one is not found once, nothing is written. After a change it
// lists the other lines of the tree that still name the old version, to be read by hand.
// It runs nothing else: no npm, no Maven, no commit and no tag. The release workflow does those.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Each pattern has three groups: what stands before the version, the version, what follows.
const TOP_LEVEL_JSON = /^( {2}"version": ")([^"]*)(")/m;
const LOCK_ROOT_PACKAGE = /("packages": \{\s*"": \{[^{}]*?"version": ")([^"]*)(")/;
const MANIFEST = 'chrome-extension/manifest.json';
const VERSION_NAME = /^ {2}"version_name": "([^"]*)",\n/m;

export const PLACES = [
  { file: 'pom.xml', pattern: /(<artifactId>tabgoblin-parent<\/artifactId>\s*<version>)([^<]*)(<\/version>)/ },
  { file: 'java-server/pom.xml', pattern: /(<artifactId>tabgoblin<\/artifactId>\s*<version>)([^<]*)(<\/version>)/ },
  { file: MANIFEST, pattern: TOP_LEVEL_JSON },
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

// Records of what was, which keep old versions on purpose, and this script's tests.
const HISTORY = ['TODO.md', 'docs/agents/state.md', 'docs/agents/validation-log.md', 'release/version.test.mjs'];

const SHAPE = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

/** The parts of a version: { major, minor, patch, beta } with beta null for a release; or null. */
export function parse(version) {
  const match = SHAPE.exec(version);
  if (!match) return null;
  const [major, minor, patch, beta] = match.slice(1).map((part) => (part === undefined ? null : Number(part)));
  return { major, minor, patch, beta };
}

/**
 * Why a version cannot be TabGoblin's, or null if it can. Chrome takes numbers of 0 to 65535
 * without leading zeros; a beta's number is the manifest's fourth, and starts at 1.
 */
export function refusal(version) {
  const match = SHAPE.exec(version);
  if (!match) {
    return `"${version}" is neither three numbers with dots between them, as 0.3.0, nor a beta of them, as 0.3.0-beta.1.`;
  }
  for (const part of match.slice(1).filter((part) => part !== undefined)) {
    if (part.length > 1 && part.startsWith('0')) return `"${version}" has a number with a leading zero, which Chrome refuses.`;
    if (Number(part) > 65535) return `"${version}" has a number above 65535, which Chrome refuses.`;
  }
  if (match[4] === '0') return `"${version}": a beta's number starts at 1.`;
  return null;
}

/** What the manifest's "version" holds for a version: 0.3.0 stays, 0.3.0-beta.1 is 0.3.0.1. */
export function chromeVersion(version) {
  const { major, minor, patch, beta } = parse(version);
  return [major, minor, patch, ...(beta === null ? [] : [beta])].join('.');
}

/** The release a version is of: 0.3.0-beta.1 is of 0.3.0. */
export function baseOf(version) {
  return version.replace(/-beta\.\d+$/, '');
}

function compareBase(a, b) {
  const [x, y] = [parse(a), parse(b)];
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

function count(text, pattern) {
  return text.match(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'))?.length ?? 0;
}

/** The version the manifest names: its "version_name" if it has one and it fits, else "version". */
function manifestVersion(text, version) {
  const name = VERSION_NAME.exec(text)?.[1];
  if (name === undefined) return version;
  // A name that does not fit the numbers is shown as both, so that it disagrees with the rest.
  return refusal(name) === null && chromeVersion(name) === version ? name : `${version} (version_name ${name})`;
}

/** The version at each place: [{ file, version }]. Throws if a place is not found exactly once. */
export function readVersions(root = ROOT) {
  return PLACES.map(({ file, pattern }) => {
    const text = readFileSync(join(root, file), 'utf8');
    const found = count(text, pattern);
    if (found !== 1) {
      throw new Error(`${file}: the version's place was found ${found} times, not once. Has the file's layout changed? Then change PLACES in release/version.mjs.`);
    }
    const version = text.match(pattern)[2];
    return { file, version: file === MANIFEST ? manifestVersion(text, version) : version };
  });
}

/** The one version the files name; throws, naming each, if they disagree. */
export function currentVersion(root = ROOT) {
  const versions = readVersions(root);
  const distinct = [...new Set(versions.map((place) => place.version))];
  if (distinct.length !== 1) {
    const lines = versions.map(({ file, version }) => `  ${version.padEnd(14)} ${file}`);
    throw new Error(`The files disagree about the version:\n${lines.join('\n')}\nSet one for all of them: node release/version.mjs <version>`);
  }
  return distinct[0];
}

function withVersionName(text, version) {
  const line = `  "version_name": "${version}",\n`;
  const without = text.replace(VERSION_NAME, '');
  if (parse(version).beta === null) return without;
  // Right after "version", where a reader looks for it.
  return without.replace(/^( {2}"version": "[^"]*",\n)/m, (versionLine) => versionLine + line);
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
    const value = file === MANIFEST ? chromeVersion(version) : version;
    const changed = text.replace(pattern, (_, before, _old, after) => before + value + after);
    texts.set(file, file === MANIFEST ? withVersionName(changed, version) : changed);
  }
  const changed = [];
  for (const [file, text] of texts) {
    if (text === readFileSync(join(root, file), 'utf8')) continue;
    changed.push(file);
    if (!dryRun) writeFileSync(join(root, file), text);
  }
  return changed;
}

/**
 * The version a release of `base` from `branch` gets: from main, base itself; from any other
 * branch, the next beta of it. Throws why not: a version that is not of three numbers, one
 * below the tree's, one already released, a beta of a released version.
 *   tags     the repository's tags, as `git tag -l` gives them
 *   current  the version in the tree
 */
export function plan(base, { branch, tags, current }) {
  const why = refusal(base);
  if (why) throw new Error(why);
  if (parse(base).beta !== null) {
    throw new Error(`Give the version without "-beta": ${baseOf(base)}. A run on a branch other than main numbers its betas itself.`);
  }
  if (compareBase(base, baseOf(current)) < 0) {
    throw new Error(`${base} is below ${current}, the version in the tree.`);
  }
  if (tags.includes(`v${base}`)) throw new Error(`${base} is released already: the tag v${base} is there.`);
  if (branch === 'main') return base;
  const betas = tags
    .map((tag) => new RegExp(`^v${base.replaceAll('.', '\\.')}-beta\\.(\\d+)$`).exec(tag))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return `${base}-beta.${Math.max(0, ...betas) + 1}`;
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

const USE = 'Use: node release/version.mjs [<version>] [--dry-run]\n     node release/version.mjs --plan <version> --branch <name>';

function main(args) {
  if (args[0] === '--plan') {
    if (args.length !== 4 || args[2] !== '--branch') {
      console.error(USE);
      return 2;
    }
    const tags = execFileSync('git', ['tag', '-l'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    console.log(plan(args[1], { branch: args[3], tags, current: currentVersion() }));
    return 0;
  }
  const dryRun = args.includes('--dry-run');
  const rest = args.filter((arg) => arg !== '--dry-run');
  if (rest.length > 1 || rest.some((arg) => arg.startsWith('-'))) {
    console.error(USE);
    return 2;
  }
  if (rest.length === 0) {
    console.log(currentVersion());
    return 0;
  }
  const [version] = rest;
  const before = [...new Set(readVersions().map((place) => place.version))];
  const changed = setVersion(version, { dryRun });
  if (changed.length === 0) {
    console.log(`The version is ${version} in every file already.`);
    return 0;
  }
  console.log(`${dryRun ? 'Would change' : 'Changed'} the version from ${before.join(', ')} to ${version} in:`);
  for (const file of changed) console.log(`  ${file}`);
  const mentions = before.filter((old) => old !== version && parse(old)).flatMap((old) => otherMentions(old));
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
