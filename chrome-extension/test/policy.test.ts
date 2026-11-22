import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLOW_LASTS_MS, CommandError, NO_STANDS_MS, RateLimiter, RecentIds, UNASKED_PER_MINUTE, UNWELCOME_AFTER, activityLabel, askModeOf,
  checkAsk, checkClick, checkGate, checkKey, endedLine, failureNote, highImpactWord, inScope, isHighImpact, needsAsking, noteAnswer, notePassed,
  rememberAllow, remembersAllow, standingAllows, standingRefusals,
  judgeSubmission, looksLikeSearch, looksLikeSubmission, originOf, parseKey, resolveNavigation, resolveSession, sessionsOfAgent,
  HEARTBEATS_UNANSWERED, badgeFor, serverGone,
  type ClickTarget, type KeyTarget, type Mode, type SessionAuth, type SubmitSignals,
} from '../src/policy.ts';

const ORIGIN = 'https://app.example';
const HERE = 'https://app.example/issues/12?tab=all';
const READ_ACTIONS = ['snapshot', 'extract', 'scroll', 'screenshot', 'wait_for'];
const EXPLORE_ACTIONS = ['navigate', 'click', 'press_key'];
const WRITE_ACTIONS = ['fill', 'submit'];
const ALL_ACTIONS = [...READ_ACTIONS, ...EXPLORE_ACTIONS, ...WRITE_ACTIONS];

function session(over: Partial<SessionAuth> = {}): SessionAuth {
  return {
    id: 's1', authorizationId: 'a1', tabId: 7, origin: ORIGIN, origins: [ORIGIN], mode: 'read', paused: false,
    suspended: false, clientId: 'c-me', clientName: 'IDE', expiresAt: null, ...over,
  };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CommandError, `expected CommandError, got ${String(e)}`);
    return e.code;
  }
  return 'ok';
}

test('origin is scheme + hostname + port; only http(s) pages have one', () => {
  assert.equal(originOf('https://app.example/a/b?c#d'), 'https://app.example');
  assert.equal(originOf('http://app.example:8080/'), 'http://app.example:8080');
  assert.equal(originOf('https://app.example:443/'), 'https://app.example');
  for (const url of ['chrome://extensions', 'file:///C:/x.html', 'about:blank', 'javascript:alert(1)', 'not a url', '', undefined, null]) {
    assert.equal(originOf(url), null, String(url));
  }
});

test('every command is refused until the user authorizes a tab', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(code(() => checkGate(null, action, HERE)), 'NOT_AUTHORIZED', action);
  }
  assert.equal(code(() => checkGate(null, 'status', undefined)), 'ok');
});

test('Read looks, Explore also navigates, Write also operates', () => {
  const allowed: Record<Mode, string[]> = {
    read: READ_ACTIONS,
    explore: [...READ_ACTIONS, ...EXPLORE_ACTIONS],
    write: ALL_ACTIONS,
  };
  for (const mode of ['read', 'explore', 'write'] as const) {
    for (const action of ALL_ACTIONS) {
      const expected = allowed[mode].includes(action) ? 'ok'
        : WRITE_ACTIONS.includes(action) ? 'WRITE_NOT_AUTHORIZED' : 'EXPLORE_NOT_AUTHORIZED';
      assert.equal(code(() => checkGate(session({ mode }), action, HERE)), expected, `${mode} ${action}`);
    }
  }
});

test('other origins, subdomains, schemes and ports are outside the authorization', () => {
  const elsewhere = [
    'https://evil.example/issues/12',
    'https://sub.app.example/',
    'https://example/',
    'http://app.example/',
    'https://app.example:8443/',
    'https://app.example.evil.test/',
    'chrome://settings',
    'about:blank',
  ];
  for (const url of elsewhere) {
    assert.equal(code(() => checkGate(session({ mode: 'write' }), 'snapshot', url)), 'ORIGIN_MISMATCH', url);
  }
  assert.equal(code(() => checkGate(session({ mode: 'write' }), 'click', undefined)), 'ORIGIN_MISMATCH', 'unknown URL fails closed');
});

