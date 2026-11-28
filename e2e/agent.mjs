// Does a real model act on the cues in the tool results? This hands the MCP server to an actual
// agent (the `claude` CLI in print mode, with only the browser tools available) and gives it
// questions that cannot be answered from the first look at the page: the answer is collapsed,
// below the viewport, or only loaded on scroll. The prompts do not say how to get there.
//
//   node agent.mjs                 all tasks, model alias "sonnet"
//   AGENT_MODEL=haiku node agent.mjs
//
// Uses your Claude account and costs a few cents per run.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startDemo } from '../demo-site/server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JAR = resolve(HERE, '../java-server/target/tabgoblin.jar');
const EXTENSION = resolve(HERE, '../chrome-extension/dist');
const MODEL = process.env.AGENT_MODEL || 'sonnet';
const SERVER = 'browser-context';
const tool = (name) => `mcp__${SERVER}__${name}`;

const TASKS = [
  {
    name: 'answers hidden in collapsed sections',
    site: 'A',
    access: 'write',
    prompt: 'Using the browser tools, look at the web page the user has authorized and answer three questions: '
      + '(1) What does version 2.4 fix, according to the release notes? '
      + '(2) How many issues were closed this week? '
      + '(3) What is the last heading on the page? Reply with the three answers only.',
    expect: [/export/i, /\b12\b/, /footer/i],
  },
  {
    name: 'screenshots only, answer is below the fold',
    site: 'A',
    access: 'read',
    tools: ['browser_status', 'browser_screenshot', 'browser_scroll'],
    prompt: 'You can only look at the authorized web page through screenshots. '
      + 'What is the text of the link at the very bottom of the page? Reply with the link text only.',
    expect: [/about this tracker/i],
  },
  {
    name: 'list that loads more on scroll',
    site: 'B',
    access: 'read',
    prompt: 'Using the browser tools, list every note in the notes app the user has authorized. '
      + 'Make sure the list is complete. Reply with the note titles only.',
    expect: [/buy milk/i, /call the plumber/i, /renew passport/i],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
const freePort = () => new Promise((done) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});

/** Runs the agent once and returns its tool calls, the cues it was shown, and its answer. */
function runAgent(prompt, allowed, configPath, cwd) {
  const env = { ...process.env };
  delete env.CLAUDECODE; // allow starting the CLI from inside another Claude Code session
  const proc = spawn('claude', [
    '-p', '--model', MODEL, '--mcp-config', configPath, '--strict-mcp-config',
    '--tools', '', '--allowedTools', ...allowed,
    '--output-format', 'stream-json', '--verbose', '--max-turns', '30',
  ], { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stdin.end(prompt);

  const calls = [];
  const cues = new Set();
  let answer = '';
  let meta = {};
  let stderr = '';
  let buffer = '';
  proc.stderr.on('data', (c) => { stderr += c; });
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      for (const block of event.message?.content ?? []) {
        if (event.type === 'assistant' && block.type === 'tool_use') {
          const args = Object.entries(block.input ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
          calls.push(`${block.name.replace(`mcp__${SERVER}__browser_`, '')}${args ? ` ${args}` : ''}`);
        }
        if (event.type === 'user' && block.type === 'tool_result') {
          const text = JSON.stringify(block.content ?? '');
          const completeness = /Completeness: (PARTIAL|TRUNCATED|BLOCKED|UNKNOWN)/.exec(text);
          if (completeness) cues.add(`Completeness: ${completeness[1]}`);
          if (text.includes('shows only the visible viewport')) cues.add('screenshot coverage note');
          if (text.includes('loadedMore')) cues.add('loadedMore on scroll');
          if (text.includes('More below:')) cues.add('"More below" scroll line');
          if (text.includes('continue with offset')) cues.add('"continue with offset"');
        }
      }
      if (event.type === 'result') {
        answer = String(event.result ?? '');
        meta = { turns: event.num_turns, cost: event.total_cost_usd, isError: event.is_error };
      }
    }
  });
  return new Promise((done) => {
    const timer = setTimeout(() => proc.kill(), 300000);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      done({ calls, cues: [...cues], answer, meta, code, stderr });
    });
  });
}

const work = mkdtempSync(join(tmpdir(), 'tabgoblin-agent-'));
const wsPort = await freePort();
const serverArgs = ['-jar', JAR, '--port', String(wsPort), '--token-file', join(work, 'pairing-token')];
const token = /Pairing token:\s*(\S+)/.exec(execFileSync('java', [...serverArgs, '--show-token'], { encoding: 'utf8' }))[1];
const configPath = join(work, 'mcp.json');
writeFileSync(configPath, JSON.stringify({ mcpServers: { [SERVER]: { command: 'java', args: serverArgs } } }));
const demo = await startDemo(0, 0, 0);
let browser;
let failed = 0;

