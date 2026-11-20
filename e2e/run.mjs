// End-to-end check of the whole chain, with nothing mocked:
//
//   MCP stdio client -> Java MCP server -> localhost WebSocket -> extension in Chrome -> demo site
//
// The extension is loaded unmodified into your installed Chrome (fresh temporary profile) and its
// toolbar button is triggered like a user click, so the real activeTab authorization is exercised.
//
//   node run.mjs            headless
//   HEADED=1 node run.mjs   watch it run
//   BCMCP_CHROME=<path>     use a specific Chrome/Chromium binary

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startDemo } from '../demo-site/server.mjs';
import { McpClient } from './mcp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JAR = resolve(HERE, '../java-server/target/browser-context-mcp.jar');
const EXTENSION = resolve(HERE, '../chrome-extension/dist');
const EXTENSION_ID = 'hipkpjlbggddmiognhmjnfihcgimjfop';
const ENTERED_TEXT = 'Reproduced on build 512 - e2e-unique-comment';

for (const [what, path] of [['Java server jar', JAR], ['extension build', join(EXTENSION, 'manifest.json')]]) {
  if (!existsSync(path)) {
    console.error(`Missing ${what}: ${path}\nBuild first: mvn -f java-server/pom.xml package && (cd chrome-extension && npm run build)`);
    process.exit(2);
  }
}

