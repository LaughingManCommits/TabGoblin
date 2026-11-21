import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeSubmission } from '../src/policy.ts';
import { captureBaseline, contentDigest, observeSubmission, submissionPreview, submittedTexts, validationProblems } from '../src/submit.ts';
import { page } from './helpers.ts';

const FORM = `
  <ul id="comments"></ul>
  <form id="f">
    <label for="c">Comment</label><textarea id="c" required></textarea>
    <label for="e">Email</label><input id="e" type="email">
    <button id="send">Post</button>
  </form>
  <p id="status" role="status"></p>
  <p id="alert" role="alert"></p>
`;

function setup() {
  const { doc } = page(FORM);
  const el = (id: string) => doc.getElementById(id)!;
  return { doc, el, comment: el('c') as HTMLTextAreaElement, send: el('send') };
}

test('the browser\'s own form validation is reported before anything is submitted', () => {
  const { el, comment, send } = setup();
  assert.deepEqual(validationProblems(send).map((p) => p.split(':')[0]), ['Comment']);
  comment.value = 'Looks good';
  (el('e') as HTMLInputElement).value = 'not-an-email';
  assert.deepEqual(validationProblems(send).map((p) => p.split(':')[0]), ['Email']);
  (el('e') as HTMLInputElement).value = 'a@b.example';
  assert.deepEqual(validationProblems(send), []);
});

test('the submitted text appearing on the page confirms by content', () => {
  const { doc, el, comment, send } = setup();
  comment.value = 'Looks good to me';
  const baseline = captureBaseline(doc, 'd1', [comment], 'Looks good to me');
  assert.equal(baseline.expectCount, 0, 'text sitting in the field does not count as published');

  // Nothing happened yet: no signal, so no claim.
  const idle = observeSubmission(doc, 'd1', baseline, 'Looks good to me', send, [comment]);
  assert.equal(judgeSubmission(idle, true).state, 'UNCERTAIN');

  // The site accepts: comment listed, field cleared, status shown.
  el('comments').innerHTML = '<li>Looks good to me</li>';
  comment.value = '';
  el('status').textContent = 'Comment posted';
  const signals = observeSubmission(doc, 'd1', baseline, 'Looks good to me', send, [comment]);
  assert.equal(signals.expectSeen, true);
  assert.equal(signals.fieldsCleared, true);
  assert.deepEqual(signals.newStatuses, ['Comment posted']);
  const verdict = judgeSubmission(signals, true);
  assert.deepEqual([verdict.state, verdict.verified], ['CONFIRMED', 'content']);
});

test('text that was already on the page before does not count as confirmation', () => {
  const { doc, el, comment, send } = setup();
  el('comments').innerHTML = '<li>+1</li>';
  comment.value = '+1';
  const baseline = captureBaseline(doc, 'd1', [comment], '+1');
  assert.equal(baseline.expectCount, 1);
  const same = observeSubmission(doc, 'd1', baseline, '+1', send, [comment]);
  assert.equal(same.expectSeen, false);
  el('comments').innerHTML = '<li>+1</li><li>+1</li>';
  assert.equal(observeSubmission(doc, 'd1', baseline, '+1', send, [comment]).expectSeen, true);
});

test('error alerts and invalid fields make the submission FAILED', () => {
  const { doc, el, comment, send } = setup();
  comment.value = 'x';
  const baseline = captureBaseline(doc, 'd1', [comment], undefined);
  el('alert').textContent = 'Comment is too short';
  comment.setAttribute('aria-invalid', 'true');
  const signals = observeSubmission(doc, 'd1', baseline, undefined, send, [comment]);
  assert.deepEqual(signals.newAlerts, ['Comment is too short']);
  assert.deepEqual(signals.invalidFields, ['Comment']);
  const verdict = judgeSubmission(signals, false);
  assert.equal(verdict.state, 'FAILED');
  assert.match(verdict.evidence.join(' | '), /Comment is too short/);
});

