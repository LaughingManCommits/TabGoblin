import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DomError, RefRegistry, extractPage, takeSnapshot, visibleText } from '../src/snapshot.ts';
import { page, refOf } from './helpers.ts';

function staleCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof DomError, String(e));
    return e.code;
  }
  return 'ok';
}

test('snapshot lists headings, text, links, buttons and fields with numbered refs', () => {
  const { doc } = page(`
    <h1>Account</h1>
    <p>Signed in as <b>demo</b>.</p>
    <a href="/profile">Profile</a>
    <label for="q">Search</label><input id="q" type="search" value="cats">
    <button>Search</button>
    <button type="button" disabled>Add Comment</button>
    <textarea aria-label="Notes"></textarea>
    <select aria-label="Size"><option>Small</option><option selected>Large</option></select>
    <label><input type="checkbox" checked> Remember me</label>
  `);
  const snap = takeSnapshot(doc, new RefRegistry());
  assert.equal(snap.text, [
    'Page: Test Page',
    'URL: https://app.example/start',
    'Scroll: 0 of 0px',
    '',
    '[1] Heading (h1): Account',
    'Text: Signed in as demo.',
    '[2] Link: Profile -> /profile',
    '[3] Textbox (search): Search = "cats"',
    '[4] Button: Search',
    '[5] Button: Add Comment (disabled)',
    '[6] Textbox (multiline): Notes',
    '[7] Combobox: Size = "Large" (options: Small | Large)',
    '[8] Checkbox: Remember me (checked)',
  ].join('\n'));
  assert.equal(snap.elements, 8);
  assert.equal(snap.truncated, false);
});

test('hidden content, scripts, raw HTML and attributes never appear', () => {
  const { doc } = page(`
    <p>Visible paragraph</p>
    <div style="display:none">DISPLAY-NONE <button>Ghost</button></div>
    <div hidden>HIDDEN-ATTR</div>
    <div style="visibility:hidden">VIS-HIDDEN <a href="/x">Invisible link</a></div>
    <div style="opacity:0">TRANSPARENT</div>
    <div style="overflow:hidden" data-zero>CLIPPED <a href="/y">Clipped link</a></div>
    <script>var SECRET_IN_SCRIPT = 1;</script>
    <style>.SECRET_IN_STYLE { color: red }</style>
    <template><p>TEMPLATE-TEXT</p></template>
    <noscript>NOSCRIPT-TEXT</noscript>
    <iframe srcdoc="<p>FRAME-TEXT</p>"></iframe>
    <input type="hidden" name="csrf" value="CSRF-VALUE">
    <a href="/ok" data-internal-id="DATA-ATTR" onclick="ONCLICK_ATTR()" class="CLASS-NAME">Fine link</a>
  `);
  const snap = takeSnapshot(doc, new RefRegistry()).text;
  assert.match(snap, /Text: Visible paragraph/);
  assert.match(snap, /Link: Fine link -> \/ok/);
  for (const leak of ['DISPLAY-NONE', 'Ghost', 'HIDDEN-ATTR', 'VIS-HIDDEN', 'Invisible link', 'TRANSPARENT', 'CLIPPED',
    'Clipped link', 'SECRET_IN_SCRIPT', 'SECRET_IN_STYLE', 'TEMPLATE-TEXT', 'NOSCRIPT-TEXT', 'FRAME-TEXT', 'CSRF-VALUE',
    'csrf', 'DATA-ATTR', 'ONCLICK_ATTR', 'CLASS-NAME', '<a', '<div']) {
    assert.ok(!snap.includes(leak), `snapshot leaked ${leak}:\n${snap}`);
  }
  const text = visibleText(doc.body);
  for (const leak of ['DISPLAY-NONE', 'HIDDEN-ATTR', 'VIS-HIDDEN', 'TRANSPARENT', 'CLIPPED', 'SECRET_IN_SCRIPT', 'CSRF-VALUE']) {
    assert.ok(!text.includes(leak), `extract leaked ${leak}`);
  }
});

test('password and credential-like values are never reported', () => {
  const { doc } = page(`
    <label>Password <input type="password" value="hunter2"></label>
    <label>Shown password <input type="text" name="password" value="hunter3"></label>
    <label>Code <input autocomplete="one-time-code" value="493817"></label>
    <label>Card <input autocomplete="cc-number" value="4111111111111111"></label>
    <label>API token <input id="api_token" value="sk-live-abcdef"></label>
    <label>City <input value="Lisbon"></label>
  `);
  const snap = takeSnapshot(doc, new RefRegistry()).text;
  for (const secret of ['hunter2', 'hunter3', '493817', '4111111111111111', 'sk-live-abcdef']) {
    assert.ok(!snap.includes(secret), `snapshot leaked ${secret}:\n${snap}`);
  }
  assert.match(snap, /Password: Password \(value hidden\)/);
  assert.match(snap, /Textbox: Shown password \(value hidden\)/);
  assert.match(snap, /Textbox: City = "Lisbon"/);
  assert.ok(!visibleText(doc.body).includes('hunter2'));
  assert.ok(!visibleText(doc.body).includes('Lisbon'), 'extract does not include field values');
});

