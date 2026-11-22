import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  DRAWN_WITHIN_MS, FRAMES_UNTIL_DRAWN, LINE_FADES_MS, LINE_STAYS_MS, MAX_LINES, NOTICE_TAG, applyUpdate, mountNotice, noticeUpdateOf, noticeView,
  paintNotice, whenDrawn,
  type Notice, type NoticeUpdate,
} from '../src/notice.ts';

const GONE_MS = LINE_STAYS_MS + LINE_FADES_MS;
const T0 = 1_000_000;

/** Applies updates one after the other, each at its own moment. */
function after(...steps: [number, NoticeUpdate][]): Notice | null {
  let notice: Notice | null = null;
  for (const [at, update] of steps) notice = applyUpdate(notice, update, T0 + at);
  return notice;
}
const texts = (notice: Notice | null, at: number): string[] => (noticeView(notice, T0 + at)?.lines ?? []).map((line) => line.text);

test('while a command runs the notice is one row: what runs, and Pause', () => {
  const notice = after([0, { state: 'working', text: 'Reading page' }]);
  assert.deepEqual(noticeView(notice, T0), {
    status: 'Agent: Reading page', tone: 'working', pause: true, lines: [], fading: false, next: null,
  });
  // It stays for as long as the command does.
  assert.equal(noticeView(notice, T0 + 60_000)?.status, 'Agent: Reading page');
  // A tab that is only authorized has no notice.
  assert.equal(noticeView(null, T0), null);
  assert.equal(noticeView(after([0, { state: 'idle' }]), T0), null);
});

test('a line of what ended outlasts its command, then fades, then is gone', () => {
  const notice = after(
    [0, { state: 'working', text: 'Reading page' }],
    [300, { state: 'idle', ended: { text: 'Read page', mark: 'ok' } }],
  );
  const shown = noticeView(notice, T0 + 300);
  assert.deepEqual(shown, {
    status: 'Agent idle', tone: 'idle', pause: true,
    lines: [{ id: 1, text: 'Read page', mark: 'ok', fading: false }], fading: false, next: LINE_STAYS_MS,
  });
  // Just before it starts to fade it is as it was, and the view says when to look again.
  const before = noticeView(notice, T0 + 300 + LINE_STAYS_MS - 1);
  assert.deepEqual([before?.fading, before?.lines[0].fading, before?.next], [false, false, 1]);
  // Nothing runs and it is the last line: the box fades with it, and the line does not fade twice.
  const fading = noticeView(notice, T0 + 300 + LINE_STAYS_MS);
  assert.deepEqual([fading?.fading, fading?.lines[0].fading, fading?.next], [true, false, LINE_FADES_MS]);
  assert.equal(noticeView(notice, T0 + 300 + GONE_MS - 1)?.fading, true);
  assert.equal(noticeView(notice, T0 + 300 + GONE_MS), null);
});

test('two commands in a row give two lines, the newer next to the status row; each goes by itself', () => {
  const notice = after(
    [0, { state: 'working', text: 'Reading page' }],
    [200, { state: 'idle', ended: { text: 'Read page', mark: 'ok' } }],
    [1200, { state: 'working', text: 'Entering text' }],
    [1500, { state: 'idle', ended: { text: 'Entering text (needs Write access)', mark: 'error' } }],
    [2000, { state: 'working', text: 'Scrolling' }],
  );
  const view = noticeView(notice, T0 + 2000);
  assert.equal(view?.status, 'Agent: Scrolling');
  assert.deepEqual(view?.lines, [
    { id: 1, text: 'Read page', mark: 'ok', fading: false },
    { id: 2, text: 'Entering text (needs Write access)', mark: 'error', fading: false },
  ]);
  assert.equal(view?.next, 200 + LINE_STAYS_MS - 2000);
  // The older one fades while the newer one is still plain; the box stays, since something runs.
  const later = noticeView(notice, T0 + 200 + LINE_STAYS_MS + 10);
  assert.deepEqual(later?.lines.map((line) => line.fading), [true, false]);
  assert.equal(later?.fading, false);
  assert.deepEqual(texts(notice, 200 + GONE_MS), ['Entering text (needs Write access)']);
  // With everything gone the row of what runs is left.
  const alone = noticeView(notice, T0 + 1500 + GONE_MS);
  assert.deepEqual([alone?.lines.length, alone?.status, alone?.next], [0, 'Agent: Scrolling', null]);
});

