// Tries text entry on public pages that embed real editors, as deployed by their makers.
// Nothing is submitted anywhere: the pages are demos whose content lives in the tab.
//
//   node live.mjs                 all pages below
//   node live.mjs <url> [...]     your own
//
// Unlike run.mjs this cannot look into the editor's model; it checks that the page shows the
// text afterwards. Pages change and may be unreachable: treat a failure here as a lead, not a verdict.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { McpClient } from '../mcp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JAR = resolve(HERE, '../../java-server/target/tabgoblin.jar');
const EXTENSION = resolve(HERE, '../../chrome-extension/dist');

const PAGES = [
  'https://codemirror.net/try/',
  'https://microsoft.github.io/monaco-editor/playground.html',
  'https://ace.c9.io/build/kitchen-sink.html',
  'https://prosemirror.net/examples/basic/',
  'https://playground.lexical.dev/',
  'https://www.slatejs.org/examples/richtext',
  'https://quilljs.com/playground/snow',
  'https://ckeditor.com/ckeditor-5/demo/feature-rich/',
  'https://trix-editor.org/',
  'https://draftjs.org/',
  'https://editorjs.io/',
];
const urls = process.argv.slice(2).length ? process.argv.slice(2) : PAGES;
const MARK = 'TabGoblin was here 4711';

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
const freePort = () => new Promise((done) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});

const work = mkdtempSync(join(tmpdir(), 'tabgoblin-editors-live-'));
const wsPort = await freePort();
const serverArgs = ['-jar', JAR, '--port', String(wsPort), '--token-file', join(work, 'pairing-token')];
const token = /Pairing token:\s*(\S+)/.exec(execFileSync('java', [...serverArgs, '--show-token'], { encoding: 'utf8' }))?.[1];
const agent = new McpClient('java', serverArgs, 'editor-live');
let browser;
const rows = [];

try {
  await agent.initialize();
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
  const findPopup = async () => (await extension.pages()).find((p) => p.url().includes('popup.html'));

  let paired = false;
  for (const url of urls) {
    const row = { url, field: '', said: '', shown: '' };
    rows.push(row);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2500);
      const open = await findPopup();
      if (open) {
        await open.close();
        await until(async () => !(await findPopup()), 'the popup to close');
      }
      await page.bringToFront();
      await extension.triggerAction(page);
      const popup = await until(findPopup, 'the popup');
      await popup.waitForSelector('#connection');
      if (!paired) {
        await popup.type('#token', token);
        await popup.$eval('#port', (el, port) => { el.value = port; }, String(wsPort));
        await popup.click('#pair');
        await popup.waitForFunction(() => document.getElementById('connection').textContent.includes('agent connected'));
        paired = true;
      }
      await popup.waitForFunction(() => !document.getElementById('authorizeBox').hidden && !document.getElementById('authorize').disabled);
      await popup.select('#newAccess', 'write');
      await popup.click('#authorize');
      await popup.waitForFunction(() => document.getElementById('authorizeBox').hidden);
      await popup.close().catch(() => undefined);
      await page.bringToFront();

      const snapshot = await agent.tool('browser_snapshot', { interactive_only: true, max_lines: 400 });
      if (snapshot.isError) throw new Error(snapshot.text.split('\n')[0]);
      const fields = snapshot.text.split('\n')
        .filter((l) => /^\s*\[\d+\]\s+(Editor|Editable|Textbox)\b/.test(l) && !/search|filter|email|\(number\)|\(url\)/i.test(l));
      // The editor rather than a small box next to it: the kinds only editors have come first.
      const rank = (l) => (/\]\s+Editor\b/.test(l) ? 0 : /\]\s+Editable\b/.test(l) ? 1 : 2);
      const candidates = fields.sort((a, b) => rank(a) - rank(b)).slice(0, 4);
      if (process.env.VERBOSE) console.log(url + '\n' + candidates.map((l) => '    ' + l.trim().slice(0, 110)).join('\n'));
      if (!candidates.length) {
        row.field = 'no editor listed';
        continue;
      }
      // Independent of the extension: the page's own text, including shadow roots and frames of
      // the same origin, where demo pages like to put their editors.
      const shows = () => page.evaluate((mark) => {
        const texts = [];
        const collect = (doc) => {
          texts.push(doc.body?.innerText ?? '');
          for (const el of doc.querySelectorAll('*')) {
            if (el.shadowRoot) texts.push(...[...el.shadowRoot.children].map((c) => c.innerText ?? ''));
            if (el.localName === 'iframe') { try { if (el.contentDocument) collect(el.contentDocument); } catch { /* another origin */ } }
          }
        };
        collect(document);
        return texts.some((t) => t.split(String.fromCharCode(160)).join(' ').includes(mark));
      }, MARK);
      // A page may have several fields; the first that shows the text counts.
      for (const line of candidates) {
        row.field = line.trim().slice(0, 60);
        const ref = Number(/\[(\d+)\]/.exec(line)[1]);
        const result = await agent.tool('browser_fill', { ref, text: MARK });
        row.said = /Error \[(\w+)\]/.exec(result.text)?.[1]
          ?? (/"valueMatches"\s*:\s*true/.test(result.text) ? 'confirmed' : 'not confirmed');
        if (process.env.VERBOSE) {
          // Looks into shadow roots and frames of the same origin, where demo pages like to put editors.
          const dump = () => page.evaluate(() => {
            const all = (root) => [...root.querySelectorAll('*')].flatMap((el) => {
              let inner = [];
              if (el.shadowRoot) inner = all(el.shadowRoot);
              if (el.localName === 'iframe') { try { inner = el.contentDocument ? all(el.contentDocument) : []; } catch { /* another origin */ } }
              return [el, ...inner];
            });
            return all(document).filter((el) => el.matches('[contenteditable="true"], [contenteditable=""]')).slice(0, 4).map((el) => {
              const t = el.innerText ?? '';
              return `${el.localName}.${String(el.className).slice(0, 24)} length ${t.length}, mark at ${t.indexOf('TabGoblin was here')}, `
                + `blocks ${el.children.length}: ${JSON.stringify(t.slice(0, 50))} ... ${JSON.stringify(t.slice(-50))}`;
            }).join('\n      ');
          });
          console.log('  result: ' + result.text.replace(/\s+/g, ' ').slice(0, 260));
          console.log('  at once:\n      ' + await dump());
          await sleep(3000);
          console.log('  3 s later:\n      ' + await dump());
        }
        await sleep(600);
        const soon = await shows();
        await sleep(2500);
        const later = await shows();
        row.shown = soon && later ? 'yes' : soon ? 'at first, then gone' : later ? 'after a while' : 'no';
        if (later) break;
      }
    } catch (e) {
      row.said = `problem: ${String(e?.message ?? e).split('\n')[0].slice(0, 80)}`;
    }
  }
} finally {
  await browser?.close().catch(() => undefined);
  await agent.close().catch(() => undefined);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log('\npage | field used | tool said | page shows the text');
for (const row of rows) console.log(`${row.url} | ${row.field} | ${row.said} | ${row.shown}`);
