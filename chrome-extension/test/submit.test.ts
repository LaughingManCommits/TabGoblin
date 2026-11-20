import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeSubmission } from '../src/policy.ts';
import { captureBaseline, contentDigest, observeSubmission, validationProblems } from '../src/submit.ts';
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