test('an alert that was already showing is not blamed on the submission', () => {
  const { doc, el, comment, send } = setup();
  el('alert').textContent = 'Maintenance tonight';
  comment.value = 'x';
  const baseline = captureBaseline(doc, 'd1', [comment], undefined);
  comment.value = '';
  const signals = observeSubmission(doc, 'd1', baseline, undefined, send, [comment]);
  assert.deepEqual(signals.newAlerts, []);
  assert.deepEqual(judgeSubmission(signals, false).state, 'CONFIRMED');
});

test('after a navigation the new document is judged without the old elements', () => {
  const before = setup();
  before.comment.value = 'Shipping it';
  const baseline = captureBaseline(before.doc, 'd1', [before.comment], 'Shipping it');

  const after = page('<h1>Thread</h1><ul><li>Shipping it</li></ul>', 'https://app.example/thread/7');
  const signals = observeSubmission(after.doc, 'd2', baseline, 'Shipping it', null, []);
  assert.equal(signals.documentChanged, true);
  assert.equal(signals.urlChanged, true);
  assert.equal(signals.expectSeen, true);
  assert.equal(judgeSubmission(signals, true).verified, 'content');

  const errorPage = page('<p role="alert">Session expired</p>', 'https://app.example/login');
  assert.equal(judgeSubmission(observeSubmission(errorPage.doc, 'd3', baseline, 'Shipping it', null, []), true).state, 'FAILED');
});

test('submitted text is recognised on the page without the agent naming it', () => {
  const { doc, el, comment, send } = setup();
  comment.value = 'Ship it on Friday';
  (el('e') as HTMLInputElement).value = 'ada@example.org';
  const submitted = submittedTexts(send, [comment]);
  assert.deepEqual(submitted, ['Ship it on Friday', 'ada@example.org']);
  const baseline = captureBaseline(doc, 'd1', [comment], undefined, submitted);
  assert.deepEqual(baseline.submittedCounts, [0, 0]);
  assert.equal(observeSubmission(doc, 'd1', baseline, undefined, send, [comment], submitted).submittedSeen, false);

  el('comments').innerHTML = '<li>Ship it on Friday</li>';
  comment.value = '';
  const signals = observeSubmission(doc, 'd1', baseline, undefined, send, [comment], submitted);
  assert.equal(signals.submittedSeen, true);
  assert.deepEqual(judgeSubmission(signals, false).verified, 'content');

  // After a navigation the agent's own texts are still recognised.
  const after = page('<p>Saved: Ship it on Friday</p>', 'https://app.example/done');
  assert.equal(observeSubmission(after.doc, 'd2', baseline, undefined, null, [], ['Ship it on Friday']).submittedSeen, true);
});

test('an editor behind a keyboard input is judged by the text it shows, not by that input', () => {
  const { doc } = page(`
    <div id="editor"><div id="lines">let total = 1;</div><textarea id="in" data-zero></textarea></div>`);
  const input = doc.getElementById('in') as HTMLTextAreaElement;
  const lines = doc.getElementById('lines')!;
  // Such an input holds a character or two while a key is handled, and is emptied afterwards.
  input.value = 'x';
  const baseline = captureBaseline(doc, 'd1', [input], undefined, submittedTexts(input, [input]));
  assert.deepEqual(baseline.fieldValues, ['let total = 1;']);
  // Enter started a new line: the input is empty again, the editor holds more than before.
  input.value = '';
  lines.textContent = 'let total = 1;\n';
  const signals = observeSubmission(doc, 'd1', baseline, undefined, input, [input], submittedTexts(input, [input]));
  assert.equal(signals.fieldsCleared, false, 'nothing was cleared, so nothing counts as sent');
  assert.equal(judgeSubmission(signals, false).state, 'UNCERTAIN');
  // The same content has the same fingerprint, whatever the input happens to hold.
  lines.textContent = 'let total = 1;';
  input.value = 'q';
  const one = contentDigest(input, [input]);
  input.value = '';
  assert.equal(contentDigest(input, [input]), one);
});