let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(e?.message ?? e).split('\n').join('\n        ')}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function has(text, needle) {
  assert(text.includes(needle), `expected to find ${JSON.stringify(needle)} in:\n${text.slice(0, 1500)}`);
}
function lacks(text, needle) {
  assert(!text.includes(needle), `did not expect ${JSON.stringify(needle)} in:\n${text.slice(0, 1500)}`);
}
/** The ref number of the snapshot line containing `fragment`, e.g. ref(snap, 'Button: Search'). */
function ref(snapshot, fragment) {
  const line = snapshot.split('\n').find((l) => l.includes(fragment));
  const m = line && /^\[(\d+)\]/.exec(line);
  assert(m, `no snapshot line with a ref matching ${JSON.stringify(fragment)} in:\n${snapshot.slice(0, 2500)}`);
  return Number(m[1]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, timeoutMs = 8000) {
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

const work = mkdtempSync(join(tmpdir(), 'bcmcp-e2e-'));
const tokenFile = join(work, 'pairing-token');
const wsPort = await freePort();
const serverArgs = ['-jar', JAR, '--port', String(wsPort), '--token-file', tokenFile];

const demo = await startDemo(0, 0);
const shown = execFileSync('java', [...serverArgs, '--show-token'], { encoding: 'utf8' });
const token = /Pairing token:\s*(\S+)/.exec(shown)?.[1];
const mcp = new McpClient('java', serverArgs);
let browser;

try {
  console.log('\nMCP server');
  await step('server starts and answers initialize over stdio', async () => {
    assert(token && token.length >= 32, '--show-token printed no token');
    const init = await mcp.initialize();
    assert(init.serverInfo.name === 'browser-context-mcp', `unexpected serverInfo ${JSON.stringify(init.serverInfo)}`);
  });
  await step('lists exactly the nine generic tools', async () => {
    const { tools } = await mcp.request('tools/list');
    const names = tools.map((t) => t.name).sort().join(',');
    assert(names === 'browser_click,browser_extract,browser_fill,browser_navigate,browser_screenshot,browser_scroll,browser_snapshot,browser_status,browser_wait_for', names);
  });
  await step('reports clearly when no extension is connected', async () => {
    has((await mcp.tool('browser_status')).text, 'Extension: not connected');
    const snap = await mcp.tool('browser_snapshot');
    assert(snap.isError, 'snapshot should fail');
    has(snap.text, 'Error [NOT_CONNECTED]');
  });

  console.log('\nChrome + extension');
  browser = await puppeteer.launch({
    ...(process.env.BCMCP_CHROME ? { executablePath: process.env.BCMCP_CHROME } : { channel: 'chrome' }),
    headless: !process.env.HEADED,
    pipe: true,
    enableExtensions: true,
    userDataDir: join(work, 'profile'),
    defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
  });
  console.log(`  (browser: ${await browser.version()})`);
  const extensionId = await browser.installExtension(EXTENSION);
  const extension = (await browser.extensions()).get(extensionId);
  const page = (await browser.pages())[0] ?? await browser.newPage();
  await page.goto(demo.originA + '/');

  /** Clicks the extension's toolbar button for `page`, like the user would, and returns the popup. */
  async function openPopup({ fresh = false } = {}) {
    const find = async () => (await extension.pages()).find((p) => p.url().includes('popup.html'));
    let popup = await find();
    // A real popup closes as soon as the user clicks elsewhere. Chrome grants the extension access
    // to a tab only on a new click of its toolbar button, so authorizing always starts from one.
    if (popup && fresh) {
      await popup.close();
      await until(async () => !(await find()), 'the popup to close');
      popup = undefined;
    }
    if (!popup) {
      await page.bringToFront();
      await extension.triggerAction(page);
      popup = await until(find, 'the extension popup');
    }
    await popup.waitForSelector('#connection');
    return popup;
  }
  const popupText = async (popup, selector) => popup.$eval(selector, (el) => el.textContent.trim());
  async function authorize(access) {
    const popup = await openPopup({ fresh: true });
    await popup.waitForFunction(() => !document.getElementById('authorizeBox').hidden && !document.getElementById('authorize').disabled);
    await popup.select('#newAccess', access);
    await popup.click('#authorize');
    await popup.waitForFunction(() => document.getElementById('authorizeBox').hidden);
    return popup;
  }
  async function worker() {
    return until(async () => (await extension.workers())[0], 'the extension service worker');
  }
  const badge = async () => (await worker()).evaluate(() => chrome.action.getBadgeText({}));

  await step('extension id is the pinned one and it asks for no forbidden permission', async () => {
    assert(extensionId === EXTENSION_ID, `extension id is ${extensionId}`);
    const manifest = await (await worker()).evaluate(() => chrome.runtime.getManifest());
    const all = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? []), ...(manifest.optional_permissions ?? [])];
    for (const forbidden of ['cookies', 'webRequest', 'debugger', 'history', '<all_urls>']) {
      assert(!all.includes(forbidden), `manifest requests ${forbidden}`);
    }
    assert(!manifest.content_scripts, 'no content script should be registered for every page');
  });

  await step('a wrong pairing token is rejected', async () => {
    const popup = await openPopup();
    await popup.waitForFunction(() => !document.getElementById('pairing').hidden);
    await popup.type('#token', 'f'.repeat(64));
    await popup.$eval('#port', (el, port) => { el.value = port; }, String(wsPort));
    await popup.click('#pair');
    await popup.waitForFunction(() => document.getElementById('connection').textContent.includes('Pairing failed'));
    has((await mcp.tool('browser_status')).text, 'Extension: not connected');
  });
  await step('pairs with the real token over the authenticated WebSocket', async () => {
    const popup = await openPopup();
    await popup.type('#token', token);
    await popup.$eval('#port', (el, port) => { el.value = port; }, String(wsPort));
    await popup.click('#pair');
    await popup.waitForFunction(() => document.getElementById('connection').textContent === 'Connected');
    has((await mcp.tool('browser_status')).text, 'Extension: connected');
  });
  await step('nothing is readable before the user authorizes an origin', async () => {
    has((await mcp.tool('browser_status')).text, 'Authorized origin: none');
    for (const [tool, args] of [['browser_snapshot', {}], ['browser_extract', {}], ['browser_screenshot', {}], ['browser_navigate', { url: '/' }]]) {
      const r = await mcp.tool(tool, args);
      assert(r.isError, `${tool} should fail`);
      has(r.text, 'Error [NOT_AUTHORIZED]');
    }
  });

  console.log('\nSite A, read access');
  let snap;
  await step('user authorizes the current origin (read only) from the popup', async () => {
    const popup = await authorize('read');
    has(await popupText(popup, '#origin'), new URL(demo.originA).host);
    const status = (await mcp.tool('browser_status')).text;
    has(status, `Authorized origin: ${demo.originA}`);
    has(status, 'Access: read only');
    assert(await badge() === 'ON', `badge is ${await badge()}`);
  });
  await step('snapshot lists headings, links, buttons and fields with refs', async () => {
    snap = (await mcp.tool('browser_snapshot')).text;
    has(snap, 'Page: Demo Tracker: Issues');
    has(snap, `URL: ${demo.originA}/`);
    for (const line of ['Heading (h1): Issues', 'Link: Settings -> /page2.html', 'Textbox (search): Search issues',
      'Button: Search', 'Toggle: Release notes (collapsed)', 'Button: Show statistics (collapsed)',
      'Textbox (multiline): Comment', 'Checkbox: Notify watchers (unchecked)', 'Combobox: Priority = "Normal"',
      'Button: Post comment (submits form)', 'Text: Welcome back. You have 3 open issues.', '(external: ']) {
      has(snap, line);
    }
    assert(/^\[\d+\] Heading \(h1\): Issues$/m.test(snap), 'heading line should carry a ref');
    // Cues for what the snapshot could not include.
    has(snap, 'Not shown: 2 collapsed controls');
    has((await mcp.tool('browser_extract')).text, 'Not shown: 2 collapsed controls');
    has((await mcp.tool('browser_snapshot', { viewport_only: true })).text, 'Outside this viewport: 0px above, ');
  });
  await step('snapshot leaves out passwords, hidden inputs, scripts and invisible content', async () => {
    has(snap, 'Password: Password (value hidden)');
    for (const secret of ['hunter2', 'HIDDEN-CSRF-TOKEN', 'SCRIPT-CONTENT-SECRET', 'DISPLAY-NONE-TEXT', 'Hidden button',
      'VISIBILITY-HIDDEN-TEXT', 'COLLAPSED-TEXT', 'Collapsed link', 'Version 2.4', 'Statistics: 12', '<div', 'csrf']) {
      lacks(snap, secret);
    }
  });
  await step('extract returns visible text and headings, without secrets', async () => {
    const text = (await mcp.tool('browser_extract')).text;
    has(text, '# Issues');
    has(text, 'Login page shows a blank screen');
    has(text, '## Add a comment');
    for (const secret of ['hunter2', 'HIDDEN-CSRF-TOKEN', 'SCRIPT-CONTENT-SECRET', 'DISPLAY-NONE-TEXT', 'Version 2.4']) lacks(text, secret);
    const paged = (await mcp.tool('browser_extract', { max_chars: 100, offset: 20 })).text;
    has(paged, 'Text: characters 20-120 of ');
    has(paged, 'continue with offset=120');
  });
  await step('read access cannot press buttons or type', async () => {
    const click = await mcp.tool('browser_click', { ref: ref(snap, 'Button: Search') });
    has(click.text, 'Error [WRITE_NOT_AUTHORIZED]');
    const fill = await mcp.tool('browser_fill', { ref: ref(snap, 'Textbox (search)'), text: 'x' });
    has(fill.text, 'Error [WRITE_NOT_AUTHORIZED]');
    const submit = await mcp.tool('browser_click', { ref: ref(snap, 'Button: Post comment'), intent: 'submit' });
    has(submit.text, 'Error [WRITE_NOT_AUTHORIZED]');
    lacks((await mcp.tool('browser_extract')).text, 'result(s) for');
  });
  await step('read access can open disclosure toggles and follow same-origin links', async () => {
    const toggled = await mcp.tool('browser_click', { ref: ref(snap, 'Toggle: Release notes') });
    assert(!toggled.isError, toggled.text);
    has((await mcp.tool('browser_extract')).text, 'Version 2.4 fixes the export bug');
    const click = await mcp.tool('browser_click', { ref: ref(snap, 'Link: Settings') });
    assert(!click.isError, click.text);
    has(click.text, '"navigated" : true');
    const page2 = (await mcp.tool('browser_snapshot')).text;
    has(page2, 'Page: Demo Tracker: Settings');
    has(page2, 'Text: Theme | Light');
  });
  await step('refs from the previous document are rejected as stale', async () => {
    const stale = await mcp.tool('browser_click', { ref: ref(snap, 'Toggle: Release notes') });
    has(stale.text, 'Error [STALE_REF]');
  });
  await step('navigates within the origin: relative and absolute URLs', async () => {
    const rel = await mcp.tool('browser_navigate', { url: 'issue.html?id=2' });
    assert(!rel.isError, rel.text);
    has((await mcp.tool('browser_extract')).text, 'Details for issue number 2');
    const abs = await mcp.tool('browser_navigate', { url: `${demo.originA}/` });
    assert(!abs.isError, abs.text);
    snap = (await mcp.tool('browser_snapshot')).text;
    has(snap, 'Page: Demo Tracker: Issues');
  });
  await step('rejects navigation outside the origin (other port, other host, other scheme)', async () => {
    for (const url of [`${demo.originB}/`, 'https://example.com/', `http://localhost:${new URL(demo.originA).port}/`,
      'javascript:alert(1)', 'file:///C:/Windows/win.ini', `//example.com/x`]) {
      const r = await mcp.tool('browser_navigate', { url });
      assert(r.isError, `navigate to ${url} should fail: ${r.text}`);
      has(r.text, 'Error [NAVIGATION_BLOCKED]');
    }
    const external = await mcp.tool('browser_click', { ref: ref(snap, 'Link: Notes app') });
    has(external.text, 'Error [NAVIGATION_BLOCKED]');
    assert(page.url() === `${demo.originA}/`, `tab moved to ${page.url()}`);
    has((await mcp.tool('browser_status')).text, `Authorized origin: ${demo.originA}`);
  });
  await step('scrolls the page and reports position', async () => {
    const down = JSON.parse((await mcp.tool('browser_scroll', { direction: 'bottom' })).text);
    assert(down.moved && down.atBottom && down.y > 500, JSON.stringify(down));
    const viewport = (await mcp.tool('browser_snapshot', { viewport_only: true })).text;
    has(viewport, 'Heading (h2): Footer');
    lacks(viewport, 'Heading (h1): Issues');
    const up = JSON.parse((await mcp.tool('browser_scroll', { direction: 'top' })).text);
    assert(up.atTop && up.y === 0, JSON.stringify(up));
    const toFooter = JSON.parse((await mcp.tool('browser_scroll', { ref: ref(viewport, 'Heading (h2): Footer') })).text);
    assert(toFooter.target === 'element-into-view' && toFooter.y > 500, JSON.stringify(toFooter));
    await mcp.tool('browser_scroll', { direction: 'top' });
  });
  await step('captures the viewport as an MCP image', async () => {
    await page.bringToFront();
    const shot = await mcp.tool('browser_screenshot');
    assert(shot.image, `no image: ${shot.text}`);
    assert(shot.image.mimeType === 'image/jpeg', shot.image.mimeType);
    const bytes = Buffer.from(shot.image.data, 'base64');
    assert(bytes.length > 5000 && bytes[0] === 0xff && bytes[1] === 0xd8, `not a JPEG (${bytes.length} bytes)`);
    // The image comes with a note saying how much of the page it covers.
    has(shot.text, 'This image shows only the visible viewport: 0-');
    assert(/Not in the image: 0px above and [1-9]\d*px below/.test(shot.text), shot.text);
  });

  console.log('\nSite A, read / write access');
  await step('user switches access to Read / Write', async () => {
    const popup = await openPopup();
    await popup.select('#access', 'write');
    await until(async () => (await mcp.tool('browser_status')).text.includes('Access: read/write'), 'write access');
  });
  await step('fills a field and clicks a button (search)', async () => {
    snap = (await mcp.tool('browser_snapshot')).text;
    const fill = JSON.parse((await mcp.tool('browser_fill', { ref: ref(snap, 'Textbox (search)'), text: 'export' })).text);
    assert(fill.filled && fill.valueMatches, JSON.stringify(fill));
    const click = await mcp.tool('browser_click', { ref: ref(snap, 'Button: Search') });
    assert(!click.isError, click.text);
    const after = (await mcp.tool('browser_snapshot')).text;
    has(after, 'Text: 1 result(s) for "export"');
    has(after, 'Textbox (search): Search issues = "export"');
    has(after, 'Export to CSV drops the last row');
    lacks(after, 'Dark mode contrast');
  });
  await step('expands content, and the changed control gets a fresh identity', async () => {
    const toggle = ref(snap, 'Button: Show statistics');
    const click = await mcp.tool('browser_click', { ref: toggle });
    assert(!click.isError, click.text);
    const after = (await mcp.tool('browser_snapshot')).text;
    has(after, 'Button: Hide statistics (expanded)');
    has(after, 'Statistics: 12 issues closed this week');
    const again = await mcp.tool('browser_click', { ref: toggle });
    assert(!again.isError, `same element, re-snapshotted, should still be clickable: ${again.text}`);
    const stale = await mcp.tool('browser_click', { ref: toggle });
    has(stale.text, 'Error [STALE_REF]');
  });
  await step('waits for dynamically loaded content', async () => {
    snap = (await mcp.tool('browser_snapshot')).text;
    await mcp.tool('browser_click', { ref: ref(snap, 'Button: Load updates') });
    const waited = await mcp.tool('browser_wait_for', { text: 'build 512 passed', timeout_ms: 5000 });
    assert(!waited.isError, waited.text);
    const gone = await mcp.tool('browser_wait_for', { text: 'Loading…', gone: true, timeout_ms: 2000 });
    assert(!gone.isError, gone.text);
    const never = await mcp.tool('browser_wait_for', { text: 'this never appears', timeout_ms: 600 });
    has(never.text, 'Error [WAIT_TIMEOUT]');
    const byRef = await mcp.tool('browser_wait_for', { ref: ref(snap, 'Button: Load updates'), timeout_ms: 1000 });
    assert(!byRef.isError, byRef.text);
  });
  await step('selects an option and ticks a checkbox', async () => {
    const select = JSON.parse((await mcp.tool('browser_fill', { ref: ref(snap, 'Combobox: Priority'), text: 'High' })).text);
    assert(select.filled && select.valueMatches, JSON.stringify(select));
    const tick = await mcp.tool('browser_click', { ref: ref(snap, 'Checkbox: Notify watchers') });
    assert(!tick.isError, tick.text);
    const after = (await mcp.tool('browser_snapshot', { interactive_only: true })).text;
    has(after, 'Combobox: Priority = "High"');
    has(after, 'Checkbox: Notify watchers (checked)');
    lacks(after, 'Text: ');
  });
  await step('password fields cannot be filled and unsupported targets say so', async () => {
    const pw = await mcp.tool('browser_fill', { ref: ref(snap, 'Password: Password'), text: 'guess' });
    has(pw.text, 'Error [SENSITIVE_FIELD]');
    const button = await mcp.tool('browser_fill', { ref: ref(snap, 'Button: Load updates'), text: 'x' });
    has(button.text, 'Error [UNSUPPORTED_ELEMENT]');
    const checkbox = await mcp.tool('browser_fill', { ref: ref(snap, 'Checkbox: Notify watchers'), text: 'x' });
    has(checkbox.text, 'Error [UNSUPPORTED_ELEMENT]');
    const unknown = await mcp.tool('browser_click', { ref: 999999 });
    has(unknown.text, 'Error [STALE_REF]');
    assert(await page.$eval('#pw', (el) => el.value) === 'hunter2-secret-password', 'password field was modified');
  });

  console.log('\nSubmission');
  const commentRef = () => ref(snap, 'Textbox (multiline): Comment');
  const postRef = () => ref(snap, 'Button: Post comment');
  await step('filling does not submit, and a submit control needs explicit intent', async () => {
    const fill = JSON.parse((await mcp.tool('browser_fill', { ref: commentRef(), text: ENTERED_TEXT })).text);
    assert(fill.filled && fill.valueMatches, JSON.stringify(fill));
    const plain = await mcp.tool('browser_click', { ref: postRef() });
    has(plain.text, 'Error [SUBMIT_INTENT_REQUIRED]');
    const heuristic = await mcp.tool('browser_click', { ref: ref(snap, 'Button: Delete draft') });
    has(heuristic.text, 'Error [SUBMIT_INTENT_REQUIRED]');
    await sleep(500);
    lacks((await mcp.tool('browser_extract')).text, 'Comment posted');
    assert(await page.$eval('#comment', (el) => el.value) === ENTERED_TEXT, 'draft should be untouched');
  });
  await step('the user can decline a submission in the popup', async () => {
    const pending = mcp.tool('browser_click', { ref: postRef(), intent: 'submit' });
    const popup = await until(async () => {
      const p = await openPopup();
      return (await p.$eval('#confirm', (el) => !el.hidden)) ? p : null;
    }, 'the confirmation prompt');
    has(await popupText(popup, '#confirmLabel'), 'Post comment');
    assert(await badge() === '?', `badge is ${await badge()}`);
    await popup.click('#deny');
    has((await pending).text, 'Error [SUBMIT_DENIED]');
    await sleep(500);
    lacks((await mcp.tool('browser_extract')).text, 'Comment posted');
  });
  await step('with explicit intent and user confirmation the comment is submitted exactly once', async () => {
    const pending = mcp.tool('browser_click', { ref: postRef(), intent: 'submit' });
    const popup = await until(async () => {
      const p = await openPopup();
      return (await p.$eval('#confirm', (el) => !el.hidden)) ? p : null;
    }, 'the confirmation prompt');
    await popup.click('#allow');
    const result = await pending;
    assert(!result.isError, result.text);
    has(result.text, '"dispatched" : true');
    const waited = await mcp.tool('browser_wait_for', { text: 'Comment posted', timeout_ms: 5000 });
    assert(!waited.isError, waited.text);
    const text = (await mcp.tool('browser_extract')).text;
    has(text, `${ENTERED_TEXT} (priority: high, watchers notified)`);
    has(text, 'Comment posted. Total posts: 1');
  });
  await step('with confirmation switched off, explicit intent alone submits', async () => {
    const popup = await openPopup();
    await popup.click('#confirmSubmissions');
    await until(async () => (await mcp.tool('browser_status')).text.includes('Submissions need user confirmation: no'), 'setting');
    await mcp.tool('browser_fill', { ref: commentRef(), text: 'second comment' });
    const result = await mcp.tool('browser_click', { ref: postRef(), intent: 'submit' });
    assert(!result.isError, result.text);
    await mcp.tool('browser_wait_for', { text: 'Total posts: 2', timeout_ms: 5000 });
    has((await mcp.tool('browser_extract')).text, 'Comment posted. Total posts: 2');
    await popup.click('#confirmSubmissions');
    await until(async () => (await mcp.tool('browser_status')).text.includes('Submissions need user confirmation: yes'), 'setting');
  });

  console.log('\nActivity panel, pause, revoke');
  await step('popup shows generic recent activity and never the entered text', async () => {
    const popup = await openPopup();
    await sleep(900);
    const items = await popup.$$eval('#activity li', (els) => els.map((el) => el.textContent.trim()));
    assert(items.length >= 1 && items.length <= 6, `activity shows ${items.length} entries: ${items.join(' / ')}`);
    assert(items.some((i) => /Extracted text|Submitted|Waited for content|Entered text|Read page/.test(i)), items.join(' / '));
    const whole = await popup.$eval('body', (el) => el.innerText);
    for (const leak of [ENTERED_TEXT, 'second comment', 'export', token, 'Login page shows']) lacks(whole, leak);
  });
  await step('badge shows a running operation', async () => {
    const pending = mcp.tool('browser_wait_for', { text: 'never-there', timeout_ms: 1500 });
    await sleep(500);
    const during = await badge();
    await pending;
    assert(during === 'RUN', `badge during an operation was ${during}`);
    assert(await badge() === 'ON', `badge afterwards is ${await badge()}`);
    const popup = await openPopup();
    await sleep(900);
    has(await popup.$eval('#activity', (el) => el.innerText), 'Waiting for content');
  });
  await step('pause blocks every command until resumed', async () => {
    const popup = await openPopup();
    await popup.click('#pause');
    await popup.waitForFunction(() => document.getElementById('pause').textContent === 'Resume');
    for (const [tool, args] of [['browser_snapshot', {}], ['browser_click', { ref: postRef() }], ['browser_navigate', { url: '/' }], ['browser_screenshot', {}]]) {
      has((await mcp.tool(tool, args)).text, 'Error [PAUSED]');
    }
    has((await mcp.tool('browser_status')).text, 'Paused: yes');
    assert(await badge() === 'II', `badge is ${await badge()}`);
    await popup.click('#pause');
    await popup.waitForFunction(() => document.getElementById('pause').textContent === 'Pause');
    assert(!(await mcp.tool('browser_snapshot')).isError, 'snapshot should work after resume');
  });

  console.log('\nLeaving the origin');
  await step('a click that leaves the origin ends agent access immediately', async () => {
    snap = (await mcp.tool('browser_snapshot')).text;
    const click = await mcp.tool('browser_click', { ref: ref(snap, 'Link: Partner portal') });
    has(click.text, '"leftAuthorizedOrigin" : true');
    assert(page.url().startsWith(demo.originB), `tab is at ${page.url()}`);
    for (const tool of ['browser_snapshot', 'browser_extract', 'browser_screenshot']) {
      const r = await mcp.tool(tool);
      assert(r.isError, `${tool} should fail after leaving the origin`);
      has(r.text, 'Error [NOT_AUTHORIZED]');
    }
    has((await mcp.tool('browser_status')).text, 'Authorized origin: none');
    assert(await badge() === '', `badge is ${await badge()}`);
  });
  await step('returning to the site does not restore access: the user must authorize again', async () => {
    await page.goto(demo.originA + '/');
    has((await mcp.tool('browser_snapshot')).text, 'Error [NOT_AUTHORIZED]');
    await authorize('write');
    has((await mcp.tool('browser_snapshot')).text, 'Page: Demo Tracker: Issues');
  });
  await step('a redirect out of the origin during navigate ends access too', async () => {
    const nav = await mcp.tool('browser_navigate', { url: '/redirect-out' });
    has(nav.text, 'Error [ORIGIN_MISMATCH]');
    has((await mcp.tool('browser_snapshot')).text, 'Error [NOT_AUTHORIZED]');
  });
  await step('when the user navigates the tab away, access ends without any agent command', async () => {
    await page.goto(demo.originA + '/');
    await authorize('read');
    await page.goto(demo.originB + '/');
    await until(async () => (await badge()) === '', 'access to be revoked');
    has((await mcp.tool('browser_status')).text, 'Authorized origin: none');
  });
  await step('revoke removes access; closing the tab does as well', async () => {
    await page.goto(demo.originA + '/');
    const popup = await authorize('write');
    await popup.click('#revoke');
    await until(async () => (await mcp.tool('browser_snapshot')).text.includes('Error [NOT_AUTHORIZED]'), 'revocation');
    has(await popupText(popup, '#origin'), 'Not authorized');
  });

  console.log('\nSite B: a structurally different site, same tools');
  await step('authorize the second site and read its div-based UI', async () => {
    await page.goto(demo.originB + '/');
    await authorize('write');
    snap = (await mcp.tool('browser_snapshot')).text;
    for (const line of ['Page: Notes App', 'Tab: Notes (selected)', 'Tab: Archive', 'Heading (h1): My notes',
      'Clickable: Buy milk', 'Clickable: Call the plumber', 'Textbox: New note', 'Checkbox: Pin to top (unchecked)',
      'Button: Save note', 'Text: Shadow summary: 2 notes in this view.']) {
      has(snap, line);
    }
  });
  await step('clicks ARIA tabs and click-handler divs; in-page route changes keep access', async () => {
    const tab = await mcp.tool('browser_click', { ref: ref(snap, 'Tab: Archive') });
    assert(!tab.isError, tab.text);
    has(tab.text, '/archive');
    const archive = (await mcp.tool('browser_snapshot')).text;
    has(archive, 'Heading (h1): Archived notes');
    has(archive, 'Clickable: Old idea');
    const card = await mcp.tool('browser_click', { ref: ref(archive, 'Clickable: Old idea') });
    assert(!card.isError, card.text);
    has((await mcp.tool('browser_extract')).text, 'Opened note: Old idea');
    await mcp.tool('browser_click', { ref: ref(archive, 'Tab: Notes') });
    snap = (await mcp.tool('browser_snapshot')).text;
    has(snap, 'Heading (h1): My notes');
  });
  await step('fills a contenteditable editor, toggles a custom checkbox and saves', async () => {
    const fill = JSON.parse((await mcp.tool('browser_fill', { ref: ref(snap, 'Textbox: New note'), text: 'Water the plants' })).text);
    assert(fill.filled && fill.valueMatches, JSON.stringify(fill));
    const pin = await mcp.tool('browser_click', { ref: ref(snap, 'Checkbox: Pin to top') });
    assert(!pin.isError, pin.text);
    const mid = (await mcp.tool('browser_snapshot')).text;
    has(mid, 'Textbox: New note = "Water the plants"');
    has(mid, 'Checkbox: Pin to top (checked)');
    const plain = await mcp.tool('browser_click', { ref: ref(mid, 'Button: Save note') });
    has(plain.text, 'Error [SUBMIT_INTENT_REQUIRED]');
    const pending = mcp.tool('browser_click', { ref: ref(mid, 'Button: Save note'), intent: 'submit' });
    const popup = await until(async () => {
      const p = await openPopup();
      return (await p.$eval('#confirm', (el) => !el.hidden)) ? p : null;
    }, 'the confirmation prompt');
    await popup.click('#allow');
    assert(!(await pending).isError, 'save should be dispatched');
    await mcp.tool('browser_wait_for', { text: 'Note saved.', timeout_ms: 5000 });
    const after = (await mcp.tool('browser_snapshot')).text;
    assert(after.indexOf('Clickable: Water the plants') > 0 && after.indexOf('Clickable: Water the plants') < after.indexOf('Clickable: Buy milk'),
      `pinned note should be first:\n${after}`);
  });
  await step('scrolls an inner scroll container when the document itself does not scroll', async () => {
    await page.bringToFront();
    const down = JSON.parse((await mcp.tool('browser_scroll', { direction: 'bottom' })).text);
    assert(down.target === 'element' && down.moved, JSON.stringify(down));
    has((await mcp.tool('browser_snapshot', { viewport_only: true })).text, 'Notes are sorted by date.');
    // The demo loads older notes when the bottom is reached, like a feed.
    assert(down.loadedMore === true && !down.atBottom, `scroll should report newly loaded content: ${JSON.stringify(down)}`);
    has(down.note, 'loaded more content');
    has((await mcp.tool('browser_extract')).text, 'Older notes loaded: Renew passport');
    const again = JSON.parse((await mcp.tool('browser_scroll', { direction: 'bottom' })).text);
    assert(again.atBottom && !again.loadedMore, `nothing more to load the second time: ${JSON.stringify(again)}`);
  });
  await step('screenshot refuses when the authorized tab is not the visible one', async () => {
    const other = await browser.newPage();
    await other.goto(demo.originA + '/page2.html');
    await other.bringToFront();
    const hidden = await mcp.tool('browser_screenshot');
    has(hidden.text, 'Error [TAB_NOT_VISIBLE]');
    assert(!(await mcp.tool('browser_snapshot')).isError, 'DOM tools still work on a background tab');
    await other.close();
    await page.bringToFront();
    assert((await mcp.tool('browser_screenshot')).image, 'screenshot should work again');
  });
  await step('closing the authorized tab revokes access', async () => {
    const spare = await browser.newPage();
    await page.close();
    await until(async () => (await mcp.tool('browser_status')).text.includes('Authorized origin: none'), 'revocation');
    await spare.close().catch(() => undefined);
  });

  console.log('\nShutdown');
  await step('server logs never contain the pairing token, and stdout stayed pure JSON-RPC', async () => {
    lacks(mcp.stderr, token);
    assert(mcp.stdoutNoise.length === 0, `non-JSON on stdout: ${mcp.stdoutNoise.slice(0, 3).join(' | ')}`);
  });
  await step('server exits when the MCP client closes stdin', async () => {
    const code = await mcp.close();
    assert(code === 0, `exit code ${code}`);
  });
} finally {
  await browser?.close().catch(() => undefined);
  if (mcp.proc.exitCode === null) mcp.proc.kill();
  await demo.close();
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // the browser may still be releasing its profile directory
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  if (process.env.SHOW_STDERR) console.log(`\nserver stderr:\n${mcp.stderr}`);
  process.exit(1);
}
