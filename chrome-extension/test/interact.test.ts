import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clickElement, describeClickTarget, describeKeyTarget, fillElement, pressKey, waitFor,
  foreignFramesInView,
} from '../src/interact.ts';
import { DomError, PageState, takeSnapshot } from '../src/snapshot.ts';
import { layout, page, refOf } from './helpers.ts';

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof DomError, String(e));
    return e.code;
  }
  return 'ok';
}

test('a ref from the snapshot resolves to the element and click reaches its handlers', () => {
  const { doc } = page('<button id="go">Go</button><p id="out"></p>');
  const events: string[] = [];
  const button = doc.getElementById('go')!;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    button.addEventListener(type, () => events.push(type));
  }
  button.addEventListener('click', () => { doc.getElementById('out')!.textContent = 'clicked'; });

  const state = new PageState();
  const snap = takeSnapshot(doc, state).text;
  const result = clickElement(state.registry.resolve(refOf(snap, 'Button: Go')));
  assert.deepEqual(result, { dispatched: true });
  assert.deepEqual(events, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  assert.equal(doc.getElementById('out')!.textContent, 'clicked');
  assert.equal(doc.activeElement, button);
});

test('click toggles checkboxes and refuses disabled controls', () => {
  const { doc } = page('<input type="checkbox" id="c"><button id="off" disabled>Off</button><div role="button" aria-disabled="true" id="aria">X</div>');
  clickElement(doc.getElementById('c')!);
  assert.equal((doc.getElementById('c') as HTMLInputElement).checked, true);
  assert.equal(errorCode(() => clickElement(doc.getElementById('off')!)), 'ELEMENT_DISABLED');
  assert.equal(errorCode(() => clickElement(doc.getElementById('aria')!)), 'ELEMENT_DISABLED');
});

test('fill sets inputs and textareas and fires the events frameworks listen for', () => {
  const { doc } = page('<input id="name" value="old"><textarea id="note">old</textarea>');
  const seen: string[] = [];
  const input = doc.getElementById('name') as HTMLInputElement;
  input.addEventListener('input', () => seen.push(`input:${input.value}`));
  input.addEventListener('change', () => seen.push(`change:${input.value}`));

  assert.deepEqual(fillElement(input, 'Ada', false), { filled: true, valueMatches: true });
  assert.equal(input.value, 'Ada');
  assert.deepEqual(seen, ['input:Ada', 'change:Ada']);

  fillElement(input, ' Lovelace', true);
  assert.equal(input.value, 'Ada Lovelace');
  fillElement(input, '', false);
  assert.equal(input.value, '', 'empty text clears the field');

  const note = doc.getElementById('note') as HTMLTextAreaElement;
  fillElement(note, 'line 1\nline 2', false);
  assert.equal(note.value, 'line 1\nline 2');
});

test('typing sends key events per character, and a handler can refuse a key', () => {
  const { doc } = page('<input id="q" value="x"><input id="digits">');
  const input = doc.getElementById('q') as HTMLInputElement;
  const events: string[] = [];
  for (const type of ['keydown', 'keypress', 'input', 'keyup']) {
    input.addEventListener(type, (e) => events.push(`${type}:${(e as KeyboardEvent).key ?? input.value}`));
  }
  assert.equal(fillElement(input, 'ab', false, 'type').valueMatches, true);
  assert.equal(input.value, 'ab');
  assert.deepEqual(events.slice(-8), [
    'keydown:a', 'keypress:a', 'input:a', 'keyup:a',
    'keydown:b', 'keypress:b', 'input:ab', 'keyup:b',
  ]);

  const digits = doc.getElementById('digits') as HTMLInputElement;
  digits.addEventListener('keydown', (e) => { if (!/\d/.test(e.key)) e.preventDefault(); });
  const result = fillElement(digits, '1a2', false, 'type');
  assert.equal(digits.value, '12');
  assert.equal(result.valueMatches, false, 'the field dropped a character and that is reported');
});

