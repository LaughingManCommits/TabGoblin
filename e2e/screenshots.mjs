// Regenerates the screenshots and example outputs used in docs/.
// Drives the real extension in your installed Chrome against the demo sites, with two agents.
//
//   HEADED=1 node screenshots.mjs    writes docs/images/*.png and docs/examples/*.txt
//   node screenshots.mjs prompts [folder]
//                                    pictures every case of the confirmation prompt, in the dark and the
//                                    light colour scheme, into a folder to look at (default: prompt-pictures
//                                    next to this script). Nothing in docs/ is touched. Look at them after
//                                    any change to the prompt.
//
// The popup pictures are captures of the real popup window. Run it with HEADED=1: a visible Chrome
// gives the popup its real size (354 x 600), a headless one a different window (374 x 510).
// popup-full*.png are the exception: the popup's content laid out at full length, without scrolling.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startDemo } from '../demo-site/server.mjs';
import { McpClient, pairingToken } from './mcp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'tabgoblin-shots-'));
// In the mode for the prompt's cases the documentation's pictures and examples are left alone.
const PROMPTS = process.argv[2] === 'prompts' ? resolve(process.argv[3] ?? join(HERE, 'prompt-pictures')) : null;
const IMAGES = PROMPTS ? join(work, 'unused-images') : resolve(HERE, '../docs/images');
const EXAMPLES = PROMPTS ? join(work, 'unused-examples') : resolve(HERE, '../docs/examples');
mkdirSync(IMAGES, { recursive: true });
mkdirSync(EXAMPLES, { recursive: true });
if (PROMPTS) mkdirSync(PROMPTS, { recursive: true });
// Fixed ports so the addresses in the pictures are stable between runs.
const demo = await startDemo(8931, 8932, 8933);
const port = await new Promise((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); }); });
const args = ['-jar', resolve(HERE, '../java-server/target/browser-context-mcp.jar'), '--port', String(port), '--token-file', join(work, 'token'), '--no-panel'];
const one = new McpClient('java', args, 'IntelliJ IDEA');
const two = new McpClient('java', args, 'claude-code');
await one.initialize();
await two.initialize();
// The server makes its token when it starts: it is read now, not before.
const token = pairingToken(args);

