// Tests of check-drift.mjs: a small tree with the files it reads, planted with what it must find.
//   node --test docs/agents/check-drift.test.mjs        from the repository root

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { defined, findings } from './check-drift.mjs';

/** A tree in which every part agrees: protocol 7, link 2, ports 47821 and 37821. */
function tree(changes = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tabgoblin-drift-'));
  const files = {
    'java-server/src/main/java/tabgoblin/Protocol.java': 'final class Protocol {\n    static final int VERSION = 7;\n}\n',
    'java-server/src/main/java/tabgoblin/Link.java': 'final class Link {\n    static final int VERSION = 2;\n}\n',
    'java-server/src/main/java/tabgoblin/McpMain.java': 'public final class McpMain {\n    static final int DEFAULT_PORT = 47821;\n}\n',
    'java-server/src/main/java/tabgoblin/Ports.java': 'final class Ports {\n    static final List<Integer> FIRST = List.of(McpMain.DEFAULT_PORT, 37821);\n}\n',
    'chrome-extension/src/protocol.ts': 'export const PROTOCOL_VERSION = 7;\n',
    'chrome-extension/src/policy.ts': 'export const PORTS: readonly number[] = [47821, 37821];\n',
    'docs/development.md': '{ "type": "hello", "nonce": "…", "link": 2 }\nExtension: connected (protocol 7)\n',
    'docs/agents/state.md': 'The servers folder (RunningServers) went on 2026-11-28.\n',
    ...changes,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const whats = (root) => findings(root).map((f) => `${f.file}:${f.line} ${f.what}`);

test('a tree in which every part agrees has no finding, and the numbers are read as defined', () => {
  const root = tree();
  try {
    assert.deepEqual(whats(root), []);
    assert.deepEqual(defined(root), { protocol: { server: 7, extension: 7 }, link: 2, ports: { server: [47821, 37821], extension: [47821, 37821] } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a retired name is found in a page, a comment and a script, and passes in the records', () => {
  const root = tree({
    'docs/architecture.md': 'Each server writes a file into the servers folder (RunningServers).\n',
    'java-server/src/main/java/tabgoblin/Hub.java': '// the first port of the range\n',
    'e2e/run.mjs': "const old = 'bcmcp-token';\n",
    'AGENTS.md': 'The names from before (`bcmcp-*`) are not to come back.\n',
  });
  try {
    const found = whats(root);
    assert.equal(found.length, 3, found.join('\n'));
    assert.match(found.find((f) => f.startsWith('docs/architecture.md:1')), /WP-33/);
    assert.match(found.find((f) => f.startsWith('java-server/src/main/java/tabgoblin/Hub.java:1')), /first port|WP-33/);
    assert.match(found.find((f) => f.startsWith('e2e/run.mjs:1')), /before the product was named/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the protocol version, the ports and the link version have to agree with their definitions', () => {
  const root = tree({
    'chrome-extension/src/protocol.ts': 'export const PROTOCOL_VERSION = 6;\n',
    'chrome-extension/src/policy.ts': 'export const PORTS: readonly number[] = [47821, 37821, 27821];\n',
    'docs/development.md': '{ "type": "hello", "nonce": "…", "link": 1 }\n',
    'docs/tool-reference.md': 'Extension: connected (protocol 6)\nIt said protocol version 3 before, which is history and no number of now.\n',
    'docs/assets/diagrams/build.mjs': "d.label(0, 0, ['paired · protocol 7']);\n",
  });
  try {
    const found = whats(root);
    assert.deepEqual(found, [
      'chrome-extension/src/protocol.ts:0 PROTOCOL_VERSION is 6, Protocol.VERSION is 7',
      'chrome-extension/src/policy.ts:0 PORTS is 47821, 37821, 27821, Ports.FIRST is 47821, 37821',
      'docs/development.md:1 says link 1; Link.VERSION is 2',
      'docs/tool-reference.md:1 says protocol 6; the protocol version is 7',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a code file or a variable a page names has to be in the tree, and a record may name what is gone', () => {
  const root = tree({
    'docs/developer-guide.md': 'Set `TABGOBLIN_PORT`, or `TABGOBLIN_GONE`; the rule is in `policy.ts`, not in `Vanished.java`.\n',
    'java-server/src/main/java/tabgoblin/Options.java': 'String port = System.getenv("TABGOBLIN_PORT");\n',
    'chrome-extension/src/policy.ts': 'export const PORTS: readonly number[] = [47821, 37821];\n',
    'docs/agents/state.md': 'Then `Vanished.java` and `TABGOBLIN_GONE` went.\n',
  });
  try {
    assert.deepEqual(whats(root), [
      'docs/developer-guide.md:1 names Vanished.java, and no file of that name is in the tree',
      'docs/developer-guide.md:1 names TABGOBLIN_GONE, which no part reads',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a definition that cannot be read is one finding, not a crash', () => {
  const root = tree({ 'chrome-extension/src/protocol.ts': 'export const PROTOCOL_VERSION = "seven";\n' });
  try {
    const found = whats(root);
    assert.equal(found.length, 1);
    assert.match(found[0], /PROTOCOL_VERSION: not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
