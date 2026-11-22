// Checks that the repository's files give nothing personal away: no home directory, no mail
// address outside the example domains, no link to an agent's session.
//   node docs/agents/check-personal.mjs        from the repository root
// Reads the files git tracks and the new ones it would take (not the ignored ones), as they are in
// the working tree. Prints each finding as file:line and its kind, never the text that was found:
// the log of a CI run is read by more people than the file. Exits 1 on a finding.
// It reads text only. Pictures have to be opened and looked at, and commit messages are not read.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// What can be a user's name in a path. A placeholder in angle brackets (<name>) or a variable
// (%USERNAME%, $USER) is none, and passes.
const NAME = '[^\\s\\\\/<>"\'`$%{}()\\[\\],;:*?|]+';

const PATTERNS = [
  // With a drive letter: C:\Users\<name>, also with forward or doubled separators.
  { kind: 'a home directory', pattern: new RegExp(`\\b[a-z]:[\\\\/]{1,2}Users[\\\\/]{1,2}${NAME}`, 'gi') },
  // /Users/<name>, /home/<name> and /c/Users/<name>. Not right behind a letter, a digit, a dot or
  // a hyphen: that is the path of a web address (example.com/home/page) or a folder inside another.
  { kind: 'a home directory', pattern: new RegExp(`(?<![\\w.-])/(?:[A-Za-z]/)?(?:Users|home)/${NAME}`, 'g') },
  { kind: 'a mail address outside the example domains', pattern: /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g, unless: exampleDomain },
  { kind: 'a link to a session', pattern: /\bclaude\.ai\/[\w-]+\/[\w-]{6,}/gi },
];

// The names kept for documentation and tests (RFC 2606 and RFC 6761).
function exampleDomain(match) {
  return /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i.test(match[1]);
}

/** What one text holds: the line and the kind of each finding, and not the text found. */
export function findings(text) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    const kinds = new Set();
    for (const { kind, pattern, unless } of PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        if (!unless?.(match)) kinds.add(kind);
      }
    }
    for (const kind of kinds) found.push({ line: index + 1, kind });
  });
  return found;
}

/** Reads every file of the checkout in `root` that git tracks or would take. */
export function checkTree(root) {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const result = { read: 0, binary: 0, found: [] };
  for (const file of new Set(listed.split('\0').filter(Boolean))) {
    let bytes;
    try {
      bytes = readFileSync(join(root, file));
    } catch {
      continue; // tracked, and deleted in the working tree
    }
    if (bytes.subarray(0, 8000).includes(0)) {
      result.binary += 1; // a picture: not text
      continue;
    }
    result.read += 1;
    for (const finding of findings(bytes.toString('utf8'))) result.found.push({ file, ...finding });
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { read, binary, found } = checkTree(ROOT);
  for (const { file, line, kind } of found) console.log(`${file}:${line}: ${kind}`);
  const scope = `${read} files read, ${binary} binary files not read`;
  console.log(found.length ? `${found.length} findings (${scope})` : `${scope}, nothing personal found`);
  process.exit(found.length ? 1 : 0);
}
