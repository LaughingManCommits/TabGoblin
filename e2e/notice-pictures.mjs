// Pictures of the notice in the page, in every state it has, to look at. They are not in git.
//   node notice-pictures.mjs [folder]      from e2e; the default folder is notice-pictures
//
// The notice is drawn by the extension's own code (chrome-extension/src/notice.ts) in a plain page
// of a headless Chrome: no server, no extension and no agent are started, so it takes seconds.
// Every state is pictured at double size over a light and over a dark page, and the widest ones
// once more in a narrow window. What it cannot show is the real thing at work in a tab: the
// end-to-end suite does that, and `screenshots.mjs` takes the documentation's picture of it.
//
// It reads notice.ts as one file and takes its types out with Node itself, so that nothing has to
// be built first. That holds as long as notice.ts imports nothing: if it comes to import another
// file, bundle it here instead.

import { mkdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(HERE, 'notice-pictures'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// NOTICE_SOURCE names another file to draw with: a variant of the drawing, to set its pictures beside these.
const source = stripTypeScriptTypes(readFileSync(resolve(process.env.NOTICE_SOURCE ?? join(HERE, '../chrome-extension/src/notice.ts')), 'utf8'))
  + '\nglobalThis.__notice = { applyUpdate, noticeView, mountNotice, paintNotice };';

// A page like the ones the notice sits on: text, and in the corner what a page tends to have
// there, a box to write in and a button to send.
const page = (dark) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html { color-scheme: ${dark ? 'dark' : 'light'}; }
  body { margin: 0; font: 15px/1.5 system-ui, "Segoe UI", sans-serif; background: ${dark ? '#17181c' : '#ffffff'}; color: ${dark ? '#e8e8ea' : '#1c1d21'}; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 24px 120px; }
  h1 { font-size: 22px; } p { margin: 0 0 12px; }
  .composer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 8px; padding: 12px 16px;
    background: ${dark ? '#202127' : '#f4f5f7'}; border-top: 1px solid ${dark ? '#33353d' : '#dcdfe4'}; }
  .composer input { flex: 1; font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid ${dark ? '#444750' : '#c5c9d0'};
    background: ${dark ? '#17181c' : '#fff'}; color: inherit; }
  .composer button { font: inherit; padding: 8px 18px; border-radius: 8px; border: 0; background: #2563eb; color: #fff; }
</style></head><body><main><h1>Team notes</h1>
${Array.from({ length: 14 }, (_, i) => `<p>${i + 1}. The release is planned for Thursday. Checks on the build ran over night and one of them is still open; the notes of the meeting are in the shared folder.</p>`).join('')}
</main><div class="composer"><input value="Message to the team"><button>Send</button></div></body></html>`;

const ok = (text) => ({ text, mark: 'ok' });
const failed = (text) => ({ text, mark: 'error' });
const STAYS = 4000;

/**
 * The states to look at. `steps` are what the worker would send, each at its moment; `at` is the
 * moment of the picture. With `then`, the notice is drawn at `at`, drawn again at `then`, and
 * pictured half a second later: in the middle of a fade.
 */
const STATES = [
  { name: '01-working', steps: [[0, { state: 'working', text: 'Reading page' }]], at: 0 },
  { name: '02-idle-one-line', steps: [[0, { state: 'idle', ended: ok('Read page') }]], at: 100 },
  { name: '03-working-two-lines', steps: [
    [0, { state: 'idle', ended: ok('Read page') }], [300, { state: 'idle', ended: ok('Extracted text') }],
    [600, { state: 'working', text: 'Waiting for content' }]], at: 700 },
  { name: '04-three-lines-refused', steps: [
    [0, { state: 'idle', ended: ok('Read page') }], [300, { state: 'idle', ended: failed('Entering text (needs Write access)') }],
    [600, { state: 'idle', ended: ok('Scrolled') }], [900, { state: 'working', text: 'Clicking element' }]], at: 1000 },
  { name: '05-longest-line', steps: [
    [0, { state: 'idle', ended: ok('Navigated') }],
    [300, { state: 'idle', ended: failed('Submitting (another request was waiting for you)') }],
    [600, { state: 'working', text: 'Capturing screenshot' }]], at: 700 },
  { name: '06-asking', steps: [
    [0, { state: 'idle', ended: ok('Entered text') }], [300, { state: 'asking' }]], at: 400 },
  { name: '07-paused', steps: [
    [0, { state: 'working', text: 'Waiting for content' }],
    [500, { state: 'paused', ended: { text: 'Paused by you', mark: 'info' } }],
    [520, { state: 'paused', ended: failed('Waiting for content (cancelled)') }]], at: 600 },
  { name: '08-older-line-fading', steps: [
    [0, { state: 'idle', ended: ok('Read page') }], [2000, { state: 'idle', ended: ok('Extracted text') }],
    [2500, { state: 'working', text: 'Scrolling' }]], at: 2600, then: STAYS + 10 },
  { name: '09-box-fading', steps: [[0, { state: 'idle', ended: ok('Read page') }]], at: 100, then: STAYS + 10 },
  { name: '10-pause-under-pointer', steps: [
    [0, { state: 'idle', ended: ok('Read page') }], [300, { state: 'working', text: 'Entering text' }]], at: 400, pointer: true },
  { name: '11-arriving', steps: [
    [0, { state: 'idle', ended: ok('Read page') }], [300, { state: 'working', text: 'Entering text' }]], at: 400, frames: 4 },
];
const NARROW = ['05-longest-line', '06-asking'];

const browser = await puppeteer.launch({
  ...(process.env.BCMCP_CHROME ? { executablePath: process.env.BCMCP_CHROME } : { channel: 'chrome' }),
  headless: true, pipe: true, args: ['--no-first-run'],
});

let taken = 0;
async function picture(tab, state, file, clip) {
  const draw = (steps, at) => tab.evaluate((list, moment) => {
    const T0 = 1_000_000;
    const n = globalThis.__notice;
    if (list) {
      document.querySelector('bcmcp-indicator')?.remove();
      let notice = null;
      for (const [t, update] of list) notice = n.applyUpdate(notice, update, T0 + t);
      globalThis.__held = { notice, mount: n.mountNotice(document, () => undefined) };
    }
    n.paintNotice(globalThis.__held.mount, n.noticeView(globalThis.__held.notice, T0 + moment));
  }, steps, at);
  await draw(state.steps, state.at);
  const box = await (await tab.$('bcmcp-indicator')).boundingBox();
  if (state.frames) {
    // The first moments, one picture after the other as fast as they can be taken: what arrives, and how.
    for (let i = 0; i < state.frames; i++) {
      await tab.screenshot({ path: join(OUT, file.replace('.png', `-frame${i + 1}.png`)), ...(clip ? { clip: clip(box) } : {}) });
      taken += 1;
    }
    return box;
  }
  if (state.then !== undefined) {
    // First let the line finish arriving, as it has long done when it starts to fade in a real tab.
    await sleep(450);
    await draw(null, state.then);
    await sleep(500);
  }
  if (state.pointer) await tab.mouse.move(box.x + box.width - 34, box.y + box.height - 18);
  else await tab.mouse.move(5, 5);
  await sleep(120);
  await tab.screenshot({ path: join(OUT, file), ...(clip ? { clip: clip(box) } : {}) });
  taken += 1;
  return box;
}

const sizes = [];
for (const dark of [false, true]) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1100, height: 720, deviceScaleFactor: 2 });
  await tab.setContent(page(dark));
  await tab.addScriptTag({ content: source, type: 'module' });
  await tab.waitForFunction(() => globalThis.__notice);
  for (const state of STATES) {
    // The corner of the window, wide enough for the widest box and what the page has beside it.
    const box = await picture(tab, state, `${state.name}-${dark ? 'dark' : 'light'}.png`,
      () => ({ x: 1100 - 520, y: 720 - 250, width: 520, height: 250 }));
    if (!dark) sizes.push(`${state.name}: ${Math.round(box.width)} x ${Math.round(box.height)}`);
  }
  await tab.close();
}
// A narrow window, as a phone or a side panel has it: the whole window is the picture.
const narrow = await browser.newPage();
await narrow.setViewport({ width: 340, height: 520, deviceScaleFactor: 2 });
await narrow.setContent(page(false));
await narrow.addScriptTag({ content: source, type: 'module' });
await narrow.waitForFunction(() => globalThis.__notice);
for (const state of STATES.filter((s) => NARROW.includes(s.name))) {
  const box = await picture(narrow, state, `${state.name}-narrow.png`, null);
  sizes.push(`${state.name}, narrow: ${Math.round(box.width)} x ${Math.round(box.height)}`);
}
// Where the system asks for less motion: the line that would be fading is plain until it goes.
const still = await browser.newPage();
await still.setViewport({ width: 1100, height: 720, deviceScaleFactor: 2 });
await still.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await still.setContent(page(false));
await still.addScriptTag({ content: source, type: 'module' });
await still.waitForFunction(() => globalThis.__notice);
await picture(still, STATES.find((s) => s.name === '08-older-line-fading'), '08-older-line-fading-less-motion.png',
  () => ({ x: 1100 - 520, y: 720 - 250, width: 520, height: 250 }));
await browser.close();

console.log(`The notice's box, in CSS pixels:\n  ${sizes.join('\n  ')}`);
console.log(`${taken} pictures in ${OUT}`);