test('at most three lines show; a fourth takes the place of the oldest', () => {
  let notice: Notice | null = null;
  for (let i = 1; i <= MAX_LINES + 2; i++) {
    notice = applyUpdate(notice, { state: 'idle', ended: { text: `Step ${i}`, mark: 'ok' } }, T0 + i * 100);
  }
  assert.equal(MAX_LINES, 3);
  assert.deepEqual(texts(notice, 600), ['Step 3', 'Step 4', 'Step 5']);
  // Every line has a number of its own, so that the page can keep a line's element as it is.
  assert.deepEqual(noticeView(notice, T0 + 600)?.lines.map((line) => line.id), [3, 4, 5]);
});

test('the status row says what the agent is at: asking, paused, idle', () => {
  const asking = noticeView(after([0, { state: 'asking' }]), T0 + 30_000);
  assert.deepEqual([asking?.status, asking?.tone, asking?.pause], ['Answer needed in the popup', 'asking', true]);
  // Paused, there is nothing left to pause. And a pause alone keeps no box in the page.
  assert.equal(noticeView(after([0, { state: 'paused' }]), T0), null);
  const paused = noticeView(after([0, { state: 'paused', ended: { text: 'Paused by you', mark: 'info' } }]), T0 + 10);
  assert.deepEqual([paused?.status, paused?.tone, paused?.pause, paused?.lines[0].mark], ['Agent paused', 'paused', false, 'info']);
  assert.equal(noticeView(after([0, { state: 'paused', ended: { text: 'Paused by you', mark: 'info' } }]), T0 + GONE_MS), null);
  // Resumed while a line is still there: the row says so.
  const resumed = after([0, { state: 'paused', ended: { text: 'Paused by you', mark: 'info' } }], [500, { state: 'idle' }]);
  assert.equal(noticeView(resumed, T0 + 500)?.status, 'Agent idle');
  // What runs is worded by the worker; without a wording it is still said that something runs.
  assert.equal(noticeView(after([0, { state: 'working' }]), T0)?.status, 'Agent: Working');
});

test('off takes everything away at once, also a line that is fading', () => {
  const notice = after([0, { state: 'idle', ended: { text: 'Read page', mark: 'ok' } }]);
  assert.equal(noticeView(notice, T0 + LINE_STAYS_MS + 100)?.fading, true);
  assert.equal(applyUpdate(notice, { state: 'off' }, T0 + LINE_STAYS_MS + 100), null);
  // And what comes after it starts from nothing.
  assert.deepEqual(texts(after([0, { state: 'idle', ended: { text: 'Read page', mark: 'ok' } }], [100, { state: 'off' }],
    [200, { state: 'idle', ended: { text: 'Captured screenshot', mark: 'ok' } }]), 200), ['Captured screenshot']);
});

test('what arrives is read as an update or takes the notice away', () => {
  assert.deepEqual(noticeUpdateOf({ state: 'working', text: 'Reading page' }), { state: 'working', text: 'Reading page' });
  assert.deepEqual(noticeUpdateOf({ state: 'idle', ended: { text: 'Read page', mark: 'ok' } }),
    { state: 'idle', ended: { text: 'Read page', mark: 'ok' } });
  for (const odd of [{}, { state: 'shown' }, { state: 7 }, { text: 'Agent: Reading page' }]) {
    assert.deepEqual(noticeUpdateOf(odd), { state: 'off' }, JSON.stringify(odd));
  }
  // A line without words or with a mark that does not exist is left out; a long text is cut.
  for (const ended of [{ text: '', mark: 'ok' }, { text: 'Read page', mark: 'great' }, { text: 7, mark: 'ok' }, 'Read page', null]) {
    assert.deepEqual(noticeUpdateOf({ state: 'idle', ended }), { state: 'idle' }, JSON.stringify(ended));
  }
  assert.equal(noticeUpdateOf({ state: 'working', text: 'x'.repeat(500) }).text?.length, 80);
  assert.equal(noticeUpdateOf({ state: 'idle', ended: { text: 'y'.repeat(500), mark: 'error' } }).ended?.text.length, 80);
});