test('refs stay attached to the same element across snapshots and are never reused', () => {
  const { doc } = page('<button id="a">Alpha</button><button id="b">Beta</button>');
  const registry = new RefRegistry();
  const first = takeSnapshot(doc, registry).text;
  const alpha = refOf(first, 'Button: Alpha');
  const beta = refOf(first, 'Button: Beta');

  const added = doc.createElement('button');
  added.textContent = 'Gamma';
  doc.body.prepend(added);
  const second = takeSnapshot(doc, registry).text;
  assert.equal(refOf(second, 'Button: Alpha'), alpha);
  assert.equal(refOf(second, 'Button: Beta'), beta);
  assert.equal(refOf(second, 'Button: Gamma'), 3);
  assert.equal(registry.resolve(alpha), doc.getElementById('a'));

  doc.getElementById('b')!.remove();
  const third = takeSnapshot(doc, registry).text;
  const delta = doc.createElement('button');
  delta.textContent = 'Delta';
  doc.body.append(delta);
  assert.equal(refOf(takeSnapshot(doc, registry).text, 'Button: Delta'), 4, 'ref 2 must not be recycled');
  assert.ok(!third.includes('Beta'));
});

test('stale refs are rejected: removed, hidden, changed or unknown elements', () => {
  const { doc } = page(`
    <button id="gone">Remove me</button>
    <button id="hide">Hide me</button>
    <button id="rename">Like (3)</button>
    <button id="stay">Stay</button>
    <div id="wrap"><a href="/x" id="inner">Inner</a></div>
  `);
  const registry = new RefRegistry();
  const snap = takeSnapshot(doc, registry).text;

  doc.getElementById('gone')!.remove();
  doc.getElementById('hide')!.style.display = 'none';
  doc.getElementById('rename')!.textContent = 'Like (4)';
  doc.getElementById('wrap')!.style.display = 'none';

  assert.equal(staleCode(() => registry.resolve(refOf(snap, 'Remove me'))), 'STALE_REF');
  assert.equal(staleCode(() => registry.resolve(refOf(snap, 'Hide me'))), 'STALE_REF');
  assert.equal(staleCode(() => registry.resolve(refOf(snap, 'Like (3)'))), 'STALE_REF');
  assert.equal(staleCode(() => registry.resolve(refOf(snap, 'Link: Inner'))), 'STALE_REF', 'hidden ancestor');
  assert.equal(staleCode(() => registry.resolve(999)), 'STALE_REF');
  assert.equal(registry.resolve(refOf(snap, 'Button: Stay')), doc.getElementById('stay'));

  // A new snapshot gives the changed element a usable ref again.
  const again = takeSnapshot(doc, registry).text;
  assert.equal(registry.resolve(refOf(again, 'Like (4)')), doc.getElementById('rename'));
});

test('refs of a new document continue after the previous document, so old refs cannot collide', () => {
  const first = page('<button>One</button><button>Two</button>');
  const firstRegistry = new RefRegistry();
  takeSnapshot(first.doc, firstRegistry);
  assert.equal(firstRegistry.highest, 2);

  // After navigation the content script starts fresh; the background passes the high-water mark.
  const second = page('<button>Other</button>');
  const secondRegistry = new RefRegistry();
  secondRegistry.startAfter(firstRegistry.highest);
  const snap = takeSnapshot(second.doc, secondRegistry).text;
  assert.equal(refOf(snap, 'Button: Other'), 3);
  assert.equal(staleCode(() => secondRegistry.resolve(1)), 'STALE_REF');
  assert.equal(staleCode(() => secondRegistry.resolve(2)), 'STALE_REF');
});

test('closed details hide their content; headings expose links inside them', () => {
  const { doc } = page(`
    <details><summary>More</summary><p>Inside details</p><button>Inner</button></details>
    <h2><a href="/post/1">Post title</a></h2>
  `);
  const registry = new RefRegistry();
  const closed = takeSnapshot(doc, registry).text;
  assert.match(closed, /Toggle: More \(collapsed\)/);
  assert.ok(!closed.includes('Inside details') && !closed.includes('Inner'));
  assert.match(closed, /Heading \(h2\): Post title\n\[\d+\] Link: Post title -> \/post\/1/);

  (doc.querySelector('details') as HTMLDetailsElement).open = true;
  const open = takeSnapshot(doc, registry).text;
  assert.match(open, /Toggle: More \(expanded\)/);
  assert.match(open, /Text: Inside details/);
  assert.match(open, /Button: Inner/);
});