test('pause and expiry block everything except status', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(code(() => checkGate(session({ mode: 'write', paused: true }), action, HERE)), 'PAUSED', action);
    assert.equal(code(() => checkGate(session({ mode: 'write', expiresAt: 1000 }), action, HERE, 1000)), 'AUTHORIZATION_EXPIRED', action);
  }
  assert.equal(code(() => checkGate(session({ mode: 'write', expiresAt: 1000 }), 'snapshot', HERE, 999)), 'ok');
  assert.equal(code(() => checkGate(session({ paused: true }), 'status', HERE)), 'ok');
});

test('a session may span the sites the user added to it, and nothing else', () => {
  const sso = session({ mode: 'write', origins: [ORIGIN, 'https://login.example'] });
  assert.equal(code(() => checkGate(sso, 'snapshot', 'https://login.example/signin')), 'ok');
  assert.equal(code(() => checkGate(sso, 'snapshot', HERE)), 'ok');
  assert.equal(code(() => checkGate(sso, 'snapshot', 'https://evil.example/')), 'ORIGIN_MISMATCH');
  assert.equal(code(() => checkGate(sso, 'snapshot', 'https://sub.login.example/')), 'ORIGIN_MISMATCH');
  assert.equal(inScope(sso.origins, 'https://login.example/x'), true);
  assert.equal(inScope(sso.origins, undefined), false);
  assert.equal(inScope([], HERE), false);
  assert.equal(resolveNavigation('https://login.example/signin', HERE, sso.origins), 'https://login.example/signin');
  assert.equal(code(() => resolveNavigation('https://other.example/', HERE, sso.origins)), 'NAVIGATION_BLOCKED');
});

test('a suspended session exposes nothing, even on a page it is authorized for', () => {
  const suspended = session({ mode: 'write', suspended: true });
  for (const action of ALL_ACTIONS) {
    assert.equal(code(() => checkGate(suspended, action, HERE)), 'SESSION_SUSPENDED', action);
  }
  assert.equal(code(() => checkGate(suspended, 'status', HERE)), 'ok');
});

test('there are no actions for scripts, cookies, storage or raw requests', () => {
  for (const action of ['evaluate', 'eval', 'cookies', 'storage', 'headers', 'request', 'fetch', 'debugger', '']) {
    assert.equal(code(() => checkGate(session({ mode: 'write' }), action, HERE)), 'UNSUPPORTED_ACTION', action);
  }
});

test('an agent reaches only its own sessions, and must name one when it has several', () => {
  const mine = session({ id: 's1', clientId: 'c-me' });
  const theirs = session({ id: 's2', clientId: 'c-other', clientName: 'Other', origin: 'https://docs.example' });
  const me = { id: 'c-me', name: 'IDE' };
  const connected = new Set(['c-me', 'c-other']);

  assert.deepEqual(resolveSession([mine, theirs], me, undefined, connected), { session: mine, claim: false });
  assert.deepEqual(resolveSession([mine, theirs], me, 's1', connected), { session: mine, claim: false });
  assert.equal(code(() => resolveSession([mine, theirs], me, 's2', connected)), 'SESSION_NOT_OWNED');
  assert.equal(code(() => resolveSession([mine, theirs], me, 's9', connected)), 'UNKNOWN_SESSION');
  assert.equal(code(() => resolveSession([theirs], me, undefined, connected)), 'NOT_AUTHORIZED');

  const second = session({ id: 's3', clientId: 'c-me', origin: 'https://wiki.example' });
  assert.equal(code(() => resolveSession([mine, second], me, undefined, connected)), 'SESSION_REQUIRED');
  assert.deepEqual(resolveSession([mine, second], me, 's3', connected), { session: second, claim: false });
});

test('an unclaimed session goes to the first agent that uses it', () => {
  const open = session({ clientId: null, clientName: null });
  const resolved = resolveSession([open], { id: 'c-me', name: 'IDE' }, undefined, new Set(['c-me']));
  assert.equal(resolved.session, open);
  assert.equal(resolved.claim, true);
});

test('a restarted agent takes its sessions back, but never those of an agent that is still there', () => {
  const left = session({ clientId: 'c-old', clientName: 'IDE' });
  const reborn = { id: 'c-new', name: 'IDE' };
  // The old server process is gone: the same-named agent continues.
  assert.deepEqual(resolveSession([left], reborn, 's1', new Set(['c-new'])), { session: left, claim: true });
  // The owner is still connected: no takeover, even with the same name.
  assert.equal(code(() => resolveSession([left], reborn, 's1', new Set(['c-new', 'c-old']))), 'SESSION_NOT_OWNED');
  // A different agent never inherits, and a nameless one matches nobody.
  assert.equal(code(() => resolveSession([left], { id: 'c-x', name: 'Other' }, 's1', new Set(['c-x']))), 'SESSION_NOT_OWNED');
  assert.equal(code(() => resolveSession([session({ clientId: 'c-old', clientName: null })], { id: 'c-x', name: '' }, 's1', new Set(['c-x']))), 'SESSION_NOT_OWNED');
});

