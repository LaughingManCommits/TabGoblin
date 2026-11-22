// Tests of check-personal.mjs.
//   node --test docs/agents/check-personal.test.mjs        from the repository root
// The planted values are put together at run time, so that this file holds none of them and
// passes the check itself.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { checkTree, findings } from './check-personal.mjs';

const HOME = 'a home directory';
const MAIL = 'a mail address outside the example domains';
const LINK = 'a link to a session';

const windowsHome = ['C:', 'Users', 'someone'].join('\\');
const unixHome = ['', 'home', 'someone'].join('/');
const mail = ['someone', 'mailbox.org'].join('@');
const sessionLink = `https://${['claude', 'ai'].join('.')}/code/session_0123456789`;

const kinds = (text) => findings(text).map((finding) => finding.kind);

test('finds a home directory in each form a system gives it', () => {
  const forms = [
    `${windowsHome}\\project\\file.txt`,
    windowsHome.replaceAll('\\', '/'),
    windowsHome.replaceAll('\\', '\\\\'), // as a string in JSON or Java holds it
    windowsHome.toLowerCase(),
    `file:///${windowsHome.replaceAll('\\', '/')}/page.html`,
    ['', 'Users', 'someone', 'project'].join('/'),
    `${unixHome}/project`,
    `"${unixHome}"`,
    `file://${unixHome}/page.html`,
    ['', 'c', 'Users', 'someone'].join('/'), // as Git Bash writes it
  ];
  for (const form of forms) assert.deepEqual(kinds(`see ${form} for it`), [HOME], form);
});

test('finds a mail address and a link to a session', () => {
  assert.deepEqual(kinds(`written by <${mail}>`), [MAIL]);
  assert.deepEqual(kinds(`Session: ${sessionLink}`), [LINK]);
});

test('says the line and the kind, and never the text found', () => {
  const found = findings(`first\n\nthird ${windowsHome} and ${windowsHome}\nfourth ${mail} ${sessionLink}\r\n`);
  assert.deepEqual(found, [
    { line: 3, kind: HOME },
    { line: 4, kind: MAIL },
    { line: 4, kind: LINK },
  ]);
});

test('lets pass what only looks like it', () => {
  const harmless = [
    'C:\\Users\\<name>\\project and /home/<you>/project and %USERPROFILE% and ~/project',
    'C:\\Users\\%USERNAME% and /home/$USER',
    '"args": ["-jar", "<folder>/TabGoblin/java-server/target/browser-context-mcp.jar"]',
    'file:///C:/Windows/win.ini and file:///C:/x.html and D:/code',
    'https://example.com/home/page and http://127.0.0.1:8931/home/index.html and src/home/x',
    'ada@example.org, a@b.example, pw@app.example, x@host.test, x@mail.example.com',
    'actions/checkout@v7, react@18.3.1, @AGENTS.md, @types/node, @Test',
    'https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.25.0.tgz',
    'the `Claude-Session:` line, and https://claude.ai and claude.ai/code',
    'https://github.com/some-account/TabGoblin.git',
  ];
  for (const line of harmless) assert.deepEqual(findings(line), [], line);
});

test('reads tracked and new files of a checkout, and not ignored or binary ones', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-personal-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(root, 'clean.md'), 'Nothing here.\n');
    writeFileSync(join(root, 'docs', 'tracked.md'), `one\ntwo ${windowsHome}\n`);
    writeFileSync(join(root, 'ignored.txt'), `${unixHome}\n`);
    writeFileSync(join(root, 'picture.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0, 0]), Buffer.from(unixHome)]));
    execFileSync('git', ['add', '.gitignore', 'clean.md', 'docs/tracked.md', 'picture.png'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'new.txt'), `${mail}\n`);

    const planted = checkTree(root);
    assert.deepEqual(planted.found.sort((a, b) => a.file.localeCompare(b.file)), [
      { file: 'docs/tracked.md', line: 2, kind: HOME },
      { file: 'new.txt', line: 1, kind: MAIL },
    ]);
    assert.equal(planted.read, 4); // .gitignore, clean.md, docs/tracked.md, new.txt
    assert.equal(planted.binary, 1);

    writeFileSync(join(root, 'docs', 'tracked.md'), 'one\ntwo\n');
    rmSync(join(root, 'new.txt'));
    rmSync(join(root, 'clean.md')); // tracked, and deleted in the working tree
    assert.deepEqual(checkTree(root), { read: 2, binary: 1, found: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