try {
  browser = await puppeteer.launch({
    ...(process.env.TABGOBLIN_CHROME ? { executablePath: process.env.TABGOBLIN_CHROME } : { channel: 'chrome' }),
    headless: !process.env.HEADED,
    pipe: true,
    enableExtensions: true,
    userDataDir: join(work, 'profile'),
    defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
  });
  const extensionId = await browser.installExtension(EXTENSION);
  const extension = (await browser.extensions()).get(extensionId);
  const page = (await browser.pages())[0] ?? await browser.newPage();

  /** Clicks the toolbar button on the page like a user. The popup stays open and keeps the
   *  extension reconnecting, so it finds the server as soon as the agent starts it. */
  async function freshPopup() {
    const find = async () => (await extension.pages()).find((p) => p.url().includes('popup.html'));
    const open = await find();
    if (open) {
      await open.close();
      await until(async () => !(await find()), 'popup to close');
    }
    await page.bringToFront();
    await extension.triggerAction(page);
    const popup = await until(find, 'popup');
    await popup.waitForSelector('#connection');
    return popup;
  }

  let paired = false;
  console.log(`Model: ${MODEL}`);
  for (const task of TASKS) {
    console.log(`\n=== ${task.name}`);
    await page.goto((task.site === 'A' ? demo.originA : demo.originB) + '/');
    const popup = await freshPopup();
    if (!paired) {
      await popup.waitForFunction(() => !document.getElementById('pairing').hidden);
      await popup.type('#token', token);
      // The popup has no port: the server here is on a port of its own, which goes into the extension's storage.
      const worker = await (async () => { for (;;) { const w = (await extension.workers())[0]; if (w) return w; await new Promise((r) => setTimeout(r, 100)); } })();
      await worker.evaluate((p) => chrome.storage.local.set({ port: p }), wsPort);
      await popup.click('#pair');
      paired = true;
    }
    // On the site of the previous task the tab's session is still there and only the access level
    // changes. On another site that session is suspended, and the tab is authorized afresh.
    await sleep(1000); // one refresh of the popup's state
    const authorizable = await popup.$eval('#authorizeBox', (el) => !el.hidden);
    if (authorizable) {
      await popup.waitForFunction(() => !document.getElementById('authorize').disabled);
      await popup.select('#newAccess', task.access);
      await popup.click('#authorize');
      await popup.waitForFunction(() => document.getElementById('authorizeBox').hidden);
    } else {
      const existing = await popup.evaluate(() => [...document.querySelectorAll('.session')]
        .find((row) => [...row.querySelectorAll('.chip')].some((c) => c.textContent === 'this tab')).dataset.session);
      await popup.$eval(`.session[data-session="${existing}"] .mode`, (el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('change'));
      }, task.access);
    }
    await sleep(300);
    await page.bringToFront();

    const allowed = task.tools ? task.tools.map(tool) : [`mcp__${SERVER}`];
    const run = await runAgent(task.prompt, allowed, configPath, work);
    const missing = task.expect.filter((re) => !re.test(run.answer));
    const ok = missing.length === 0 && !run.meta.isError;
    if (!ok) failed++;

    console.log(`prompt: ${task.prompt}`);
    console.log(`tool calls (${run.calls.length}):`);
    for (const call of run.calls) console.log(`  - ${call.slice(0, 120)}`);
    console.log(`cues the agent was shown: ${run.cues.join(', ') || 'none'}`);
    console.log(`answer: ${run.answer.replace(/\s+/g, ' ').slice(0, 400)}`);
    console.log(`${ok ? 'PASS' : 'FAIL'}${missing.length ? ` (missing ${missing.map(String).join(', ')})` : ''}`
      + ` | turns ${run.meta.turns ?? '?'} | cost $${run.meta.cost?.toFixed?.(3) ?? '?'}`);
    if (!run.answer) console.log(`  agent exit ${run.code}; stderr: ${run.stderr.slice(0, 600)}`);
  }
} finally {
  await browser?.close().catch(() => undefined);
  await demo.close();
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // profile directory still being released
  }
}
console.log(`\n${TASKS.length - failed} of ${TASKS.length} tasks answered correctly`);
process.exit(failed ? 1 : 0);