test('a disconnected agent takes its sessions with it: its own and its former self\'s, and no others', () => {
  const mine = session({ id: 's1', clientId: 'c-me' });
  const second = session({ id: 's2', clientId: 'c-me', origin: 'https://wiki.example' });
  const theirs = session({ id: 's3', clientId: 'c-other', clientName: 'Other' });
  const open = session({ id: 's4', clientId: null, clientName: null });
  const left = session({ id: 's5', clientId: 'c-old', clientName: 'IDE' });
  const leftByAnother = session({ id: 's6', clientId: 'c-gone', clientName: 'Other' });
  const all = [mine, second, theirs, open, left, leftByAnother];
  const me = { id: 'c-me', name: 'IDE' };
  const connected = new Set(['c-me', 'c-other']);

  // What it could use, less what was given to no agent: exactly the tabs it would have after "Allow again".
  assert.deepEqual(sessionsOfAgent(all, me, connected), [mine, second, left]);
  // While the agent that left them is still connected, they are that agent's.
  assert.deepEqual(sessionsOfAgent(all, me, new Set(['c-me', 'c-other', 'c-old'])), [mine, second]);
  // An agent that is not connected any more, so that its name is not known: what carries its id.
  assert.deepEqual(sessionsOfAgent(all, { id: 'c-me', name: '' }, new Set(['c-other'])), [mine, second]);
  // An agent without a name is nobody's former self.
  assert.deepEqual(sessionsOfAgent([session({ clientId: 'c-old', clientName: null }), open], { id: 'c-x', name: '' }, new Set(['c-x'])), []);
  assert.deepEqual(sessionsOfAgent(all, { id: 'c-none', name: 'Nobody' }, connected), []);
});

test('navigation resolves relative URLs and stays inside the origin', () => {
  assert.equal(resolveNavigation('/settings', HERE, ORIGIN), 'https://app.example/settings');
  assert.equal(resolveNavigation('13', HERE, ORIGIN), 'https://app.example/issues/13');
  assert.equal(resolveNavigation('?tab=open', HERE, ORIGIN), 'https://app.example/issues/12?tab=open');
  assert.equal(resolveNavigation('https://app.example/x#y', HERE, ORIGIN), 'https://app.example/x#y');
  assert.equal(resolveNavigation('HTTPS://APP.EXAMPLE:443/x', HERE, ORIGIN), 'https://app.example/x');
});

test('navigation outside the origin is rejected', () => {
  const blocked = [
    'https://evil.example/',
    '//evil.example/path',
    'https://sub.app.example/',
    'http://app.example/',
    'https://app.example:8443/',
    'https://app.example@evil.example/',
    'https://user:pw@app.example/',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'file:///etc/passwd',
    'chrome://settings',
    'view-source:https://app.example/',
    '\\\\evil.example\\share',
  ];
  for (const url of blocked) {
    assert.equal(code(() => resolveNavigation(url, HERE, ORIGIN)), 'NAVIGATION_BLOCKED', url);
  }
  assert.equal(code(() => resolveNavigation('https://', HERE, ORIGIN)), 'INVALID_URL');
});

const target = (over: Partial<ClickTarget> = {}): ClickTarget =>
  ({ readSafe: false, disclosure: false, externalLink: false, submit: null, label: 'Thing', ...over });

test('Read cannot click; Explore clicks links and expanders only', () => {
  assert.equal(code(() => checkClick('read', 'interact', target({ readSafe: true }))), 'EXPLORE_NOT_AUTHORIZED');
  assert.equal(checkClick('explore', 'interact', target({ readSafe: true })), 'interact');
  assert.equal(checkClick('explore', 'interact', target({ disclosure: true })), 'interact');
  assert.equal(code(() => checkClick('explore', 'interact', target())), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('explore', 'interact', target({ submit: 'form' }))), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('explore', 'interact', target({ disclosure: true, submit: 'likely' }))), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(() => checkClick('explore', 'submit', target({ readSafe: true }))), 'WRITE_NOT_AUTHORIZED');
});