test('drawn into a page: a closed box in the corner, lines above the row with Pause', () => {
  const { document } = new JSDOM('<!doctype html><html><body><p>The page</p></body></html>').window;
  const clicks: Event[] = [];
  const mount = mountNotice(document, (event) => clicks.push(event));
  // A page script finds the element and nothing inside it.
  const host = document.querySelector(NOTICE_TAG) as HTMLElement;
  assert.equal(host, mount.host);
  assert.equal(host.shadowRoot, null);
  assert.equal(host.textContent, '');
  assert.equal(host.parentElement, document.documentElement);

  const notice = after(
    [0, { state: 'idle', ended: { text: 'Read page', mark: 'ok' } }],
    [900, { state: 'idle', ended: { text: 'Clicking element (needs Write access)', mark: 'error' } }],
    [1000, { state: 'working', text: 'Entering text' }],
  );
  paintNotice(mount, noticeView(notice, T0 + 1000)!);
  assert.equal(mount.label.textContent, 'Agent: Entering text');
  assert.equal(mount.box.className, 'box working');
  assert.equal(mount.pause.hidden, false);
  assert.deepEqual([...mount.lines.children].map((el) => [el.className, el.textContent]), [
    ['line ok', '✓Read page'],
    ['line error', '✗Clicking element (needs Write access)'],
  ]);
  // Two panes: the pills first and the bar last. The pills pile up above the bar, and the bar,
  // with the goblin, the words and Pause, stays where it is.
  assert.deepEqual([...mount.box.children].map((el) => el.className), ['lines', 'bar']);
  const bar = mount.box.lastElementChild as HTMLElement;
  assert.deepEqual([...bar.children].map((el) => el.className || el.localName), ['goblin', 'label', 'button']);
  assert.deepEqual([bar.children[1], bar.children[2]], [mount.label, mount.pause]);

  // The older line starts to fade. Its element is the same one: a new one would start the fading anew.
  const [first, second] = [...mount.lines.children];
  paintNotice(mount, noticeView(notice, T0 + LINE_STAYS_MS + 10)!);
  assert.deepEqual([...mount.lines.children], [first, second]);
  assert.deepEqual([first.className, second.className], ['line ok fading', 'line error']);
  // It is gone, and a new line comes in below the one that is left.
  const more = applyUpdate(notice, { state: 'paused', ended: { text: 'Paused by you', mark: 'info' } }, T0 + GONE_MS + 10);
  paintNotice(mount, noticeView(more, T0 + GONE_MS + 10)!);
  assert.deepEqual([...mount.lines.children].map((el) => el.textContent), ['✗Clicking element (needs Write access)', '•Paused by you']);
  assert.equal(mount.lines.children[0], second);
  assert.equal(mount.label.textContent, 'Agent paused');
  assert.equal(mount.box.className, 'box paused');
  assert.equal(mount.pause.hidden, true);

  // Nothing runs and the last line goes: the whole box fades.
  const last = after([0, { state: 'idle', ended: { text: 'Read page', mark: 'ok' } }]);
  paintNotice(mount, noticeView(last, T0 + LINE_STAYS_MS + 1)!);
  assert.equal(mount.box.className, 'box idle fading');
  assert.equal(mount.lines.children.length, 1);
  assert.equal(mount.lines.children[0].className, 'line ok');

  // The click on Pause is handed on as it came, for the caller to judge. A page's click is not the user's.
  mount.pause.click();
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].isTrusted, false);
});