const browser = await puppeteer.launch({
  ...(process.env.BCMCP_CHROME ? { executablePath: process.env.BCMCP_CHROME } : { channel: 'chrome' }),
  headless: !process.env.HEADED, pipe: true, enableExtensions: true, userDataDir: join(work, 'profile'),
  defaultViewport: null, args: ['--no-first-run', '--window-size=1100,720'],
});
const frozen = [];
try {
  const extensionId = await browser.installExtension(resolve(HERE, '../chrome-extension/dist'));
  const extension = (await browser.extensions()).get(extensionId);
  const findPopup = async () => {
    for (const p of await extension.pages()) {
      if (p.url().includes('popup.html') && await p.evaluate(() => true).catch(() => false)) return p;
    }
    return undefined;
  };
  /** Clicks the toolbar button on `page` like a user and returns the popup. */
  const open = async (page) => {
    const old = await findPopup();
    if (old) {
      await old.close().catch(() => undefined);
      while (await findPopup()) await sleep(50);
    }
    await page.bringToFront();
    await extension.triggerAction(page);
    let popup;
    while (!(popup = await findPopup())) await sleep(50);
    await popup.waitForSelector('#connection');
    await sleep(900); // one refresh of the popup's state
    return popup;
  };
  /** A capture of the real popup window, exactly as Chrome shows it. Longer content scrolls. */
  const capture = async (popup, name) => {
    await popup.evaluate(() => scrollTo(0, 0));
    await popup.screenshot({ path: join(IMAGES, name) });
    console.log(name);
  };
  /** Remembers the popup's whole content, to lay it out at full length at the end. */
  const freeze = async (popup, name, scheme) => {
    frozen.push({
      name, scheme,
      html: await popup.evaluate(() => {
        for (const el of document.querySelectorAll('select')) for (const o of el.options) o.toggleAttribute('selected', o.selected);
        for (const el of document.querySelectorAll('input[type=checkbox]')) el.toggleAttribute('checked', el.checked);
        return document.documentElement.outerHTML;
      }),
      css: await popup.evaluate(async () => (await fetch('popup.css')).text()),
    });
  };
  const authorize = async (page, mode, agent) => {
    const popup = await open(page);
    await popup.waitForFunction(() => !document.getElementById('authorizeBox').hidden && !document.getElementById('authorize').disabled);
    await popup.select('#newAccess', mode);
    await popup.waitForFunction((n) => [...document.getElementById('newAgent').options].some((o) => o.textContent === n), {}, agent);
    await popup.evaluate((n) => { const s = document.getElementById('newAgent'); s.value = [...s.options].find((o) => o.textContent === n).value; }, agent);
    await popup.click('#authorize');
    await popup.waitForFunction(() => document.getElementById('authorizeBox').hidden);
  };
  const example = (name, text) => writeFileSync(join(EXAMPLES, name), text.replaceAll(/[0-9a-f]{8}\.(\d+)/g, 'a1b2c3d4.$1') + '\n');
  const ref = (snapshot, fragment) => Number(/^\s*\[(\d+)\]/.exec(snapshot.split('\n').find((l) => l.includes(fragment)))[1]);

  // 0. Chrome's own extensions page, as the installation guide describes it.
  const a = (await browser.pages())[0];
  await a.goto('chrome://extensions/');
  await a.evaluate(() => new Promise((done) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, done)));
  await sleep(800);
  await a.reload();
  await sleep(1500);
  await a.screenshot({ path: join(IMAGES, 'install-extensions-page.png'), captureBeyondViewport: false });
  console.log('install-extensions-page.png');

  // 1. Not paired yet.
  await a.goto(demo.originA + '/');
  let popup = await open(a);
  await popup.waitForFunction(() => !document.getElementById('pairing').hidden);
  await capture(popup, 'popup-pairing.png');
  await popup.type('#token', token);
  await popup.$eval('#port', (el, p) => { el.value = p; }, String(port));
  await popup.click('#pair');
  await popup.waitForFunction(() => document.getElementById('connection').textContent === '2 agents connected', { timeout: 20000 });
  await one.tool('browser_status');
  await two.tool('browser_status');

  // 2. Paired, on a tab that is not authorized yet.
  popup = await open(a);
  await popup.select('#newAccess', 'write');
  await capture(popup, 'popup-authorize.png');

  // 3. Two sessions for two agents, with some activity.
  await authorize(a, 'write', 'IntelliJ IDEA');
  const c = await browser.newPage();
  await c.goto(demo.originC + '/');
  await authorize(c, 'explore', 'claude-code');
  const snapshot = (await one.tool('browser_snapshot')).text;
  example('snapshot.txt', snapshot);
  example('status.txt', (await one.tool('browser_status')).text.replace(/c-[0-9a-f]{8}/, 'c-1a2b3c4d').replace(/on port \d+/, 'on port 47821'));
  example('outline.txt', (await two.tool('browser_extract', { outline: true })).text);
  const outline = (await two.tool('browser_extract', { outline: true })).text;
  example('extract-section.txt', (await two.tool('browser_extract', { ref: Number(/\[(\d+)\] ## Installation/.exec(outline)[1]) })).text);
  await two.tool('browser_fill', { ref: 1, text: 'x' }); // refused: Explore cannot type
  await one.tool('browser_fill', { ref: ref(snapshot, 'Textbox (search)'), text: 'export' });
  await one.tool('browser_click', { ref: ref(snapshot, 'Button: Search') });
  example('navigate.txt', (await two.tool('browser_navigate', { url: '/guide.html' })).text);
  await two.tool('browser_navigate', { history: 'back' });
  popup = await open(a);
  await capture(popup, 'popup-sessions.png');
  await freeze(popup, 'popup-full.png', 'dark');
  await freeze(popup, 'popup-full-light.png', 'light');

  // 3b. The same, with every panel folded to one line, and unfolded again.
  const panels = ['sessions', 'activity', 'agents', 'settings'];
  for (const name of panels) await popup.click(`.panel[data-panel="${name}"] .fold`);
  await popup.waitForFunction(() => document.querySelectorAll('.panel.folded').length === 4);
  // The pointer off the last heading, and the arrows at rest.
  await popup.mouse.move(0, 0);
  await sleep(400);
  await capture(popup, 'popup-folded.png');
  for (const name of panels) await popup.click(`.panel[data-panel="${name}"] .fold`);
  await popup.waitForFunction(() => document.querySelectorAll('.panel.folded').length === 0);

  if (PROMPTS) {
    await promptCases();
    console.log(`\nLook at the pictures in ${PROMPTS}`);
  } else {
    await documentation();
  }

  /** Every case of the prompt, in both colour schemes, and a session on which a no stands. */
  async function promptCases() {
    const shoot = async (name, bottom = false) => {
      for (const scheme of ['dark', 'light']) {
        await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await sleep(250);
        await popup.evaluate((down) => scrollTo(0, down ? document.body.scrollHeight : 0), bottom);
        await popup.screenshot({ path: join(PROMPTS, `${name}-${scheme}.png`) });
        // FULL=1 adds each view at its whole length and double size, to look at spacing and alignment.
        if (process.env.FULL) await freeze(popup, `${name}-full-${scheme}.png`, scheme);
      }
    };
    let declined = false;
    /** Raises a prompt, pictures it, declines it, and lets the session ask again. */
    const picture = async (name, start) => {
      const pending = start();
      popup = await open(a);
      await popup.waitForFunction(() => !document.getElementById('confirm').hidden);
      await popup.waitForFunction(() => !document.getElementById('deny').disabled);
      await shoot(name);
      console.log(`${name}: ${await popup.$eval('#confirm', (el) => el.innerText.replace(/\s+/g, ' ').trim())}`);
      await popup.click('#deny');
      await pending;
      await popup.waitForSelector('.askagain');
      if (!declined) {
        declined = true;
        await sleep(900); // one refresh of the popup's state
        await shoot('declined');
        console.log(`declined: ${await popup.$eval('.held', (el) => el.innerText.replace(/\s+/g, ' ').trim())}`);
      }
      await popup.$eval('.askagain', (el) => el.click());
      await popup.waitForFunction(() => !document.querySelector('.askagain'));
    };
    const field = async (fragment) => ref((await one.tool('browser_snapshot')).text, fragment);
    const enter = (target) => one.tool('browser_press_key', { ...(target === undefined ? {} : { ref: target }), key: 'Enter', intent: 'submit' });
    /** Gives the comment box another name, or none, and the keyboard. */
    const rename = (name) => a.evaluate((text) => {
      const area = document.querySelector('textarea');
      for (const label of [...(area.labels ?? [])]) label.remove();
      for (const attribute of ['aria-labelledby', 'placeholder', 'title', 'name', 'id']) area.removeAttribute(attribute);
      if (text === null) area.removeAttribute('aria-label');
      else area.setAttribute('aria-label', text);
      area.focus();
    }, name);

    const comment = 'Reproduced on build 512. The export also fails for files that were renamed while the upload was still running.';
    await picture('click', async () => one.tool('browser_submit', {
      ref: await field('Button: Post comment'), fields: [{ ref: await field('Textbox (multiline): Comment'), text: 'Reproduced on build 512' }],
    }));
    await picture('click-high-impact', async () => one.tool('browser_click', { ref: await field('Button: Delete draft'), intent: 'submit' }));
    await one.tool('browser_fill', { ref: await field('Textbox (multiline): Comment'), text: comment });
    await picture('enter', async () => enter(await field('Textbox (multiline): Comment')));
    await rename('Reply to the whole thread, visible to everyone in the project');
    await picture('enter-long-name', () => enter());
    await rename(null);
    await picture('enter-no-name', () => enter());
    await rename('Delete account: type the reason');
    await picture('enter-high-impact', () => enter());
    await one.tool('browser_navigate', { url: '/form.html' });
    await one.tool('browser_fill', { ref: await field('Textbox: Note'), text: 'Call the bank' });
    await picture('enter-form-field', async () => enter(await field('Textbox: Note')));

    // The automatic mode: a session set to it, with something the user allowed that now passes.
    await popup.select('.session[data-session="s1"] .ask', 'auto');
    await sleep(900);
    const allowed = enter(await field('Textbox: Note'));
    popup = await open(a);
    await popup.waitForFunction(() => !document.getElementById('confirm').hidden);
    await popup.waitForFunction(() => !document.getElementById('allow').disabled);
    await shoot('enter-automatic');
    console.log(`enter-automatic: ${await popup.$eval('#confirm', (el) => el.innerText.replace(/\s+/g, ' ').trim())}`);
    await popup.click('#allow');
    await allowed;
    popup = await open(a);
    await popup.waitForSelector('.passing');
    await shoot('automatic');
    console.log(`automatic: ${await popup.$eval('.passing', (el) => el.innerText.replace(/\s+/g, ' ').trim())}`);
    // A second thing allowed, a click: it is told apart from Enter, and one button ends both.
    await one.tool('browser_navigate', { url: '/form.html' });
    const second = one.tool('browser_click', { ref: await field('Button: Add note'), intent: 'submit' });
    popup = await open(a);
    await popup.waitForFunction(() => !document.getElementById('confirm').hidden);
    await popup.waitForFunction(() => !document.getElementById('allow').disabled);
    await popup.click('#allow');
    await second;
    popup = await open(a);
    await popup.waitForFunction(() => document.querySelector('.passing')?.textContent.includes('clicking'));
    await shoot('automatic-several');
    console.log(`automatic-several: ${await popup.$eval('.passing', (el) => el.innerText.replace(/\s+/g, ' ').trim())}`);
    // The general setting and what each of its values says, at the foot of the popup.
    for (const mode of ['always', 'auto', 'never']) {
      await popup.select('#askMode', mode);
      await sleep(900);
      await shoot(`setting-${mode}`, true);
      console.log(`setting-${mode}: ${await popup.$eval('#askHint', (el) => el.textContent)}`);
    }

    // The panels folded to one line each: first two of them, then all four. Unfolded again at the end.
    const fold = async (name, folded) => {
      await popup.click(`.panel[data-panel="${name}"] .fold`);
      await popup.waitForFunction((panel, want) => document.querySelector(`.panel[data-panel="${panel}"]`).classList.contains('folded') === want, {}, name, folded);
    };
    const lines = () => popup.$$eval('.panel.folded .fold', (els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
    await fold('agents', true);
    await fold('settings', true);
    await popup.mouse.move(0, 0);
    await shoot('folded-two');
    await fold('sessions', true);
    await fold('activity', true);
    await popup.mouse.move(0, 0);
    await shoot('folded-all');
    console.log(`folded-all: ${await lines()}`);
    for (const name of ['sessions', 'activity', 'agents', 'settings']) await fold(name, false);
  }

  async function documentation() {
  // 4. A submission waiting for the user, then verified.
  const comment = 'Reproduced on build 512';
  const pending = one.tool('browser_submit', {
    ref: ref(snapshot, 'Button: Post comment'),
    fields: [{ ref: ref(snapshot, 'Textbox (multiline): Comment'), text: comment }],
    expect_text: comment,
  });
  popup = await open(a);
  await popup.waitForFunction(() => !document.getElementById('confirm').hidden);
  await sleep(800);
  await capture(popup, 'popup-confirm.png');
  await popup.waitForFunction(() => !document.getElementById('allow').disabled);
  await popup.click('#allow');
  example('submit.txt', (await pending).text.replace(/sub-[0-9a-f-]+/, 'sub-4f2a9c1e7b3d').replace(/"url" : "[^"]+"/, '"url" : "http://127.0.0.1:8931/"'));

  // 4b. Enter in a text box, waiting for the user. Declined: the picture is all that is wanted.
  const posted = (await one.tool('browser_snapshot')).text;
  await one.tool('browser_fill', { ref: ref(posted, 'Textbox (multiline): Comment'), text: 'Thanks, that fixed it for me too.' });
  const key = one.tool('browser_press_key', { ref: ref(posted, 'Textbox (multiline): Comment'), key: 'Enter', intent: 'submit' });
  popup = await open(a);
  await popup.waitForFunction(() => !document.getElementById('confirm').hidden);
  await sleep(800);
  await capture(popup, 'popup-confirm-enter.png');
  await popup.waitForFunction(() => !document.getElementById('deny').disabled);
  await popup.click('#deny');
  await key;

  // 4c. The no stands for a while, and the session says so. Then the user lets it ask again.
  await popup.waitForSelector('.askagain');
  await sleep(900);
  await capture(popup, 'popup-declined.png');
  await popup.$eval('.askagain', (el) => el.click());
  await popup.waitForFunction(() => !document.querySelector('.askagain'));

  // 4d. The automatic mode: the session is set to it, the user allows the text box once, and it passes from then on.
  await popup.select('.session[data-session="s1"] .ask', 'auto');
  await sleep(900);
  const once = one.tool('browser_press_key', { ref: ref(posted, 'Textbox (multiline): Comment'), key: 'Enter', intent: 'submit' });
  popup = await open(a);
  await popup.waitForFunction(() => !document.getElementById('confirm').hidden);
  await popup.waitForFunction(() => !document.getElementById('allow').disabled);
  await popup.click('#allow');
  await once;
  popup = await open(a);
  await popup.waitForSelector('.passing');
  await capture(popup, 'popup-automatic.png');
  await popup.select('.session[data-session="s1"] .ask', 'always');
  await sleep(900);

  // 5. The notice in the page: two commands have just ended, and a third runs.
  await a.bringToFront();
  // What the steps before left in it goes first, so that the picture is the same every time.
  await a.waitForFunction(() => !document.querySelector('bcmcp-indicator'), { timeout: 10000 });
  await one.tool('browser_snapshot');
  await one.tool('browser_extract');
  const waiting = one.tool('browser_wait_for', { text: 'never-there', timeout_ms: 3000 });
  // Wait until it is really there, and frame the picture around where it actually is.
  const pill = await a.waitForSelector('bcmcp-indicator', { timeout: 5000 });
  await sleep(500);
  // At double size, in the window as it is: the box is small, and the documentation shows it large.
  const [width, height, scrollX, scrollY] = await a.evaluate(() => [innerWidth, innerHeight, scrollX, scrollY]);
  await a.setViewport({ width, height, deviceScaleFactor: 2 });
  await sleep(300);
  const box = await pill.boundingBox();
  const left = Math.max(0, box.x - 150);
  const top = Math.max(0, box.y - 80);
  // The indicator is fixed to the viewport, while a clip is measured from the top of the document:
  // capture the viewport itself and shift the clip by how far the page is scrolled.
  await a.screenshot({
    path: join(IMAGES, 'indicator.png'), captureBeyondViewport: false,
    clip: { x: left + scrollX, y: top + scrollY, width: Math.min(width, box.x + box.width + 14) - left, height: Math.min(height, box.y + box.height + 14) - top },
  });
  await a.setViewport(null);
  await waiting;

  // 6. The tab left its site: the session is suspended and can be resumed, or the new site added.
  await a.goto(demo.originB + '/');
  await sleep(600);
  example('suspended.txt', (await one.tool('browser_snapshot')).text);
  popup = await open(a);
  await popup.waitForFunction(() => !document.getElementById('resumeBox').hidden);
  await capture(popup, 'popup-suspended.png');

  }

  // Lay the frozen content out at full length, at popup width, in an ordinary tab: what you would
  // see if the popup did not scroll.
  // For the documentation: the two full-length pictures. For the prompt's views: only with FULL=1.
  for (const shot of frozen.filter((entry) => !PROMPTS || !entry.name.startsWith('popup-full'))) {
    const view = await browser.newPage();
    await view.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: shot.scheme }]);
    await view.setViewport({ width: 344, height: 600, deviceScaleFactor: 2 });
    await view.setContent(shot.html.replace(/<script[^>]*><\/script>/, '').replace(/<link[^>]*>/, `<style>${shot.css}</style>`));
    await view.screenshot({ path: join(PROMPTS || IMAGES, shot.name), fullPage: true });
    await view.close();
    console.log(shot.name);
  }
  if (!PROMPTS) console.log('indicator.png');
} finally {
  await browser.close().catch(() => undefined);
  await one.close();
  await two.close();
  await demo.close();
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // profile directory still being released
  }
}
