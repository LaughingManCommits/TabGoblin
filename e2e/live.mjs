// Optional smoke check against real websites, to see the generic tools on real-world DOMs.
// Nothing is submitted: it reads, scrolls, takes a screenshot, follows one same-origin link and
// types into the first text box without sending it.
//
//   node live.mjs https://en.wikipedia.org/wiki/Web_browser https://news.ycombinator.com/

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { McpClient } from './mcp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JAR = resolve(HERE, '../java-server/target/browser-context-mcp.jar');
const EXTENSION = resolve(HERE, '../chrome-extension/dist');
const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('usage: node live.mjs <url> [<url> ...]');
  process.exit(2);
}

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

const work = mkdtempSync(join(tmpdir(), 'bcmcp-live-'));
const wsPort = await freePort();
const serverArgs = ['-jar', JAR, '--port', String(wsPort), '--token-file', join(work, 'pairing-token')];
const token = /Pairing token:\s*(\S+)/.exec(execFileSync('java', [...serverArgs, '--show-token'], { encoding: 'utf8' }))[1];
const mcp = new McpClient('java', serverArgs);
let browser;
let problems = 0;

try {
  await mcp.initialize();
  browser = await puppeteer.launch({
    ...(process.env.BCMCP_CHROME ? { executablePath: process.env.BCMCP_CHROME } : { channel: 'chrome' }),
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
  for (const url of urls) {
    console.log(`\n=== ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const popup = await freshPopup();
      if (!paired) {
        await popup.waitForFunction(() => !document.getElementById('pairing').hidden);
        await popup.type('#token', token);
        await popup.$eval('#port', (el, port) => { el.value = port; }, String(wsPort));
        await popup.click('#pair');
        await popup.waitForFunction(() => document.getElementById('connection').textContent === 'Connected');
        paired = true;
      }
      await popup.waitForFunction(() => !document.getElementById('authorizeBox').hidden && !document.getElementById('authorize').disabled);
      await popup.select('#newAccess', 'write');
      await popup.click('#authorize');
      await popup.waitForFunction(() => document.getElementById('authorizeBox').hidden);

      const timed = async (name, args) => {
        const started = Date.now();
        const result = await mcp.tool(name, args);
        return { ...result, ms: Date.now() - started };
      };
      const origin = new URL(page.url()).origin;
      console.log((await mcp.tool('browser_status')).text.split('\n').filter((l) => /origin|Access/.test(l)).join(' | '));

      const snap = await timed('browser_snapshot', {});
      if (snap.isError) throw new Error(snap.text);
      const lines = snap.text.split('\n');
      const count = (re) => lines.filter((l) => re.test(l)).length;
      console.log(`snapshot: ${lines.length} lines in ${snap.ms}ms (headings ${count(/\] Heading/)}, links ${count(/\] Link/)}, buttons ${count(/\] Button/)}, fields ${count(/\] (Textbox|Combobox|Checkbox|Radio)/)}, clickable ${count(/\] Clickable/)}, text ${count(/^Text:/)})`);
      console.log(lines.slice(0, 16).map((l) => `    ${l.slice(0, 110)}`).join('\n'));

      const extract = await timed('browser_extract', { max_chars: 3000 });
      console.log(`extract: ${extract.isError ? extract.text : extract.text.split('\n')[2]} in ${extract.ms}ms`);

      const scroll = await mcp.tool('browser_scroll', { direction: 'down' });
      console.log(`scroll: ${scroll.text.replace(/\s+/g, ' ')}`);
      const viewport = await mcp.tool('browser_snapshot', { viewport_only: true });
      console.log(`viewport snapshot after scroll: ${viewport.text.split('\n').length} lines`);

      const shot = await mcp.tool('browser_screenshot');
      console.log(`screenshot: ${shot.image ? `${shot.image.mimeType}, ${Math.round(shot.image.data.length * 0.75 / 1024)} KB` : shot.text}`);

      const field = lines.find((l) => /^\[\d+\] Textbox/.test(l) && !/read-only|disabled|value hidden/.test(l));
      if (field) {
        const fill = await mcp.tool('browser_fill', { ref: Number(/^\[(\d+)\]/.exec(field)[1]), text: 'hello from the agent' });
        console.log(`fill ${field.slice(0, 60)}: ${fill.text.replace(/\s+/g, ' ')}`);
      } else {
        console.log('fill: no text box in the snapshot');
      }

      const link = lines.find((l) => /^\[\d+\] Link: .+ -> \/[^#]/.test(l) && !l.includes('(external'));
      if (link) {
        const click = await mcp.tool('browser_click', { ref: Number(/^\[(\d+)\]/.exec(link)[1]) });
        console.log(`click ${link.slice(0, 70)}: ${click.text.replace(/\s+/g, ' ').slice(0, 200)}`);
        const after = await mcp.tool('browser_snapshot', { interactive_only: true });
        console.log(`after click: ${after.isError ? after.text : after.text.split('\n').slice(0, 2).join(' | ')}`);
      }
      const blocked = await mcp.tool('browser_navigate', { url: 'https://example.org/' });
      console.log(`navigate off-origin: ${blocked.text.slice(0, 90)}`);
      if (!blocked.text.includes('NAVIGATION_BLOCKED') || !new URL(page.url()).origin.startsWith(origin)) problems++;
      if (!shot.image) problems++;
    } catch (e) {
      problems++;
      console.log(`  PROBLEM: ${e.message}`);
    }
  }
} finally {
  await browser?.close().catch(() => undefined);
  await mcp.close().catch(() => undefined);
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // profile directory still being released
  }
}
console.log(problems ? `\n${problems} problem(s)` : '\nLive check finished without problems');
process.exit(problems ? 1 : 0);
