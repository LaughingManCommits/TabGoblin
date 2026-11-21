// Editor compatibility check: enters text into real rich-text and code editors through the whole
// TabGoblin chain (MCP client -> Java server -> extension in your Chrome) and compares what each
// editor's own model holds afterwards with what was asked for.
//
//   node run.mjs                 all editors, headless
//   ONLY=monaco,quill node run.mjs
//   HEADED=1 node run.mjs        watch it
//   BACKGROUND=1 node run.mjs    the page is in a background tab while the agent works, as when you
//                                look at another tab or have another window in front
//
// Exit code 1 if an editor that is expected to work (see EXPECTED below) fails a check, or if the
// tool reports success for text that did not arrive.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { McpClient } from '../mcp-client.mjs';
import { FIXTURES, startLab } from './lab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JAR = resolve(HERE, '../../java-server/target/browser-context-mcp.jar');
const EXTENSION = resolve(HERE, '../../chrome-extension/dist');
for (const path of [JAR, join(EXTENSION, 'manifest.json')]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}\nBuild first: mvn -f java-server/pom.xml package && (cd chrome-extension && npm run build)`);
    process.exit(2);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
function freePort() {
  return new Promise((done) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });
}

/** Editors differ in how they join blocks and pad lines; compare what a reader would call the text. */
const norm = (text) => String(text ?? '')
  .replace(/\r\n?/g, '\n').replace(/[​﻿]/g, '').replace(/ /g, ' ')
  .replace(/\n{2,}/g, '\n').replace(/\n+$/, '');

const INITIAL = 'Initial content';
const LONG = Array.from({ length: 120 }, (_, i) => `Sentence number ${i + 1} of a long paragraph.`).join(' ');

/** Each check starts on a freshly loaded page holding INITIAL. */
const CHECKS = [
  { id: 'replace', title: 'replace', run: async (t) => { await t.fill('Hello goblin'); return 'Hello goblin'; } },
  { id: 'append', title: 'append', run: async (t) => { await t.fill(' plus more', { append: true }); return INITIAL + ' plus more'; } },
  { id: 'lines', title: 'lines', run: async (t) => { await t.fill('line one\nline two\nline three'); return 'line one\nline two\nline three'; } },
  { id: 'code', title: 'brackets', run: async (t) => { const s = 'if (a[0] == "x") { return {b: 1}; }'; await t.fill(s); return s; } },
  { id: 'indent', title: 'indent', run: async (t) => { const s = 'function f() {\n  if (x) {\n    return 1;\n  }\n}'; await t.fill(s); return s; } },
  { id: 'unicode', title: 'unicode', run: async (t) => { const s = 'Zoë 日本語 👍 ¿qué? <b>&amp;</b>'; await t.fill(s); return s; } },
  { id: 'long', title: 'long', run: async (t) => { await t.fill(LONG); return LONG; } },
  { id: 'clear', title: 'clear', run: async (t) => { await t.fill(''); return ''; } },
  { id: 'type', title: 'type', run: async (t) => { await t.fill('Typed text', { method: 'type' }); return 'Typed text'; } },
  { id: 'key', title: 'keys', run: async (t) => { await t.fill('abc'); await t.key('d'); await t.key('e'); await t.key('Backspace'); return 'abcd'; } },
  // After Enter the keyboard may be in a new block: type where the focus is, as a user would.
  { id: 'enter', title: 'enter', run: async (t) => { await t.fill('abc'); await t.key('Enter'); await t.key('x', { focused: true }); return 'abc\nx'; } },
  // Most editors an agent meets are empty: a comment box, a new message.
  { id: 'empty', title: 'empty', run: async (t) => { await t.fill(''); await t.fill('Fresh text'); return 'Fresh text'; } },
  { id: 'emptylines', title: 'empty+ln', run: async (t) => { await t.fill(''); await t.fill('first\nsecond'); return 'first\nsecond'; } },
  // Replacing a document of several paragraphs: everything has to go, not just the last block.
  { id: 'shrink', title: 'shrink', run: async (t) => { await t.fill('one\ntwo\nthree'); await t.fill('Only this'); return 'Only this'; } },
  { id: 'twice', title: 'refill', run: async (t) => { await t.fill('first'); await t.fill('second'); return 'second'; } },
];

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const onlyChecks = process.env.CHECKS ? new Set(process.env.CHECKS.split(',')) : null;
const fixtures = FIXTURES.filter((f) => !only || only.has(f.id));
const checks = CHECKS.filter((c) => !onlyChecks || onlyChecks.has(c.id));

const work = mkdtempSync(join(tmpdir(), 'bcmcp-editors-'));
const lab = await startLab(0);
const wsPort = await freePort();
const serverArgs = ['-jar', JAR, '--port', String(wsPort), '--token-file', join(work, 'pairing-token')];
const token = /Pairing token:\s*(\S+)/.exec(execFileSync('java', [...serverArgs, '--show-token'], { encoding: 'utf8' }))?.[1];
const agent = new McpClient('java', serverArgs, 'editor-lab');
let browser;
const results = {};
let exitCode = 0;

try {
  await agent.initialize();
  browser = await puppeteer.launch({
    ...(process.env.BCMCP_CHROME ? { executablePath: process.env.BCMCP_CHROME } : { channel: 'chrome' }),
    headless: !process.env.HEADED,
    pipe: true,
    enableExtensions: true,
    userDataDir: join(work, 'profile'),
    defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
  });
  console.log(`Browser: ${await browser.version()}${process.env.BACKGROUND ? ' (page in a background tab)' : ''}`);
  const extensionId = await browser.installExtension(EXTENSION);
  const extension = (await browser.extensions()).get(extensionId);
  const page = (await browser.pages())[0] ?? await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e).split('\n')[0]));
  await page.goto(lab.origin + '/');

  // Pair and authorize through the real popup.
  await extension.triggerAction(page);
  const popup = await until(async () => (await extension.pages()).find((p) => p.url().includes('popup.html')), 'the popup');
  await popup.waitForSelector('#connection');
  await popup.type('#token', token);
  await popup.$eval('#port', (el, port) => { el.value = port; }, String(wsPort));
  await popup.click('#pair');
  await popup.waitForFunction(() => document.getElementById('connection').textContent === '1 agent connected');
  await popup.waitForFunction(() => !document.getElementById('authorizeBox').hidden && !document.getElementById('authorize').disabled);
  await popup.select('#newAccess', 'write');
  await popup.click('#authorize');
  await popup.waitForFunction(() => document.getElementById('authorizeBox').hidden);
  // The user of this lab does not want to be asked before each Enter: the setting for that is off.
  await popup.select('#askMode', 'never');
  await until(async () => (await agent.tool('browser_status')).text.includes('Submissions need user confirmation: no'), 'confirmations to be off');
  await popup.close().catch(() => undefined);
  await page.bringToFront();
  // In background mode each page is loaded in front, like a page the user opened, and then
  // another tab is brought forward: the lab page keeps running but is neither drawn nor focused.
  const front = process.env.BACKGROUND ? await browser.newPage() : null;

  const model = async () => norm(await page.evaluate(() => window.__lab.get()));

  for (const fixture of fixtures) {
    results[fixture.id] = {};
    for (const check of checks) {
      const outcome = { pass: false, said: [], detail: '' };
      results[fixture.id][check.id] = outcome;
      try {
        pageErrors.length = 0;
        if (front) await page.bringToFront();
        await page.goto(`${lab.origin}/e/${fixture.id}`);
        await page.waitForFunction(() => window.__lab, { timeout: 20000 });
        await sleep(250);
        if (front) {
          await front.bringToFront();
          await sleep(250);
        }
        const snapshot = (await agent.tool('browser_snapshot')).text;
        const line = snapshot.split('\n').find((l) => /^\s*\[\d+\]\s+(Textbox|Editable|Editor)\b/.test(l));
        if (!line) {
          outcome.detail = 'no text field listed in the snapshot';
          outcome.said.push('not listed');
          if (check === checks[0]) outcome.snapshot = snapshot.split('\n').slice(0, 30).join('\n');
          continue;
        }
        const ref = Number(/\[(\d+)\]/.exec(line)[1]);
        const record = (result) => {
          const code = /Error \[(\w+)\]/.exec(result.text)?.[1];
          const matched = /"valueMatches"\s*:\s*(true|false)/.exec(result.text)?.[1];
          // A key press says what it did in words. One the editor ignored, or one that could not
          // be confirmed, is the tool saying so.
          const effect = /"effect"\s*:\s*"([^"]*)"/.exec(result.text)?.[1] ?? '';
          const doubt = /could not be checked|may land in the wrong place|gave no sign of taking/.test(result.text);
          const key = /did not react|nothing on the page changed/.test(effect) ? 'no effect' : doubt ? 'unconfirmed' : 'done';
          outcome.said.push(code ?? (matched === 'true' ? 'ok' : matched === 'false' ? 'mismatch' : key));
          if (process.env.VERBOSE) console.log(`  ${fixture.id}/${check.id}: ${result.text.replace(/\s+/g, ' ').slice(0, 300)}`);
          return result;
        };
        const tools = {
          fill: async (text, opts = {}) => { record(await agent.tool('browser_fill', { ref, text, ...opts })); await sleep(200); },
          // To the tool, Enter in an editor is a submission: it may send what is written. The lab declares it.
          key: async (key, { focused = false } = {}) => {
            // The same text is entered in every editor, so the refusal of a repeat is lifted as well.
            const intent = key === 'Enter' ? { intent: 'submit', repeat: true } : {};
            record(await agent.tool('browser_press_key', { key, ...(focused ? {} : { ref }), ...intent }));
            await sleep(150);
          },
        };
        const expected = norm(await check.run(tools));
        const actual = await model();
        outcome.pass = actual === expected;
        if (!outcome.pass) {
          outcome.detail = `model holds ${JSON.stringify(actual.slice(0, 90))}${actual.length > 90 ? '…' : ''}`;
        }
        if (pageErrors.length) outcome.detail += `${outcome.detail ? '; ' : ''}page error: ${pageErrors[0].slice(0, 100)}`;
      } catch (e) {
        outcome.detail = `harness: ${String(e?.message ?? e).split('\n')[0].slice(0, 140)}`;
      }
    }
  }
} finally {
  await browser?.close().catch(() => undefined);
  await agent.close().catch(() => undefined);
  await lab.close();
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// A wrong answer the tool admits to is a limitation; one it reports as success is a defect.
const sure = (s) => s === 'ok' || s === 'done';
const silent = (o) => !o.pass && o.said.length > 0 && o.said.every(sure);
const doubted = (o) => o.pass && !o.said.every(sure);
const mark = (o) => (o.pass ? (doubted(o) ? 'ok?' : 'ok') : silent(o) ? 'SILENT' : o.said.includes('not listed') ? 'unlisted' : 'fail');

const width = Math.max(...fixtures.map((f) => f.name.length)) + 2;
console.log('\n' + ''.padEnd(width) + checks.map((c) => c.title.padEnd(9)).join(''));
for (const fixture of fixtures) {
  console.log(fixture.name.padEnd(width) + checks.map((c) => mark(results[fixture.id][c.id]).padEnd(9)).join(''));
}
console.log('\nok: the editor holds the text.  fail: it does not, and the tool said so.');
console.log('SILENT: it does not, but the tool reported success.  unlisted: the editor is not offered as a text field.');
console.log('ok?: the editor holds the text, but the tool could not confirm it.\n');

let passed = 0;
let total = 0;
for (const fixture of fixtures) {
  for (const check of checks) {
    const o = results[fixture.id][check.id];
    total++;
    if (o.pass) {
      passed++;
      if (doubted(o)) console.log(`${fixture.name} / ${check.title}: correct, but reported as unconfirmed  [tool: ${o.said.join(', ')}]`);
      continue;
    }
    console.log(`${fixture.name} / ${check.title}: ${o.detail}  [tool: ${o.said.join(', ') || 'nothing'}]`);
    if (o.snapshot) console.log(o.snapshot.split('\n').map((l) => '    ' + l).join('\n'));
    if (silent(o)) exitCode = 1;
  }
}
console.log(`\n${passed} of ${total} checks passed.`);
if (process.env.RESULTS) writeFileSync(process.env.RESULTS, JSON.stringify({ fixtures: fixtures.map(({ id, name, usedBy }) => ({ id, name, usedBy })), checks: checks.map(({ id, title }) => ({ id, title })), results }, null, 1));
process.exit(exitCode);
