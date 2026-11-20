import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clickElement, describeClickTarget, fillElement, waitFor } from '../src/interact.ts';
import { DomError, RefRegistry, takeSnapshot } from '../src/snapshot.ts';
import { page, refOf } from './helpers.ts';

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

  const registry = new RefRegistry();
  const snap = takeSnapshot(doc, registry).text;
  const result = clickElement(registry.resolve(refOf(snap, 'Button: Go')));
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

  const note = doc.getElementById('note') as HTMLTextAreaElement;
  fillElement(note, 'line 1\nline 2', false);
  assert.equal(note.value, 'line 1\nline 2');
});

test('fill selects options by label or value, and edits contenteditable regions', () => {
  const { doc } = page(`
    <select id="s"><option value="lo">Low</option><option value="hi">High</option></select>
    <div id="e" contenteditable="true">draft</div>
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

  const editor = doc.getElementById('e')!;
  let inputs = 0;
  editor.addEventListener('input', () => inputs++);
  assert.equal(fillElement(editor, 'final text', false).valueMatches, true);
  assert.equal(editor.textContent, 'final text');
  fillElement(editor, '!', true);
  assert.equal(editor.textContent, 'final text!');
  assert.ok(inputs >= 2);
});

test('fill refuses password and credential fields, read-only fields and non-text elements', () => {
  const { doc } = page(`
    <input type="password" id="pw" value="keep">
    <input name="otp" id="otp">
    <input autocomplete="cc-number" id="cc">
    <input id="ro" readonly value="fixed">
    <input id="dis" disabled>
    <input type="checkbox" id="cb">
    <input type="file" id="file">
    <button id="btn">B</button>
    <p id="p">text</p>
  `);
  const el = (id: string): Element => doc.getElementById(id)!;
  assert.equal(errorCode(() => fillElement(el('pw'), 'x', false)), 'SENSITIVE_FIELD');
  assert.equal(errorCode(() => fillElement(el('otp'), '123456', false)), 'SENSITIVE_FIELD');
  assert.equal(errorCode(() => fillElement(el('cc'), '4111', false)), 'SENSITIVE_FIELD');
  assert.equal(errorCode(() => fillElement(el('ro'), 'x', false)), 'ELEMENT_DISABLED');
  assert.equal(errorCode(() => fillElement(el('dis'), 'x', false)), 'ELEMENT_DISABLED');
  assert.equal(errorCode(() => fillElement(el('cb'), 'x', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal(errorCode(() => fillElement(el('file'), 'C:\\secret.txt', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal(errorCode(() => fillElement(el('btn'), 'x', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal(errorCode(() => fillElement(el('p'), 'x', false)), 'UNSUPPORTED_ELEMENT');
  assert.equal((el('pw') as HTMLInputElement).value, 'keep');
  assert.equal((el('ro') as HTMLInputElement).value, 'fixed');
});

test('click targets are classified: links, toggles, form submissions, likely submissions', () => {
  const { doc } = page(`
    <a id="same" href="/next">Next</a>
    <a id="ext" href="https://other.example/">Elsewhere</a>
    <a id="js" href="javascript:void(0)">Run</a>
    <details><summary id="sum">More</summary>x</details>
    <form method="post" action="/save">
      <button id="implicit">Save</button>
      <button id="plain" type="button">Preview</button>
      <input id="isub" type="submit" value="Go">
    </form>
    <form role="search"><input type="search"><button id="search">Search</button></form>
    <form><input name="comment"><button id="getform">Add</button></form>
    <button id="del" type="button">Delete draft</button>
    <button id="show" type="button">Show statistics</button>
    <div id="tab" role="tab">Archive</div>
    <div id="divbtn" role="button">Publish</div>
  `);
  const d = (id: string) => describeClickTarget(doc.getElementById(id)!);
  assert.deepEqual(d('same'), { readSafe: true, externalLink: false, submit: null, label: 'Next' });
  assert.equal(d('ext').externalLink, true);
  assert.equal(d('ext').readSafe, false);
  assert.equal(d('js').readSafe, false, 'javascript: links are controls, not navigation');
  assert.equal(d('sum').readSafe, true);
  assert.equal(d('implicit').submit, 'form', 'a button in a form submits by default');
  assert.equal(d('isub').submit, 'form');
  assert.equal(d('plain').submit, null);
  assert.equal(d('search').submit, null, 'an explicit GET search form only reads');
  assert.equal(d('getform').submit, 'form', 'other forms are submissions even without method=post');
  assert.equal(d('del').submit, 'likely');
  assert.equal(d('divbtn').submit, 'likely');
  assert.equal(d('show').submit, null);
  assert.equal(d('tab').submit, null, 'tabs are navigation even when the label sounds like an action');
  for (const id of ['implicit', 'plain', 'del', 'show', 'divbtn', 'tab']) assert.equal(d(id).readSafe, false, id);
});

test('wait_for resolves when text appears or an element shows, and is bounded', async () => {
  const { doc } = page('<p id="status">Loading</p><button id="later" style="display:none">Later</button><button id="now">Now</button>');
  const registry = new RefRegistry();
  const snap = takeSnapshot(doc, registry).text;

  setTimeout(() => { doc.getElementById('status')!.textContent = 'All done'; }, 150);
  const appeared = await waitFor(doc, registry, { text: 'all DONE', timeoutMs: 2000 });
  assert.equal(appeared.satisfied, true);

  const gone = await waitFor(doc, registry, { text: 'Loading', gone: true, timeoutMs: 500 });
  assert.equal(gone.satisfied, true);

  await assert.rejects(waitFor(doc, registry, { text: 'never shown', timeoutMs: 250 }),
    (e: unknown) => e instanceof DomError && e.code === 'WAIT_TIMEOUT');

  const now = refOf(snap, 'Button: Now');
  assert.equal((await waitFor(doc, registry, { ref: now, timeoutMs: 300 })).satisfied, true);
  setTimeout(() => doc.getElementById('now')!.remove(), 100);
  assert.equal((await waitFor(doc, registry, { ref: now, gone: true, timeoutMs: 2000 })).satisfied, true);
  await assert.rejects(waitFor(doc, registry, { ref: 4242, timeoutMs: 100 }),
    (e: unknown) => e instanceof DomError && e.code === 'STALE_REF');
});