test('a typed line break is content: no key is pressed for it, so nothing is sent', () => {
  const { doc } = page('<textarea id="message"></textarea>');
  const area = doc.getElementById('message') as HTMLTextAreaElement;
  // A message box that sends on Enter, however the page recognises that key.
  const sent: string[] = [];
  const keys: string[] = [];
  for (const type of ['keydown', 'keypress', 'keyup']) {
    area.addEventListener(type, (e) => {
      const event = e as KeyboardEvent;
      keys.push(event.key);
      if (event.key === 'Enter' || event.key === '\n' || event.keyCode === 13 || event.keyCode === 10) sent.push(area.value);
    });
  }
  const inputs: string[] = [];
  area.addEventListener('input', (e) => inputs.push((e as InputEvent).inputType));

  assert.equal(fillElement(area, 'a\nb', false, 'type').valueMatches, true);
  assert.equal(area.value, 'a\nb');
  assert.deepEqual(sent, []);
  assert.deepEqual([...new Set(keys)], ['a', 'b'], 'keys for the characters only');
  assert.deepEqual(inputs, ['insertText', 'insertLineBreak', 'insertText']);
});

test('fill selects options and sets checkboxes, radios and switches', () => {
  const { doc } = page(`
    <select id="s"><option value="lo">Low</option><option value="hi">High</option></select>
    <input type="checkbox" id="cb">
    <input type="radio" name="r" id="r1" checked><input type="radio" name="r" id="r2">
    <div role="switch" aria-checked="false" id="sw">Dark</div>
  `);
  const select = doc.getElementById('s') as HTMLSelectElement;
  let changed = 0;
  select.addEventListener('change', () => changed++);
  fillElement(select, 'High', false);
  assert.equal(select.value, 'hi');
  fillElement(select, 'lo', false);
  assert.equal(select.value, 'lo');
  assert.equal(changed, 2);
  assert.equal(errorCode(() => fillElement(select, 'Medium', false)), 'OPTION_NOT_FOUND');

  const cb = doc.getElementById('cb') as HTMLInputElement;
  let clicks = 0;
  cb.addEventListener('click', () => clicks++);
  assert.equal(fillElement(cb, 'true', false).valueMatches, true);
  assert.equal(cb.checked, true);
  assert.match(fillElement(cb, 'true', false).note ?? '', /already had that state/);
  assert.equal(clicks, 1, 'setting the state it already has does not click');
  fillElement(cb, 'false', false);
  assert.equal(cb.checked, false);
  assert.equal(errorCode(() => fillElement(cb, 'maybe', false)), 'UNSUPPORTED_ELEMENT');

  fillElement(doc.getElementById('r2')!, 'true', false);
  assert.equal((doc.getElementById('r2') as HTMLInputElement).checked, true);
  assert.equal(errorCode(() => fillElement(doc.getElementById('r2')!, 'false', false)), 'UNSUPPORTED_ELEMENT');

  // A custom switch that ignores the click is reported, not assumed.
  assert.equal(fillElement(doc.getElementById('sw')!, 'true', false).valueMatches, false);
});