test('the user is shown the beginning of what would be sent, and never a password', () => {
  const { doc } = page(`
    <label for="n">Display name</label><input id="n" value="old name">
    <label for="p">Password</label><input id="p" type="password" value="hunter2">
    <label for="t">Token</label><input id="t" autocomplete="one-time-code" value="123456">
    <label for="c">Comment</label><textarea id="c"></textarea>
    <label for="e">Email</label><input id="e" type="email">
    <label for="x">Extra</label><input id="x">`);
  const field = (id: string): Element => doc.getElementById(id)!;
  // What a field is about to be filled with counts, not what it holds now.
  assert.deepEqual(submissionPreview([field('n')], ['Ada Lovelace']), [{ field: 'Display name', text: 'Ada Lovelace' }]);
  // Without that, what it holds: what Enter would send.
  assert.deepEqual(submissionPreview([field('n')]), [{ field: 'Display name', text: 'old name' }]);
  // Credentials are left out, also when the agent supplied them.
  assert.deepEqual(submissionPreview([field('p'), field('t')], ['hunter2', '123456']), []);
  // Long text is cut, line breaks are folded, empty fields are left out, and there are at most three.
  const long = submissionPreview([field('c')], [`first line\n${'word '.repeat(60)}`])[0].text;
  assert.ok(long.startsWith('first line word') && long.length === 120 && long.endsWith('…'), long);
  const many = submissionPreview([field('n'), field('c'), field('e'), field('x')], ['a', '', 'b', 'c']);
  assert.deepEqual(many.map((part) => part.field), ['Display name', 'Email', 'Extra']);
  assert.equal(submissionPreview([field('n'), field('c'), field('e'), field('x')], ['a', 'b', 'c', 'd']).length, 3);
});

test('short values, passwords and non-text fields are not used as evidence', () => {
  const { doc } = page(`
    <form><input id="a" value="ok"><input id="p" type="password" value="hunter2hunter2">
    <input id="n" type="number" value="123456"><input id="c" type="checkbox" checked>
    <input id="t" name="api_token" value="sk-live-abcdef"><textarea id="x">A real sentence.</textarea>
    <button id="go">Go</button></form>`);
  assert.deepEqual(submittedTexts(doc.getElementById('go')!, []), ['A real sentence.']);
});

test('a submission is fingerprinted before anything is typed', () => {
  const filled = setup();
  filled.comment.value = 'Same words';
  const untouched = setup();
  // What the fields are about to hold gives the same fingerprint as when they already hold it.
  assert.equal(contentDigest(untouched.send, [untouched.comment], ['Same words']), contentDigest(filled.send, [filled.comment]));
  assert.equal(untouched.comment.value, '', 'fingerprinting must not touch the field');
  assert.notEqual(contentDigest(untouched.send, [untouched.comment], ['Other words']), contentDigest(filled.send, [filled.comment]));
});

test('identical content has the same fingerprint, and the fingerprint reveals nothing', () => {
  const a = setup();
  a.comment.value = 'Same words';
  const b = setup();
  b.comment.value = 'Same words';
  const digest = contentDigest(a.send, []);
  assert.ok(digest);
  assert.equal(contentDigest(b.send, []), digest);
  assert.ok(!digest.includes('Same'), digest);

  b.comment.value = 'Other words';
  assert.notEqual(contentDigest(b.send, []), digest);

  const empty = setup();
  assert.equal(contentDigest(empty.send, []), null, 'nothing to fingerprint');

  // A loose button fingerprints the fields the agent named.
  const loose = page('<div id="ed" contenteditable="true">Note text</div><div id="save" role="button">Save note</div>');
  const save = loose.doc.getElementById('save')!;
  assert.equal(contentDigest(save, []), null);
  assert.ok(contentDigest(save, [loose.doc.getElementById('ed')!]));
});
