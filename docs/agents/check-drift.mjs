// Checks the files for documentation drift that has happened before and can be told apart by a
// machine: a name that was retired and must not come back; a number that two parts carry and
// have to agree on (the protocol version, the link version, the server's ports); a code file a
// page names that is not in the tree; a TABGOBLIN_* variable a page names that no part reads.
//   node docs/agents/check-drift.mjs        from the repository root
// Prints each finding as file:line and what it is, and exits 1; or prints what agreed.
//
// What it does not do: read pictures or commit messages, or judge prose. A page that describes a
// behaviour that is gone, in words that are not on the list, is found by reading, not by this.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.idea', 'out']);
const TEXT = /\.(md|mjs|js|ts|java|html|css|json|yml|yaml|sh|cmd|ps1|properties|txt|svg|xml)$/;

/**
 * Names that were dropped and are not to come back, each with the change that dropped it. The
 * records of what was (the state file, the validation log) and this check's own files may name
 * them; nothing else may, not a page, a comment, a test or a script.
 */
export const RETIRED = [
  // The rule that retired these names states them: in the agent guide and under "Names" on the development page.
  { find: /browser-context-mcp|browsercontext|BCMCP_|bcmcp-/, why: 'a name from before the product was named TabGoblin (2026-11-27)', statedIn: ['AGENTS.md', 'docs/development.md'] },
  { find: /RunningServers|AgentPortsTest|PORT_RANGE|FIRST_PORTS|rangesToScan|setup_port/, why: 'the per-agent ports and the servers folder, gone with the one port (WP-33)' },
  { find: /4782[2-9]|47821-4782|37829|27829|first port|First port/, why: 'the ranges of eight ports and the port after them, gone with the one port (WP-33)' },
];

/** Files whose words are history and are not held to the list. */
const RECORDS = ['docs/agents/state.md', 'docs/agents/validation-log.md', 'docs/agents/check-drift.mjs', 'docs/agents/check-drift.test.mjs'];

/** A code file named in a page, as `Name.java` or `name.ts`: it has to be in the tree, by that name. */
const CODE_FILE = /`([A-Za-z0-9_.-]+\.(?:java|ts|mjs|yml|sh|cmd|ps1|css|html))`/g;
/** A variable of the server or the scripts named in a page: some part has to read it. */
const VARIABLE = /\bTABGOBLIN_[A-Z][A-Z_]*\b/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return TEXT.test(name) ? [path] : [];
  });
}

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const number = (text, pattern, what) => {
  const m = pattern.exec(text);
  if (!m) throw new Error(`${what}: not found`);
  return Number(m[1]);
};

/** The numbers each part says, read from the sources that define them. */
export function defined(root = ROOT) {
  return {
    protocol: {
      server: number(read(root, 'java-server/src/main/java/tabgoblin/Protocol.java'), /static final int VERSION = (\d+);/, 'Protocol.VERSION'),
      extension: number(read(root, 'chrome-extension/src/protocol.ts'), /export const PROTOCOL_VERSION = (\d+);/, 'PROTOCOL_VERSION'),
    },
    link: number(read(root, 'java-server/src/main/java/tabgoblin/Link.java'), /static final int VERSION = (\d+);/, 'Link.VERSION'),
    ports: {
      server: (() => {
        const first = number(read(root, 'java-server/src/main/java/tabgoblin/McpMain.java'), /static final int DEFAULT_PORT = (\d+);/, 'DEFAULT_PORT');
        const rest = /static final List<Integer> FIRST = List\.of\(McpMain\.DEFAULT_PORT((?:, \d+)*)\);/.exec(read(root, 'java-server/src/main/java/tabgoblin/Ports.java'));
        if (!rest) throw new Error('Ports.FIRST: not found');
        return [first, ...rest[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number)];
      })(),
      extension: (() => {
        const m = /export const PORTS: readonly number\[\] = \[([\d, ]+)\];/.exec(read(root, 'chrome-extension/src/policy.ts'));
        if (!m) throw new Error('PORTS: not found');
        return m[1].split(',').map((s) => Number(s.trim()));
      })(),
    },
  };
}

/** Every finding in the tree under root: retired names, and numbers that disagree with their definition. */
export function findings(root = ROOT) {
  const found = [];
  const say = (path, line, what) => found.push({ file: relative(root, path).replaceAll('\\', '/'), line, what });
  let facts;
  try {
    facts = defined(root);
  } catch (e) {
    found.push({ file: '', line: 0, what: `a definition could not be read: ${e.message}` });
    return found;
  }
  if (facts.protocol.server !== facts.protocol.extension) {
    say(join(root, 'chrome-extension/src/protocol.ts'), 0, `PROTOCOL_VERSION is ${facts.protocol.extension}, Protocol.VERSION is ${facts.protocol.server}`);
  }
  if (facts.ports.server.join() !== facts.ports.extension.join()) {
    say(join(root, 'chrome-extension/src/policy.ts'), 0, `PORTS is ${facts.ports.extension.join(', ')}, Ports.FIRST is ${facts.ports.server.join(', ')}`);
  }
  const all = files(root);
  const names = new Set(all.map((path) => path.split(/[\\/]/).pop()));
  // The variables some part reads: named in a source, a script or a workflow, not in a page.
  const read = new Set();
  for (const path of all) {
    if (!/\.(md|txt|svg)$/.test(path)) for (const m of readFileSync(path, 'utf8').matchAll(VARIABLE)) read.add(m[0]);
  }
  for (const path of all) {
    const rel = relative(root, path).replaceAll('\\', '/');
    const lines = readFileSync(path, 'utf8').split('\n');
    const record = RECORDS.includes(rel);
    const page = rel.endsWith('.md') && !record;
    lines.forEach((text, i) => {
      if (page) {
        for (const m of text.matchAll(CODE_FILE)) {
          if (!names.has(m[1])) say(path, i + 1, `names ${m[1]}, and no file of that name is in the tree`);
        }
        for (const m of text.matchAll(VARIABLE)) {
          if (!read.has(m[0])) say(path, i + 1, `names ${m[0]}, which no part reads`);
        }
      }
      if (!record) {
        for (const { find, why, statedIn = [] } of RETIRED) {
          if (find.test(text) && !statedIn.includes(rel)) say(path, i + 1, `a retired name: ${why}`);
        }
      }
      // "protocol N" in a page, a skill, an example or a diagram's source is the protocol version as it is now.
      if (/\.(md|txt|mjs)$/.test(rel) && !rel.startsWith('docs/agents/')) {
        for (const m of text.matchAll(/\(protocol (\d+)\)|· protocol (\d+)\b/g)) {
          const said = Number(m[1] ?? m[2]);
          if (said !== facts.protocol.server) say(path, i + 1, `says protocol ${said}; the protocol version is ${facts.protocol.server}`);
        }
      }
      // The link's version, where the protocol reference quotes its messages.
      if (rel === 'docs/development.md') {
        for (const m of text.matchAll(/"link": (\d+)/g)) {
          if (Number(m[1]) !== facts.link) say(path, i + 1, `says link ${m[1]}; Link.VERSION is ${facts.link}`);
        }
      }
    });
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = findings();
  for (const f of found) console.log(f.file ? `${f.file}:${f.line}: ${f.what}` : f.what);
  if (found.length) {
    console.log(`${found.length} finding${found.length === 1 ? '' : 's'}`);
    process.exit(1);
  }
  const facts = defined();
  console.log(`no drift: protocol ${facts.protocol.server} in both parts, link ${facts.link}, ports ${facts.ports.server.join(', ')} in both parts, no retired name, every code file and variable the pages name is there`);
}