test('fill refuses password and credential fields, read-only fields and non-text elements', () => {
  const { doc } = page(`
    <input type="password" id="pw" value="keep">
    <input name="otp" id="otp">
    <input autocomplete="cc-number" id="cc">
    <input id="ro" readonly value="fixed">
    <input id="dis" disabled>
    <input type="file" id="file">
    <button id="btn">B</button>
    <p id="p">text</p>
  `);
  const el = (id: string): Element => doc.getElementById(id)!;
  for (const method of ['set', 'type'] as const) {
    assert.equal(errorCode(() => fillElement(el('pw'), 'x', false, method)), 'SENSITIVE_FIELD');
    assert.equal(errorCode(() => fillElement(el('otp'), '123456', false, method)), 'SENSITIVE_FIELD');
    assert.equal(errorCode(() => fillElement(el('cc'), '4111', false, method)), 'SENSITIVE_FIELD');
    assert.equal(errorCode(() => fillElement(el('ro'), 'x', false, method)), 'ELEMENT_DISABLED');
    assert.equal(errorCode(() => fillElement(el('dis'), 'x', false, method)), 'ELEMENT_DISABLED');
  }
  assert.equal(errorCode(() => fillElement(el('file'), 'C:\\secret.txt', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal(errorCode(() => fillElement(el('btn'), 'x', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal(errorCode(() => fillElement(el('p'), 'x', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal(errorCode(() => pressKey(doc, el('pw'), 'a')), 'SENSITIVE_FIELD', 'keys cannot type into a password field either');
  assert.equal((el('pw') as HTMLInputElement).value, 'keep');
  assert.equal((el('ro') as HTMLInputElement).value, 'fixed');
});

test('click targets are classified: links, expanders, form submissions, likely submissions', () => {
  const { doc } = page(`
    <a id="same" href="/next">Next</a>
    <a id="ext" href="https://other.example/">Elsewhere</a>
    <a id="js" href="javascript:void(0)">Run</a>
    <details><summary id="sum">More</summary>x</details>
    <button id="exp" type="button" aria-expanded="false">Show statistics</button>
    <form method="post" action="/save">
      <button id="implicit">Save</button>
      <button id="plain" type="button">Preview</button>
      <input id="isub" type="submit" value="Go">
    </form>
    <form role="search"><input type="search"><button id="search">Search</button></form>
    <form><input name="comment"><button id="getform">Add</button></form>
    <button id="del" type="button">Delete draft</button>
    <div id="tab" role="tab">Archive</div>
    <div id="divbtn" role="button">Publish</div>
  `);
  const d = (id: string) => describeClickTarget(doc.getElementById(id)!);
  assert.deepEqual(d('same'), { readSafe: true, disclosure: false, externalLink: false, submit: null, label: 'Next' });
  assert.equal(d('ext').externalLink, true);
  assert.equal(d('ext').readSafe, false);
  assert.equal(d('js').readSafe, false, 'javascript: links are controls, not navigation');
  assert.deepEqual([d('sum').readSafe, d('sum').disclosure], [true, true]);
  assert.deepEqual([d('exp').disclosure, d('exp').submit], [true, null]);
  assert.deepEqual([d('tab').disclosure, d('tab').submit], [true, null], 'tabs are navigation even when the label sounds like an action');
  assert.equal(d('implicit').submit, 'form', 'a button in a form submits by default');
  assert.equal(d('isub').submit, 'form');
  assert.equal(d('plain').submit, null);
  assert.equal(d('search').submit, null, 'an explicit GET search form only reads');
  assert.equal(d('getform').submit, 'form', 'other forms are submissions even without method=post');
  assert.equal(d('del').submit, 'likely');
  assert.equal(d('divbtn').submit, 'likely');
  for (const id of ['implicit', 'plain', 'del', 'divbtn']) assert.equal(d(id).disclosure, false, id);
});

test('keys carry out their usual effect: activate, submit, move focus, type, delete', () => {
  const { doc } = page(`
    <button id="b">Go</button>
    <form id="f"><input id="q" value="ab"><input id="other"></form>
    <textarea id="t">one</textarea>
    <div id="menu" tabindex="0">Menu</div>
    <select id="s"><option>A</option><option>B</option></select>
  `);
  let clicked = 0;
  let submitted = 0;
  doc.getElementById('b')!.addEventListener('click', () => clicked++);
  doc.getElementById('f')!.addEventListener('submit', (e) => { e.preventDefault(); submitted++; });

  assert.equal(pressKey(doc, doc.getElementById('b'), 'Enter').effect, 'activated the element');
  pressKey(doc, doc.getElementById('b'), ' ');
  assert.equal(clicked, 2);

  const q = doc.getElementById('q') as HTMLInputElement;
  assert.equal(pressKey(doc, q, 'Enter').effect, 'submitted the form');
  assert.equal(submitted, 1);
  pressKey(doc, q, 'c');
  assert.equal(q.value, 'abc');
  pressKey(doc, q, 'Backspace');
  assert.equal(q.value, 'ab');

  assert.match(pressKey(doc, q, 'Tab').effect, /moved focus to Textbox/);
  assert.equal(doc.activeElement, doc.getElementById('other'));
  pressKey(doc, null, 'Shift+Tab');
  assert.equal(doc.activeElement, q, 'without a ref the focused element receives the key');

  const t = doc.getElementById('t') as HTMLTextAreaElement;
  pressKey(doc, t, 'Enter');
  assert.equal(t.value, 'one\n');

  const s = doc.getElementById('s') as HTMLSelectElement;
  pressKey(doc, s, 'ArrowDown');
  assert.equal(s.value, 'B');

  // A key the page handles itself is left to the page.
  const menu = doc.getElementById('menu')!;
  const seen: string[] = [];
  menu.addEventListener('keydown', (e) => { seen.push(`${e.key}:${e.keyCode}`); e.preventDefault(); });
  assert.equal(pressKey(doc, menu, 'Escape').effect, 'the page handled the key itself');
  assert.deepEqual(seen, ['Escape:27']);
});

test('Enter in a form field is recognised as a submission before it is pressed', () => {
  const { doc } = page(`
    <form method="post"><input id="title"><textarea id="body"></textarea></form>
    <form role="search"><input id="q" type="search"></form>
    <input id="loose">
  `);
  const d = (id: string, key = 'Enter') => describeKeyTarget(doc.getElementById(id)!, key).submit;
  assert.equal(d('title'), 'form');
  assert.equal(d('title', 'Tab'), null);
  assert.equal(d('q'), null, 'an explicit GET search form only reads');
  // Outside a form, and in a text area, the page does not say what Enter does: it may send.
  assert.equal(d('body'), 'text');
  assert.equal(d('loose'), 'text');
  assert.equal(d('loose', 'a'), null, 'only Enter');
});

test('Enter in any text box may send what is written; search boxes and open option lists are told apart', () => {
  const { doc } = page(`
    <textarea id="message" aria-label="Message"></textarea>
    <div id="chat" contenteditable="true" role="textbox" aria-label="Write a reply"></div>
    <input id="todo" aria-label="New item">
    <input id="find" type="search" aria-label="Anything">
    <input id="named" aria-label="Search issues">
    <input id="hinted" placeholder="Filter by name">
    <div role="search"><input id="inside" aria-label="Words"></div>
    <div id="palette" contenteditable="true" role="searchbox" aria-label="Commands"></div>
    <input id="combo" role="combobox" aria-expanded="true" aria-controls="people" aria-label="Assignee">
    <ul id="people" role="listbox"><li role="option" id="opt-1">Ada</li><li role="option" id="opt-2">Grace</li></ul>
    <div id="mention" contenteditable="true" aria-activedescendant="opt-2" aria-label="Message"></div>
    <input id="closed" role="combobox" aria-expanded="false" aria-controls="people-closed" aria-label="Assignee">
    <ul id="people-closed" role="listbox" data-zero></ul>
    <div id="composer" contenteditable="true" aria-expanded="true" aria-label="Message"></div>
    <div id="dangling" contenteditable="true" aria-activedescendant="gone" aria-label="Message"></div>
    <input id="panel" aria-expanded="true" aria-controls="details" aria-label="Title"><div id="details">More fields</div>
    <textarea id="both" aria-label="Search the archive or write a message"></textarea>
    <input id="check" type="checkbox" aria-label="Done">
    <p id="text" tabindex="-1">Just text</p>
  `);
  const d = (id: string, key = 'Enter') => describeKeyTarget(doc.getElementById(id)!, key);
  for (const id of ['message', 'chat', 'todo', 'closed']) assert.equal(d(id).submit, 'text', id);
  // Not enough to go unasked: an expanded composer, an option that is not there, a panel that is no list of options,
  // and wording about search on a box where messages are written.
  for (const id of ['composer', 'dangling', 'panel', 'both']) assert.equal(d(id).submit, 'text', id);
  assert.equal(d('chat').label, 'Write a reply', 'the label the user is shown');
  for (const id of ['find', 'named', 'hinted', 'inside', 'palette']) assert.equal(d(id).submit, null, `${id} searches`);
  for (const id of ['combo', 'mention']) assert.equal(d(id).submit, null, `${id} has a list of options open`);
  assert.equal(d('check').submit, null);
  assert.equal(d('message', ' ').submit, null, 'a space is a character');
  assert.equal(d('text').submit, null);
  assert.equal(d('text').click, null, 'focusable by script only: not a control');
});

test('a long name is cut at a word and marked as cut, for the prompt the user reads', () => {
  const { doc } = page(`
    <textarea id="long" aria-label="Reply to the whole thread, visible to everyone in the project"></textarea>
    <textarea id="word" aria-label="${'x'.repeat(80)}"></textarea>
    <button id="button">Delete the repository and everything in it, including all issues and wikis</button>
    <textarea id="short" aria-label="Comment"></textarea>
  `);
  const key = (id: string): string => describeKeyTarget(doc.getElementById(id)!, 'Enter').label;
  assert.equal(key('long'), 'Reply to the whole thread, visible to everyone in the…');
  assert.equal(key('word'), `${'x'.repeat(59)}…`, 'one long word is cut where it has to be');
  assert.equal(key('short'), 'Comment');
  const button = describeClickTarget(doc.getElementById('button')!);
  assert.ok(button.label.length <= 60 && button.label.endsWith('…'), button.label);
  assert.equal(button.submit, 'likely', 'and what it says is still recognised');
});

test('Enter or Space on a control is described as the click it is', () => {
  const { doc } = page(`
    <form method="post"><input id="name"><button id="save">Save</button><input id="agree" type="checkbox"></form>
    <button id="plain">Show details</button>
    <button id="delete">Delete account</button>
    <a id="out" href="https://elsewhere.example/">Elsewhere</a>
    <div id="custom" tabindex="0">Remove member</div>
    <div id="quiet" tabindex="0">Next slide</div>
  `);
  const d = (id: string, key = 'Enter') => describeKeyTarget(doc.getElementById(id)!, key);
  for (const key of ['Enter', ' ']) {
    assert.equal(d('save', key).click?.submit, 'form', `save, ${JSON.stringify(key)}`);
    assert.equal(d('delete', key).click?.submit, 'likely');
    assert.equal(d('plain', key).click?.submit, null);
    assert.equal(d('out', key).click?.externalLink, true);
    // A control of the page's own making: its key handler decides, so the label is all there is.
    assert.equal(d('custom', key).click?.submit, 'likely');
    assert.equal(d('quiet', key).click?.submit, null);
  }
  assert.equal(d('agree', ' ').click?.submit, null, 'Space on a checkbox toggles it');
  assert.equal(d('agree', 'Enter').click, null);
  assert.equal(d('save', 'Tab').click, null);
  assert.equal(d('save', 'a').click, null);
});

test('wait_for resolves on text, visibility and enabled state, is bounded, and can be cancelled', async () => {
  const { doc } = page('<p id="status">Loading</p><button id="now">Now</button><button id="save" disabled>Save</button>');
  const state = new PageState();
  const registry = state.registry;
  const snap = takeSnapshot(doc, state).text;

  setTimeout(() => { doc.getElementById('status')!.textContent = 'All done'; }, 150);
  assert.equal((await waitFor(doc, registry, { text: 'all DONE', condition: 'visible', timeoutMs: 2000 })).satisfied, true);
  assert.equal((await waitFor(doc, registry, { text: 'Loading', condition: 'gone', timeoutMs: 500 })).satisfied, true);
  await assert.rejects(waitFor(doc, registry, { text: 'never shown', condition: 'visible', timeoutMs: 250 }),
    (e: unknown) => e instanceof DomError && e.code === 'WAIT_TIMEOUT');

  const save = refOf(snap, 'Button: Save');
  assert.equal((await waitFor(doc, registry, { ref: save, condition: 'disabled', timeoutMs: 300 })).satisfied, true);
  setTimeout(() => { (doc.getElementById('save') as HTMLButtonElement).disabled = false; }, 150);
  assert.equal((await waitFor(doc, registry, { ref: save, condition: 'enabled', timeoutMs: 2000 })).satisfied, true);

  const now = refOf(snap, 'Button: Now');
  setTimeout(() => doc.getElementById('now')!.remove(), 100);
  assert.equal((await waitFor(doc, registry, { ref: now, condition: 'gone', timeoutMs: 2000 })).satisfied, true);
  await assert.rejects(waitFor(doc, registry, { ref: 4242, condition: 'visible', timeoutMs: 100 }),
    (e: unknown) => e instanceof DomError && e.code === 'STALE_REF');

  const signal = { cancelled: false };
  setTimeout(() => { signal.cancelled = true; }, 150);
  const started = Date.now();
  await assert.rejects(waitFor(doc, registry, { text: 'never shown', condition: 'visible', timeoutMs: 20000, signal }),
    (e: unknown) => e instanceof DomError && e.code === 'CANCELLED');
  assert.ok(Date.now() - started < 2000, 'a cancelled wait stops promptly');
});

test('a frame of another site that is in view is counted, so that no picture is taken of it', () => {
  const { doc } = page(`<p>Outer</p>
    <iframe id="same" title="Help"></iframe>
    <iframe id="other" src="https://other.example/"></iframe>
    <iframe id="pixel" data-zero src="https://tracker.example/p"></iframe>
    <iframe id="hidden" style="display:none" src="https://other.example/x"></iframe>
    <embed id="file" src="https://files.example/report.pdf">
    <object id="own" data="/own.svg"></object>
    <object id="empty"></object>`);
  const foreign = (id: string): void => { Object.defineProperty(doc.getElementById(id), 'contentDocument', { get: () => null }); };
  // jsdom loads no frame of another site; make them look like ones this page may not read.
  for (const id of ['other', 'pixel', 'hidden']) foreign(id);
  const same = doc.getElementById('same') as HTMLIFrameElement;
  layout(same.contentWindow as Window);
  (same.contentDocument as Document).body.innerHTML = '<p>Inside</p>';

  // The frame of another site and the file from another site. Not the frame of this site, the file of
  // this site, the one without an address, the one that shows nothing, and the one that is not shown.
  assert.equal(foreignFramesInView(doc), 2);

  // A frame of another site inside a frame of this site is in the picture as well.
  (same.contentDocument as Document).body.innerHTML = '<iframe id="nested" src="https://third.example/"></iframe>';
  Object.defineProperty((same.contentDocument as Document).getElementById('nested'), 'contentDocument', { get: () => null });
  assert.equal(foreignFramesInView(doc), 3);

  // Gone from the page, they are gone from the count.
  for (const id of ['other', 'file', 'same']) doc.getElementById(id)?.remove();
  assert.equal(foreignFramesInView(doc), 0);
  assert.equal(foreignFramesInView(page('<p>No frame at all</p>').doc), 0);
});

test('wait_for changed is met when an element shows something else, and not while it stays as it is', async () => {
  const { doc } = page('<p id="status" role="status">Build running</p><input id="count" aria-label="Count" value="1"><button id="go">Go</button><input id="pw" type="password" aria-label="Password" value="a">');
  const state = new PageState('d1');
  const snap = takeSnapshot(doc, state).text;
  const registry = state.registry;
  const go = refOf(snap, 'Button: Go');
  const count = refOf(snap, 'Count');
  // Nothing changes: bounded, and it says so.
  await assert.rejects(waitFor(doc, registry, { ref: go, condition: 'changed', timeoutMs: 250 }),
    (e: unknown) => e instanceof DomError && e.code === 'WAIT_TIMEOUT' && /did not change/.test(e.message));
  // Its text is another.
  setTimeout(() => { (doc.getElementById('go') as HTMLElement).textContent = 'Going'; }, 100);
  assert.equal((await waitFor(doc, registry, { ref: go, condition: 'changed', timeoutMs: 2000 })).satisfied, true);
  // Its value is another, or one of its states.
  setTimeout(() => { (doc.getElementById('count') as HTMLInputElement).value = '2'; }, 100);
  assert.equal((await waitFor(doc, registry, { ref: count, condition: 'changed', timeoutMs: 2000 })).satisfied, true);
  setTimeout(() => doc.getElementById('go')?.setAttribute('aria-busy', 'true'), 100);
  assert.equal((await waitFor(doc, registry, { ref: go, condition: 'changed', timeoutMs: 2000 })).satisfied, true);
  // It is gone: that is a change too.
  setTimeout(() => doc.getElementById('go')?.remove(), 100);
  assert.equal((await waitFor(doc, registry, { ref: go, condition: 'changed', timeoutMs: 2000 })).satisfied, true);
  // What is typed into a password field is not looked at: a change of it is none here.
  const pw = refOf(snap, 'Password');
  setTimeout(() => { (doc.getElementById('pw') as HTMLInputElement).value = 'another'; }, 50);
  await assert.rejects(waitFor(doc, registry, { ref: pw, condition: 'changed', timeoutMs: 300 }),
    (e: unknown) => e instanceof DomError && e.code === 'WAIT_TIMEOUT');
});