test('Write clicks ordinary controls but submissions need explicit intent', () => {
  assert.equal(checkClick('write', 'interact', target()), 'interact');
  assert.equal(code(() => checkClick('write', 'interact', target({ submit: 'form' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(code(() => checkClick('write', 'interact', target({ submit: 'likely' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkClick('write', 'submit', target({ submit: 'form' })), 'submit');
  assert.equal(checkClick('write', 'submit', target()), 'submit');
});

test('links that leave the origin are never clicked', () => {
  for (const mode of ['read', 'explore', 'write'] as const) {
    for (const intent of ['interact', 'submit'] as const) {
      assert.equal(code(() => checkClick(mode, intent, target({ externalLink: true }))), 'NAVIGATION_BLOCKED');
    }
  }
});

test('submission and high-impact wording is recognised, ordinary UI wording is not', () => {
  for (const label of ['Submit', 'Save changes', 'Post comment', 'Delete draft', 'Send', 'Place order', 'Sign up', 'Log out', 'Merge pull request']) {
    assert.ok(looksLikeSubmission(label), label);
  }
  for (const label of ['Show statistics', 'Next page', 'Open menu', 'Load updates', 'Expand all', 'Postpone view', 'Savings', '']) {
    assert.ok(!looksLikeSubmission(label), label);
  }
  for (const label of ['Delete account', 'Pay now', 'Buy', 'Transfer funds', 'Publish release', 'Remove member']) {
    assert.ok(isHighImpact(label), label);
  }
  for (const label of ['Save draft', 'Post comment', 'Search', 'Update profile', 'Payment history']) {
    assert.ok(!isHighImpact(label), label);
  }
  // The user is told which word it was.
  assert.equal(highImpactWord('Delete account'), 'delete');
  assert.equal(highImpactWord('Proceed to Checkout'), 'checkout');
  assert.equal(highImpactWord('Save draft'), null);
});

test('keys are normalised; moving around needs Explore, typing and Enter need Write', () => {
  assert.deepEqual(parseKey('enter'), { key: 'Enter', mode: 'write' });
  assert.deepEqual(parseKey('Esc'), { key: 'Escape', mode: 'explore' });
  assert.deepEqual(parseKey('shift+tab'), { key: 'Shift+Tab', mode: 'explore' });
  assert.deepEqual(parseKey('ArrowDown'), { key: 'ArrowDown', mode: 'explore' });
  assert.deepEqual(parseKey('Space'), { key: ' ', mode: 'write' });
  assert.deepEqual(parseKey('a'), { key: 'a', mode: 'write' });
  assert.deepEqual(parseKey('é'), { key: 'é', mode: 'write' });
  for (const bad of ['Control+A', 'F5', 'ab', 'Meta', '']) {
    assert.equal(code(() => parseKey(bad)), 'INVALID_ARGUMENT', bad);
  }
});

const key = (over: Partial<KeyTarget> = {}): KeyTarget => ({ submit: null, click: null, label: 'Message', ...over });

test('Enter in a text box is a submission: it needs intent, and is then put to the user', () => {
  // A key that submits nothing and activates nothing is simply pressed.
  assert.equal(checkKey('write', 'interact', key()), 'press');
  assert.equal(checkKey('explore', 'interact', key()), 'press');

  for (const submit of ['form', 'text'] as const) {
    assert.equal(code(() => checkKey('write', 'interact', key({ submit }))), 'SUBMIT_INTENT_REQUIRED', submit);
    assert.equal(checkKey('write', 'submit', key({ submit })), 'ask', submit);
    assert.equal(code(() => checkKey('explore', 'submit', key({ submit }))), 'WRITE_NOT_AUTHORIZED', submit);
  }
  // The refusal says how a line break is entered instead, so that an agent does not reach for intent.
  try {
    checkKey('write', 'interact', key({ submit: 'text' }));
    assert.fail('expected a refusal');
  } catch (e) {
    assert.match((e as Error).message, /line break.*browser_fill/);
  }
});

test('a key that activates a control is a click on it, with the rules of a click', () => {
  const click = (over: Partial<ClickTarget> = {}): KeyTarget => key({ click: target(over) });
  assert.equal(checkKey('write', 'interact', click()), 'press');
  assert.equal(code(() => checkKey('write', 'interact', click({ submit: 'form' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(code(() => checkKey('write', 'interact', click({ submit: 'likely' }))), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkKey('write', 'submit', click({ submit: 'form' })), 'click', 'declared: run as a submission of that control');
  assert.equal(code(() => checkKey('write', 'interact', click({ externalLink: true }))), 'NAVIGATION_BLOCKED');
  assert.equal(code(() => checkKey('write', 'submit', click({ externalLink: true }))), 'NAVIGATION_BLOCKED');
});

test('search wording is recognised, so that Enter in a search box is not held up', () => {
  for (const label of ['Search', 'Search issues…', 'Filter by name', 'Find in page']) assert.ok(looksLikeSearch(label), label);
  for (const label of ['Message', 'Write a comment', 'New note', 'Reply', 'Research notes', 'Go to file', 'Jump to…', '']) assert.ok(!looksLikeSearch(label), label);
});

test('a no stands for a while: the same request is not put to the user again', () => {
  const t0 = 1_000_000;
  assert.equal(code(() => checkAsk(undefined, 'click:Post', false, t0)), 'ok', 'nothing is remembered yet');
  const declined = noteAnswer(undefined, 'click:Post', 'click', 'Post', 'deny', t0);
  assert.equal(code(() => checkAsk(declined, 'click:Post', false, t0 + 1000)), 'SUBMIT_DENIED');
  // Another control, or the same name used another way, is another request.
  assert.equal(code(() => checkAsk(declined, 'click:Save', false, t0 + 1000)), 'ok');
  assert.equal(code(() => checkAsk(declined, 'enter:Post', false, t0 + 1000)), 'ok');
  // It ends by itself.
  assert.equal(code(() => checkAsk(declined, 'click:Post', false, t0 + NO_STANDS_MS)), 'ok');
  assert.deepEqual(standingRefusals(declined, t0 + 1000), { requests: [{ how: 'click', label: 'Post' }], all: false });
  assert.deepEqual(standingRefusals(declined, t0 + NO_STANDS_MS), { requests: [], all: false });
  // The user is told what kind of request they declined: Enter in a box of that name is another one.
  const both = noteAnswer(declined, 'enter:Post', 'enter', 'Post', 'deny', t0 + 500);
  assert.deepEqual(standingRefusals(both, t0 + 1000).requests, [{ how: 'click', label: 'Post' }, { how: 'enter', label: 'Post' }]);
  // A no that was kept from before the kind was noted is listed by its name alone.
  const kept = { declined: [{ key: 'click:Old', label: 'Old', at: t0 }], refusedInARow: 1, refusedAt: t0 };
  assert.deepEqual(standingRefusals(kept, t0 + 1000).requests, [{ how: null, label: 'Old' }]);
  // An allow of the same request lifts it. That happens after the user took the no back.
  const allowed = noteAnswer(declined, 'click:Post', 'click', 'Post', 'allow', t0 + 2000);
  assert.equal(code(() => checkAsk(allowed, 'click:Post', false, t0 + 3000)), 'ok');
});

test('a session whose requests are refused again and again is not heard for a while', () => {
  const t0 = 1_000_000;
  let memory = noteAnswer(undefined, 'click:A', 'click', 'A', 'deny', t0);
  memory = noteAnswer(memory, 'click:B', 'click', 'B', 'timeout', t0 + 1000);
  assert.equal(code(() => checkAsk(memory, 'click:C', false, t0 + 2000)), 'ok', `not yet after ${UNWELCOME_AFTER - 1}`);
  memory = noteAnswer(memory, 'click:C', 'click', 'C', 'deny', t0 + 2000);
  assert.equal(code(() => checkAsk(memory, 'click:D', false, t0 + 3000)), 'SUBMIT_DENIED', 'a request it never made before');
  assert.equal(standingRefusals(memory, t0 + 3000).all, true);
  assert.deepEqual(standingRefusals(memory, t0 + 3000).requests.map((r) => r.label), ['A', 'C'], 'what was left unanswered was not declined');
  assert.equal(code(() => checkAsk(memory, 'click:D', false, t0 + 2000 + NO_STANDS_MS)), 'ok', 'it ends by itself');
  // An allow in between ends the run.
  let mixed = noteAnswer(undefined, 'click:A', 'click', 'A', 'deny', t0);
  mixed = noteAnswer(mixed, 'click:B', 'click', 'B', 'deny', t0);
  mixed = noteAnswer(mixed, 'click:C', 'click', 'C', 'allow', t0);
  mixed = noteAnswer(mixed, 'click:D', 'click', 'D', 'deny', t0);
  assert.equal(code(() => checkAsk(mixed, 'click:E', false, t0 + 1000)), 'ok');
});

test('an Allow stands in the automatic mode only, and never for a high-impact control or one without a name', () => {
  const site = 'https://chat.example';
  assert.equal(remembersAllow('auto', null, 'Message', site), true);
  assert.equal(remembersAllow('always', null, 'Message', site), false);
  assert.equal(remembersAllow('never', null, 'Message', site), false);
  assert.equal(remembersAllow('auto', 'delete', 'Delete thread', site), false);
  // Without a name it could not be told from another control without one, nor be shown to the user.
  assert.equal(remembersAllow('auto', null, '', site), false);
  assert.equal(remembersAllow('auto', null, '  ', site), false);
  assert.equal(remembersAllow('auto', null, 'Message', null), false, 'a tab whose address is not known');
});

test('asking every time, never, or the first time for each control', () => {
  const site = 'https://chat.example';
  const t0 = 1_000_000;
  // Every time, and never: nothing that was allowed before matters.
  const allowed = rememberAllow(undefined, 'enter:Message', 'enter', 'Message', site, t0);
  assert.equal(needsAsking('always', null, allowed, 'enter:Message', site, t0 + 1000), true);
  assert.equal(needsAsking('never', null, undefined, 'enter:Message', site, t0), false);
  // A high-impact action is asked about under every setting, also right after it was allowed.
  const deleted = rememberAllow(undefined, 'click:Delete thread', 'click', 'Delete thread', site, t0);
  for (const mode of ['always', 'auto', 'never'] as const) {
    assert.equal(needsAsking(mode, 'delete', deleted, 'click:Delete thread', site, t0 + 1000), true, mode);
  }

  // Automatic: the first time yes, then not, for the same control only.
  assert.equal(needsAsking('auto', null, undefined, 'enter:Message', site, t0), true, 'never allowed');
  assert.equal(needsAsking('auto', null, allowed, 'enter:Message', site, t0 + 1000), false);
  assert.equal(needsAsking('auto', null, allowed, 'enter:Reply', site, t0 + 1000), true, 'another name');
  assert.equal(needsAsking('auto', null, allowed, 'click:Message', site, t0 + 1000), true, 'another kind of request');
  assert.equal(needsAsking('auto', null, allowed, 'enter:Message', 'https://other.example', t0 + 1000), true, 'another website');
  assert.equal(needsAsking('auto', null, allowed, 'enter:Message', null, t0 + 1000), true, 'a tab whose address is not known');
  // It ends by itself.
  assert.equal(needsAsking('auto', null, allowed, 'enter:Message', site, t0 + ALLOW_LASTS_MS - 1), false);
  assert.equal(needsAsking('auto', null, allowed, 'enter:Message', site, t0 + ALLOW_LASTS_MS), true);
  assert.deepEqual(standingAllows(allowed, t0 + 1000), [{ how: 'enter', label: 'Message', minutes: 15 }]);
  assert.deepEqual(standingAllows(allowed, t0 + ALLOW_LASTS_MS - 30_000), [{ how: 'enter', label: 'Message', minutes: 1 }]);
  assert.deepEqual(standingAllows(allowed, t0 + ALLOW_LASTS_MS), []);
  // A click and Enter on controls of one name are two things to allow, and are shown as two.
  const both = rememberAllow(allowed, 'click:Message', 'click', 'Message', site, t0 + 1000);
  assert.deepEqual(standingAllows(both, t0 + 2000).map((pass) => `${pass.how} ${pass.label}`), ['enter Message', 'click Message']);

  // An Allow does not cover a burst: after a few in a minute the user is asked again.
  let busy = allowed;
  for (let i = 0; i < UNASKED_PER_MINUTE; i++) {
    assert.equal(needsAsking('auto', null, busy, 'enter:Message', site, t0 + 2000 + i), false, `pass ${i + 1}`);
    busy = notePassed(busy, t0 + 2000 + i);
  }
  assert.equal(needsAsking('auto', null, busy, 'enter:Message', site, t0 + 3000), true);
  assert.equal(needsAsking('auto', null, busy, 'enter:Message', site, t0 + 3000 + 60_000), false, 'a minute later it passes again');

  // A setting that is not one of the three means the careful one.
  assert.deepEqual(['auto', 'never', 'always', 'sometimes', undefined, true].map(askModeOf), ['auto', 'never', 'always', 'always', 'always', 'always']);
});

test('only one request waits for the user at a time', () => {
  assert.equal(code(() => checkAsk(undefined, 'click:Post', true, 0)), 'CONFIRMATION_PENDING');
  assert.equal(failureNote('CONFIRMATION_PENDING'), 'another request was waiting for you');
});

const signals = (over: Partial<SubmitSignals> = {}): SubmitSignals => ({
  expectSeen: false, submittedSeen: false, newAlerts: [], invalidFields: [], newStatuses: [], formGone: false, fieldsCleared: false,
  urlChanged: false, documentChanged: false, ...over,
});

test('a dispatched click alone is never a confirmed submission', () => {
  const silent = judgeSubmission(signals(), false);
  assert.equal(silent.state, 'UNCERTAIN');
  assert.equal(silent.verified, null);
  assert.match(silent.evidence[0], /no visible reaction/);
});

test('submissions are confirmed by content or by the page reacting, and failed by error signals', () => {
  const seen = judgeSubmission(signals({ expectSeen: true, fieldsCleared: true }), true);
  assert.deepEqual([seen.state, seen.verified], ['CONFIRMED', 'content']);

  // Expected text was named but never showed up: not confirmed, however the page reacted.
  const missing = judgeSubmission(signals({ fieldsCleared: true, newStatuses: ['Saved'] }), true);
  assert.equal(missing.state, 'UNCERTAIN');
  assert.ok(missing.evidence.includes('the expected text did not appear'));

  for (const reaction of [{ fieldsCleared: true }, { formGone: true }, { documentChanged: true }, { urlChanged: true }, { newStatuses: ['Saved'] }]) {
    const verdict = judgeSubmission(signals(reaction), false);
    assert.deepEqual([verdict.state, verdict.verified], ['CONFIRMED', 'reaction'], JSON.stringify(reaction));
  }

  // Nothing was named, but the submitted text showed up on the page: that is content, not just a reaction.
  const recognised = judgeSubmission(signals({ submittedSeen: true, fieldsCleared: true }), false);
  assert.deepEqual([recognised.state, recognised.verified], ['CONFIRMED', 'content']);
  assert.equal(recognised.evidence[0], 'the submitted text is now visible on the page');
  // A named expectation is stricter: it has to be that text.
  assert.equal(judgeSubmission(signals({ submittedSeen: true }), true).state, 'UNCERTAIN');

  // An error wins over everything else, including the expected text.
  const failed = judgeSubmission(signals({ expectSeen: true, newAlerts: ['Title is required'], invalidFields: ['Title'] }), true);
  assert.equal(failed.state, 'FAILED');
  assert.match(failed.evidence.join(' | '), /Title is required/);
  assert.equal(judgeSubmission(signals({ invalidFields: ['Email'] }), false).state, 'FAILED');
});

test('the rate limiter allows a burst and then the steady rate', () => {
  const limiter = new RateLimiter(10, 3, 0);
  assert.deepEqual([limiter.tryTake(0), limiter.tryTake(0), limiter.tryTake(0), limiter.tryTake(0)], [true, true, true, false]);
  assert.equal(limiter.tryTake(100), true, 'one token back after 100ms at 10/s');
  assert.equal(limiter.tryTake(100), false);
  assert.equal(limiter.tryTake(10_000), true);
});

test('replayed command ids are recognised', () => {
  const seen = new RecentIds(3);
  assert.equal(seen.add('1'), true);
  assert.equal(seen.add('1'), false);
  seen.add('2');
  seen.add('3');
  seen.add('4');
  assert.equal(seen.add('4'), false);
  assert.equal(seen.add('1'), true, 'the oldest id has aged out of the bounded memory');
});

test('activity wording is fixed text that cannot carry page content', () => {
  assert.deepEqual(activityLabel('fill'), { running: 'Entering text', done: 'Entered text' });
  assert.deepEqual(activityLabel('click', 'submit'), { running: 'Submitting', done: 'Submitted' });
  assert.deepEqual(activityLabel('submit'), { running: 'Submitting', done: 'Submitted' });
  assert.deepEqual(activityLabel('press_key'), { running: 'Pressing key', done: 'Pressed key' });
  assert.deepEqual(activityLabel('<img src=x onerror=alert(1)>'), { running: 'Working', done: 'Done' });
  assert.equal(failureNote('WRITE_NOT_AUTHORIZED'), 'needs Write access');
  assert.equal(failureNote('SESSION_NOT_OWNED'), 'another agent\'s session');
  assert.equal(failureNote('whatever the page says'), 'failed');
});

test('the line the page shows for a command that ended is the list\'s wording, with how it ended', () => {
  assert.deepEqual(endedLine('snapshot', undefined, 'ok'), { text: 'Read page', mark: 'ok' });
  assert.deepEqual(endedLine('click', 'submit', 'ok'), { text: 'Submitted', mark: 'ok' });
  // Refused or failed: what it was about to do, and the short note. Never the error's own text.
  assert.deepEqual(endedLine('fill', undefined, 'WRITE_NOT_AUTHORIZED'), { text: 'Entering text (needs Write access)', mark: 'error' });
  assert.deepEqual(endedLine('press_key', 'submit', 'SUBMIT_DENIED'), { text: 'Submitting (you declined)', mark: 'error' });
  assert.deepEqual(endedLine('wait_for', undefined, 'CANCELLED'), { text: 'Waiting for content (cancelled)', mark: 'error' });
  // Turned away before it started, as the activity list says it.
  assert.deepEqual(endedLine('navigate', undefined, 'STALE_COMMAND', false), { text: 'Navigating blocked (arrived too late)', mark: 'error' });
  // Neither an action nor a code that is made up puts words of its own into the page.
  assert.deepEqual(endedLine('<b>Pay now</b>', undefined, 'ok'), { text: 'Done', mark: 'ok' });
  assert.deepEqual(endedLine('click', undefined, 'Your session expired, log in at evil.example'), { text: 'Clicking element (failed)', mark: 'error' });
});

test('the badge says ON only while an agent that may use a tab is connected', () => {
  const open = { clientId: 'c-me', clientName: 'Me', paused: false, suspended: false };
  const me = { id: 'c-me', name: 'Me' };
  const other = { id: 'c-other', name: 'Other' };
  // The user is asked, or a command runs: that comes first.
  assert.equal(badgeFor(true, true, [open], [me]), '?');
  assert.equal(badgeFor(false, true, [open], [me]), 'RUN');
  // A tab and its agent, both there: an agent may act.
  assert.equal(badgeFor(false, false, [open], [me]), 'ON');
  // The tab is authorized and its agent's server is gone: nobody can act. This said ON once.
  assert.equal(badgeFor(false, false, [open], []), 'OFF');
  assert.equal(badgeFor(false, false, [open], [other]), 'OFF', 'another agent cannot use it');
  // A tab no agent has taken up yet is for whichever agent is connected.
  const unclaimed = { ...open, clientId: null, clientName: null };
  assert.equal(badgeFor(false, false, [unclaimed], [other]), 'ON');
  assert.equal(badgeFor(false, false, [unclaimed], []), 'OFF');
  // An agent that was started again takes up what its former self left, by its name.
  assert.equal(badgeFor(false, false, [open], [{ id: 'c-new', name: 'Me' }]), 'ON');
  assert.equal(badgeFor(false, false, [open], [{ id: 'c-new', name: '' }]), 'OFF', 'not before it has said its name');
  // One tab that can be acted on is enough for ON.
  const left = { ...open, clientId: 'c-gone', clientName: 'Gone' };
  assert.equal(badgeFor(false, false, [left, open], [me]), 'ON');
  // Paused and suspended tabs are not ON, whoever is connected.
  assert.equal(badgeFor(false, false, [{ ...open, paused: true }], [me]), 'II');
  assert.equal(badgeFor(false, false, [{ ...open, suspended: true }], [me]), '');
  assert.equal(badgeFor(false, false, [{ ...open, paused: true }, left], [me]), 'OFF');
  assert.equal(badgeFor(false, false, [], [me]), '');
});

test('a server that leaves two heartbeats in a row unanswered is taken for gone', () => {
  assert.equal(HEARTBEATS_UNANSWERED, 2);
  assert.equal(serverGone(0), false);
  assert.equal(serverGone(1), false, 'one may be late');
  assert.equal(serverGone(2), true);
  assert.equal(serverGone(3), true);
});