test('only Pause takes the pointer, and nothing moves where less motion is asked for', () => {
  const { document } = new JSDOM('<!doctype html><html><body></body></html>').window;
  const mount = mountNotice(document, () => undefined);
  const style = (mount.box.parentNode as ShadowRoot).querySelector('style')?.textContent ?? '';
  assert.match(style, /:host\{[^}]*pointer-events:none/);
  assert.match(style, /button\{pointer-events:auto/);
  assert.equal(style.match(/pointer-events:auto/g)?.length, 1, 'nothing else in the box takes a click, the goblin neither');
  assert.match(style, new RegExp(`transition:opacity ${LINE_FADES_MS}ms`));
  // Every animation and every fade is off there, whatever rule set it, and what would fade stays plain until it goes.
  assert.ok(style.endsWith('@media (prefers-reduced-motion:reduce){*,*::before{animation:none!important;transition:none!important}.fading{opacity:1}}'));
  // The notice is fixed to the corner and above the page.
  assert.match(style, /:host\{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647/);
  // What holds the two panes together draws nothing of its own: no ground, no edge, no shadow.
  assert.doesNotMatch(/\.box\{[^}]*\}/.exec(style)![0], /background|border|box-shadow/);
  // The bar is one row high also when Pause is not in it, so that it does not shrink when paused.
  assert.match(style, /\.bar\{[^}]*min-height:42px/);
  // Nothing is fetched to draw it: no address of any kind is in the styles.
  assert.doesNotMatch(style, /url\(|@import|https?:/);
});

test('the goblin is a picture in the box: its parts can move, and it says nothing and takes nothing', () => {
  const { document } = new JSDOM('<!doctype html><html><body></body></html>').window;
  const mount = mountNotice(document, () => undefined);
  const tile = mount.label.previousElementSibling as HTMLElement;
  const svg = tile.firstElementChild as Element;
  assert.deepEqual([tile.className, svg.localName, svg.namespaceURI], ['goblin', 'svg', 'http://www.w3.org/2000/svg']);
  // It stands bare on the bar: no ground under it and no edge around it, in any state. What
  // shows the state is a glow of its own outline, and its eyes.
  const style = (mount.box.parentNode as ShadowRoot).querySelector('style')?.textContent ?? '';
  const rules = [...style.matchAll(/([^{}]*\.goblin(?![\w-])[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 3, 'the goblin has rules of its own');
  for (const [, selector, body] of rules) assert.doesNotMatch(body, /background|border|box-shadow|outline/, selector);
  // The face alone, from ear to ear, fills its place.
  assert.equal(svg.getAttribute('viewBox'), '4 26 120 78');
  // What the state is, the row beside it says in words: the picture is hidden from a screen reader.
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.textContent, '');
  assert.deepEqual([...svg.children].map((part) => part.getAttribute('class')),
    ['ears', 'skin', 'eye', 'eye', 'pupil', 'pupil', 'mouth', 'tooth']);
  // Drawn from shapes in this file: nothing in it points anywhere else.
  for (const part of svg.children) assert.deepEqual(part.getAttributeNames().filter((name) => /href|src/.test(name)), []);
  // The state reaches it through the box's class alone, which the drawing sets.
  paintNotice(mount, noticeView(after([0, { state: 'asking' }]), T0)!);
  assert.equal(mount.box.className, 'box asking');
  // Pause says whose it is: a page may have a Pause of its own.
  assert.deepEqual([mount.pause.textContent, mount.pause.title, mount.pause.getAttribute('aria-label')],
    ['Pause', 'Pause the agent in this tab', 'Pause the agent in this tab']);
});

test('what was taken out of the page counts as out of the picture only when the page has drawn again', async () => {
  /** A window whose frames and timers come when the test says so. */
  const fake = (visibility = 'visible') => {
    const frames: (() => void)[] = [];
    const timers = new Map<number, { run: () => void; ms: number }>();
    let ids = 0;
    return {
      frames, timers,
      window: {
        requestAnimationFrame: (callback: (time: number) => void) => { frames.push(() => callback(0)); return frames.length; },
        setTimeout: (handler: () => void, ms: number) => { timers.set(++ids, { run: handler, ms }); return ids; },
        clearTimeout: (id: never) => { timers.delete(id as number); },
        document: { visibilityState: visibility },
      },
      /** The browser begins a frame: every callback asked for until now runs. */
      frame() { frames.splice(0).forEach((run) => run()); },
    };
  };
  const settled = async (promise: Promise<string>): Promise<string> => Promise.race([promise, new Promise<string>((r) => setTimeout(() => r('waiting'), 5))]);

  // A page that draws: not at the first frame, which is not drawn yet when its callback runs, and
  // not at the one after it. At the last of them the first has reached the screen.
  const drawing = fake();
  const drawn = whenDrawn(drawing.window);
  for (let i = 1; i < FRAMES_UNTIL_DRAWN; i++) {
    drawing.frame();
    assert.equal(await settled(drawn), 'waiting', `after frame ${i} the answer is still held`);
  }
  drawing.frame();
  assert.equal(await drawn, 'drawn');
  assert.equal(drawing.timers.size, 0, 'the limit is taken back');
  assert.ok(FRAMES_UNTIL_DRAWN >= 2, 'one frame is never enough: its callback runs before it is drawn');

  // A page that is busy draws late, and is waited for; one that does not draw at all is given up
  // on, so that a command is not held by it for good.
  const stuck = fake();
  const late = whenDrawn(stuck.window);
  assert.equal(await settled(late), 'waiting');
  const [limit] = [...stuck.timers.values()];
  assert.equal(limit.ms, DRAWN_WITHIN_MS);
  limit.run();
  assert.equal(await late, 'late');

  // A page that is not shown draws nothing: there is nothing to wait for, and nothing is asked of it.
  for (const visibility of ['hidden', 'prerender']) {
    const away = fake(visibility);
    assert.equal(await whenDrawn(away.window), 'hidden');
    assert.equal(away.frames.length + away.timers.size, 0);
  }
});