test('ARIA roles, clickable containers and custom checkboxes are discovered generically', () => {
  const { doc } = page(`
    <div role="button" aria-label="Close dialog"></div>
    <div role="tab" aria-selected="true">Overview</div>
    <div style="cursor:pointer"><span>Open card</span></div>
    <div contenteditable="true" role="textbox" aria-label="Message">Hello</div>
    <label><input type="checkbox" style="opacity:0"><span>Dark mode</span></label>
    <a>Not a link (no href)</a>
  `);
  const snap = takeSnapshot(doc, new RefRegistry()).text;
  assert.match(snap, /Button: Close dialog/);
  assert.match(snap, /Tab: Overview \(selected\)/);
  assert.match(snap, /Clickable: Open card/);
  assert.match(snap, /Textbox: Message = "Hello"/);
  assert.match(snap, /Checkbox: Dark mode \(unchecked\)/);
  assert.match(snap, /Text: Not a link \(no href\)/);
});

test('icon-only controls are named after the icon inside them', () => {
  const { doc } = page(`
    <a href="/home"><img alt=""><img alt="Company logo"></a>
    <a href="/vote"><div title="upvote"></div></a>
    <button><span aria-label="Close"></span></button>
    <button title="Settings"></button>
    <a href="/nothing"></a>
  `);
  const snap = takeSnapshot(doc, new RefRegistry()).text;
  assert.match(snap, /Link: Company logo -> \/home/);
  assert.match(snap, /Link: upvote -> \/vote/);
  assert.match(snap, /Button: Close/);
  assert.match(snap, /Button: Settings/);
  assert.match(snap, /Link: \(unnamed\) -> \/nothing/);
});

test('table cells share a line, external links are marked, interactive_only drops text', () => {
  const { doc } = page(`
    <table><tr><td>Theme</td><td>Light</td></tr><tr><td>Language</td><td>English</td></tr></table>
    <a href="https://other.example/docs">Docs</a>
    <p>Just text</p>
  `);
  const full = takeSnapshot(doc, new RefRegistry()).text;
  assert.match(full, /Text: Theme \| Light\nText: Language \| English/);
  assert.match(full, /Link: Docs \(external: other\.example\)/);
  const interactive = takeSnapshot(doc, new RefRegistry(), { interactiveOnly: true }).text;
  assert.ok(!interactive.includes('Text:'));
  assert.match(interactive, /Link: Docs/);
});

test('very large pages are truncated with a hint instead of flooding the agent', () => {
  const items = Array.from({ length: 600 }, (_, i) => `<p>Row ${i}</p>`).join('');
  const { doc } = page(items);
  const snap = takeSnapshot(doc, new RefRegistry());
  assert.equal(snap.truncated, true);
  assert.match(snap.text, /snapshot truncated at 400 lines/);
  assert.ok(snap.text.split('\n').length < 420);
});

test('extract returns headings and text, windowed by offset', () => {
  const { doc } = page('<h1>Title</h1><p>First paragraph.</p><h2>Part</h2><p>Second paragraph.</p>');
  const all = extractPage(doc, 10000, 0);
  assert.equal(all.truncated, false);
  assert.ok(all.text.endsWith('# Title\nFirst paragraph.\n## Part\nSecond paragraph.'), all.text);
  const window = extractPage(doc, 10, 8);
  assert.equal(window.truncated, true);
  assert.match(window.text, /characters 8-18 of 50 \(continue with offset=18\)/);
  assert.ok(window.text.endsWith('First para'), window.text);
});

test('results end with a line naming what was left out, so the agent knows to look further', () => {
  const { doc } = page(`
    <p>Intro</p>
    <details><summary>FAQ</summary><p>Answer</p></details>
    <button aria-expanded="false">Menu</button>
    <button aria-expanded="true">Open panel</button>
    <iframe src="about:blank"></iframe>
    <div style="display:none"><button aria-expanded="false">Hidden menu</button></div>
  `);
  const expected = 'Not shown: 2 collapsed controls (menus or sections: click one to expand it, then read again); 1 embedded frame (cannot be read).';
  const snap = takeSnapshot(doc, new RefRegistry()).text;
  assert.ok(snap.endsWith(expected), snap);
  assert.ok(extractPage(doc, 1000, 0).text.endsWith(expected));

  (doc.querySelector('details') as HTMLDetailsElement).open = true;
  doc.querySelector('[aria-expanded="false"]')!.setAttribute('aria-expanded', 'true');
  doc.querySelector('iframe')!.remove();
  assert.ok(!takeSnapshot(doc, new RefRegistry()).text.includes('Not shown'), 'nothing left out, no line');
});
