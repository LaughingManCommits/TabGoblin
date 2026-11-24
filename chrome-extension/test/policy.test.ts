import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ALLOW_LASTS_MS, CommandError, NO_STANDS_MS, RateLimiter, RecentIds, UNASKED_PER_MINUTE, UNWELCOME_AFTER, activityLabel, askModeOf,
  checkAsk, checkClick, checkGate, checkKey, endedLine, failureNote, highImpactWord, inScope, isHighImpact, needsAsking, noteAnswer, notePassed,
  rememberAllow, remembersAllow, standingAllows, standingRefusals,
  judgeSubmission, looksLikeSearch, looksLikeSubmission, originOf, parseKey, resolveNavigation, resolveSession, sessionsOfAgent, isLastingAgent,
  NO_LIMITS, REQUEST_LASTS_MS, noticeAtRest, checkAccessRequest, requestKey, requestReason, workspaceName, workspacesOf, askUnder, capMode, checkLimits, endsAt, outsideAllowed, strictest, type Limits,
  HEARTBEATS_UNANSWERED, badgeFor, serverGone,
  NOTHING_BLOCKED, blockedAmong, blockedBy, checkBlocked, hostOf,
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

  assert.deepEqual(resolveSession([mine, theirs], me, undefined), { session: mine, claim: false });
  assert.deepEqual(resolveSession([mine, theirs], me, 's1'), { session: mine, claim: false });
  assert.equal(code(() => resolveSession([mine, theirs], me, 's2')), 'SESSION_NOT_OWNED');
  assert.equal(code(() => resolveSession([mine, theirs], me, 's9')), 'UNKNOWN_SESSION');
  assert.equal(code(() => resolveSession([theirs], me, undefined)), 'NOT_AUTHORIZED');

  const second = session({ id: 's3', clientId: 'c-me', origin: 'https://wiki.example' });
  assert.equal(code(() => resolveSession([mine, second], me, undefined)), 'SESSION_REQUIRED');
  assert.deepEqual(resolveSession([mine, second], me, 's3'), { session: second, claim: false });
});

test('an unclaimed session goes to the first agent that uses it', () => {
  const open = session({ clientId: null, clientName: null });
  const resolved = resolveSession([open], { id: 'c-me', name: 'IDE' }, undefined);
  assert.equal(resolved.session, open);
  assert.equal(resolved.claim, true);
});

test('an agent is known by its id: a name gives it nothing, whether the owner is there or gone', () => {
  const left = session({ clientId: 'a-0123456789ab', clientName: 'IDE' });
  // Another agent that calls itself the same takes nothing, and that whether the owner is
  // connected or not. This passed once: a session whose owner was gone went to an agent of the same name.
  assert.equal(code(() => resolveSession([left], { id: 'c-new', name: 'IDE' }, 's1')), 'SESSION_NOT_OWNED');
  assert.equal(code(() => resolveSession([left], { id: 'a-ba9876543210', name: 'IDE' }, undefined)), 'NOT_AUTHORIZED');
  // The same agent, started again: its key gives it the same id, and the session is its own. Nothing is claimed.
  assert.deepEqual(resolveSession([left], { id: 'a-0123456789ab', name: 'Renamed' }, 's1'), { session: left, claim: false });
  // An id that only looks alike is another id.
  assert.equal(code(() => resolveSession([left], { id: 'a-0123456789ab~1f2e', name: 'IDE' }, 's1')), 'SESSION_NOT_OWNED');
});

test('an id that is the same at every start is told from one made for a start', () => {
  assert.equal(isLastingAgent('a-0123456789ab'), true);
  // A second process with the same key, an agent without a key, and what is no id at all.
  for (const id of ['a-0123456789ab~1f2e', 'c-1a2b3c4d', 'a-0123', 'A-0123456789AB', '', null, undefined]) {
    assert.equal(isLastingAgent(id), false, String(id));
  }
});

test('a disconnected agent takes its own sessions with it, and no others', () => {
  const mine = session({ id: 's1', clientId: 'c-me' });
  const second = session({ id: 's2', clientId: 'c-me', origin: 'https://wiki.example' });
  const theirs = session({ id: 's3', clientId: 'c-other', clientName: 'Other' });
  const open = session({ id: 's4', clientId: null, clientName: null });
  const sameName = session({ id: 's5', clientId: 'c-old', clientName: 'IDE' });
  const all = [mine, second, theirs, open, sameName];

  // What carries its id. Not what was given to no agent, and not what an agent of the same name has.
  assert.deepEqual(sessionsOfAgent(all, { id: 'c-me', name: 'IDE' }), [mine, second]);
  assert.deepEqual(sessionsOfAgent(all, { id: 'c-me', name: '' }), [mine, second]);
  assert.deepEqual(sessionsOfAgent(all, { id: 'c-none', name: 'IDE' }), []);
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
  // An agent of the same name is another agent: it cannot act on the tab, so the badge does not say that one can.
  assert.equal(badgeFor(false, false, [open], [{ id: 'c-new', name: 'Me' }]), 'OFF');
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

// ---------------------------------------------------------------- blocked sites

/** The cases the server's rule is held to as well (BlockedSitesTest.java). */
const BLOCKED_CASES = JSON.parse(readFileSync(
  new URL('../../java-server/src/test/resources/browsercontext/blocked-sites-cases.json', import.meta.url), 'utf8'));

test('a blocked domain blocks itself and its subdomains, and the server and the extension agree on every case', () => {
  for (const c of BLOCKED_CASES.hosts) {
    // What the server takes from an address is what the browser takes from it. The server also
    // reads what a browser does not take for an address at all; those cases are its own.
    let browsers: string | null;
    try { browsers = new URL(c.address.trim()).hostname.replace(/\.$/, ''); } catch { browsers = null; }
    if (browsers !== null) assert.equal(browsers, c.host, c.address);
  }
  assert.equal(hostOf('https://Example.ORG:8443/path?q=1#x'), 'example.org');
  assert.equal(hostOf('http://[::1]:8080/a'), '[::1]');
  assert.equal(hostOf('not an address'), null);
  assert.equal(hostOf(null), null);
  for (const c of BLOCKED_CASES.matches) {
    assert.equal(blockedBy(c.host, c.blocked), c.by, `${c.host} against ${JSON.stringify(c.blocked)}`);
  }
  assert.equal(blockedBy(null, ['example.org']), null);
});

test('a command is refused when the tab, or any site of its session, is blocked; and all of them when the settings cannot be read', () => {
  const list = { sites: ['example.org'], everything: false };
  assert.equal(blockedAmong(NOTHING_BLOCKED, ['https://mail.example.org/inbox']), null);
  assert.equal(blockedAmong(list, ['https://docs.example.net/guide', 'https://docs.example.net']), null);
  assert.equal(blockedAmong(list, ['https://docs.example.net/guide', 'https://mail.example.org:8443']), 'mail.example.org');
  assert.equal(blockedAmong(list, [undefined, null, 'about:blank']), null);
  assert.doesNotThrow(() => checkBlocked(list, ['https://docs.example.net/guide']));
  assert.throws(() => checkBlocked(list, ['https://docs.example.net/guide', 'https://sso.example.org']),
    (e: unknown) => e instanceof CommandError && e.code === 'SITE_BLOCKED'
      && e.message === "sso.example.org is on the user's list of blocked sites: no agent may work there. Only the user can change that, in the settings of the TabGoblin server.");
  // The agent is told the one site it ran into, never the list.
  assert.throws(() => checkBlocked({ sites: ['bank.example', 'example.org'], everything: false }, ['https://example.org/']),
    (e: unknown) => e instanceof CommandError && !e.message.includes('bank.example'));
  assert.throws(() => checkBlocked({ sites: [], everything: true }, ['https://docs.example.net/guide']),
    (e: unknown) => e instanceof CommandError && e.code === 'SETTINGS_UNREADABLE');
  assert.equal(failureNote('SITE_BLOCKED'), 'site blocked');
  assert.equal(failureNote('SETTINGS_UNREADABLE'), 'settings unreadable');
});

const limits = (over: Partial<Limits> = {}): Limits => ({ ...NO_LIMITS, ...over });

test('the policy takes away screenshots, the higher access levels and sites outside the allowed ones', () => {
  const here = ['https://app.example/issues', 'https://app.example'];
  // No policy: nothing is refused here.
  for (const action of ['snapshot', 'screenshot', 'click', 'fill', 'submit', 'navigate']) {
    assert.equal(code(() => checkLimits(NO_LIMITS, action, here)), 'ok', action);
  }
  assert.equal(code(() => checkLimits(limits({ screenshots: false }), 'screenshot', here)), 'SCREENSHOTS_DISABLED');
  assert.equal(code(() => checkLimits(limits({ screenshots: false }), 'snapshot', here)), 'ok');

  const explore = limits({ maxAccess: 'explore' });
  for (const action of ['fill', 'submit']) assert.equal(code(() => checkLimits(explore, action, here)), 'ACCESS_RESTRICTED', action);
  for (const action of ['snapshot', 'extract', 'scroll', 'wait_for', 'click', 'press_key', 'navigate']) {
    assert.equal(code(() => checkLimits(explore, action, here)), 'ok', action);
  }
  const read = limits({ maxAccess: 'read' });
  for (const action of ['click', 'press_key', 'navigate', 'fill', 'submit']) assert.equal(code(() => checkLimits(read, action, here)), 'ACCESS_RESTRICTED', action);
  assert.equal(code(() => checkLimits(read, 'extract', here)), 'ok');
  assert.equal(capMode('write', 'explore'), 'explore');
  assert.equal(capMode('read', 'explore'), 'read');
  assert.equal(capMode('write', 'write'), 'write');

  const only = limits({ allowed: ['example.org', '10.0.0.7'] });
  assert.equal(code(() => checkLimits(only, 'snapshot', ['https://docs.example.org/a', 'https://example.org'])), 'ok');
  assert.equal(code(() => checkLimits(only, 'snapshot', ['http://10.0.0.7:8080/x'])), 'ok');
  assert.equal(code(() => checkLimits(only, 'snapshot', here)), 'SITE_NOT_ALLOWED');
  // Every site of the session and the address of its tab: one outside is enough.
  assert.equal(outsideAllowed(only, ['https://example.org', 'https://evil.example/x']), 'evil.example');
  assert.equal(outsideAllowed(only, ['https://notexample.org']), 'notexample.org', 'a name that only ends alike is another site');
  assert.equal(outsideAllowed(only, ['https://example.org.evil.example']), 'example.org.evil.example');
  assert.equal(outsideAllowed(only, ['http://10.0.0.70']), '10.0.0.70');
  // An address that names no site is not allowed; one that is not known is left to the other checks.
  assert.equal(outsideAllowed(only, ['not an address']), 'an address that names no site');
  assert.equal(outsideAllowed(only, [undefined, null, 'https://example.org']), null);
  assert.equal(outsideAllowed(NO_LIMITS, ['https://anything.example']), null);
});

test('under the strict profile a click that may change something is a submission, and every submission is asked about', () => {
  const button: ClickTarget = { readSafe: false, disclosure: false, externalLink: false, submit: null, label: 'Toggle theme' };
  const link: ClickTarget = { ...button, readSafe: true, label: 'Next page' };
  const fold: ClickTarget = { ...button, disclosure: true, label: 'Details' };
  // Without the profile a plain button is clicked.
  assert.equal(checkClick('write', 'interact', button), 'interact');
  // With it, it needs the agent's word that a change is meant, and then goes the way of a submission.
  assert.equal(code(() => checkClick('write', 'interact', button, true)), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkClick('write', 'submit', button, true), 'submit');
  // What only shows something still passes: a link of the site, an expand or collapse control.
  assert.equal(checkClick('write', 'interact', link, true), 'interact');
  assert.equal(checkClick('write', 'interact', fold, true), 'interact');
  assert.equal(checkClick('explore', 'interact', link, true), 'interact');
  // And a key that does what a click does follows the same rule.
  assert.equal(code(() => checkKey('write', 'interact', { submit: null, click: button, label: 'Toggle theme' }, true)), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(checkKey('write', 'submit', { submit: null, click: button, label: 'Toggle theme' }, true), 'click');
  assert.equal(checkKey('write', 'interact', { submit: null, click: link, label: 'Next page' }, true), 'press');

  for (const mode of ['always', 'auto', 'never'] as const) {
    assert.equal(askUnder({ strict: true }, mode), 'always', mode);
    assert.equal(askUnder({ strict: false }, mode), mode);
  }
});

test('an authorization ends at the earliest of the user\'s time, the policy\'s longest and the policy\'s time unused', () => {
  const minute = 60_000;
  const at = 1_000_000_000;
  const session = { expiresAt: null, createdAt: at, lastUsedAt: at + 50 * minute };
  assert.equal(endsAt(session, NO_LIMITS), null, 'until revoked');
  assert.equal(endsAt({ ...session, expiresAt: at + 60 * minute }, NO_LIMITS), at + 60 * minute);
  assert.equal(endsAt(session, limits({ sessionMaxMinutes: 480 })), at + 480 * minute);
  assert.equal(endsAt(session, limits({ sessionIdleMinutes: 30 })), at + 80 * minute, 'thirty minutes after its last command');
  assert.equal(endsAt(session, limits({ sessionMaxMinutes: 60, sessionIdleMinutes: 30 })), at + 60 * minute);
  assert.equal(endsAt({ ...session, expiresAt: at + 10 * minute }, limits({ sessionMaxMinutes: 60, sessionIdleMinutes: 30 })), at + 10 * minute);
  // A session that was never used is unused since it was given.
  assert.equal(endsAt({ expiresAt: null, createdAt: at }, limits({ sessionIdleMinutes: 30 })), at + 30 * minute);
  // One from before these times were noted has only what the user gave it.
  assert.equal(endsAt({ expiresAt: null }, limits({ sessionMaxMinutes: 60, sessionIdleMinutes: 30 })), null);
  // And it is this end that the gate looks at.
  const gated = { origins: [ORIGIN], mode: 'read' as const, paused: false, suspended: false, expiresAt: endsAt(session, limits({ sessionIdleMinutes: 30 })) };
  assert.equal(code(() => checkGate(gated, 'snapshot', HERE, at + 79 * minute)), 'ok');
  assert.equal(code(() => checkGate(gated, 'snapshot', HERE, at + 80 * minute)), 'AUTHORIZATION_EXPIRED');
});

test('of what several servers say, the stricter holds', () => {
  assert.deepEqual(strictest([]), NO_LIMITS);
  assert.deepEqual(strictest([NO_LIMITS, NO_LIMITS]), NO_LIMITS);
  const a = limits({ strict: true, allowed: ['example.org', 'intranet.example'], maxAccess: 'explore', sessionMaxMinutes: 480 });
  const b = limits({ screenshots: false, allowed: ['docs.example.org', 'other.example'], sessionMaxMinutes: 60, sessionIdleMinutes: 20 });
  assert.deepEqual(strictest([a, NO_LIMITS, b]), {
    // A site has to be allowed by every server that limits sites: only what lies inside both lists is left.
    strict: true, allowed: [], screenshots: false, maxAccess: 'explore', sessionMaxMinutes: 60, sessionIdleMinutes: 20,
  });
  assert.deepEqual(strictest([a, limits({ allowed: ['example.org'] })]).allowed, ['example.org']);
  assert.deepEqual(strictest([a, NO_LIMITS]).allowed, ['example.org', 'intranet.example']);
});

test('a workspace is a name and nothing more: kept short, on one line, and listed with its tabs', () => {
  assert.equal(workspaceName('  PROJ-512   login  bug '), 'PROJ-512 login bug');
  assert.equal(workspaceName('a\nb\tc\u0000d'), 'a b c d');
  assert.equal(workspaceName('x'.repeat(60))?.length, 40);
  for (const none of ['', '   ', '\n', null, undefined, 7, {}]) assert.equal(workspaceName(none), null);
  assert.deepEqual(workspacesOf([
    { id: 's1', workspace: 'Release' }, { id: 's2', workspace: null }, { id: 's3', workspace: 'Bug 12' }, { id: 's4', workspace: 'Release' }, { id: 's5' },
  ]), [{ name: 'Bug 12', sessions: ['s3'] }, { name: 'Release', sessions: ['s1', 's4'] }]);
  assert.deepEqual(workspacesOf([]), []);
});

test('a request for access is put to the user only where they could grant it, one at a time, and not again after a no', () => {
  const me = { id: 'a-0123456789ab', name: 'IDE' };
  const mine = { id: 's1', origin: 'https://app.example', mode: 'read' as const };
  const ask = (asked: object, own: typeof mine | null = null, over: Partial<Limits> = {}, waiting: any[] = [], declined: any[] = [], now = 1_000_000) =>
    checkAccessRequest(me, asked as any, own, limits(over), NOTHING_BLOCKED, waiting, declined, now);

  // A higher level on a session of its own: on that session's site, and nothing else.
  assert.deepEqual(ask({ level: 'write' }, mine), { kind: 'raise', session: 's1', origin: 'https://app.example', level: 'write' });
  assert.equal(code(() => ask({ level: 'read' }, mine)), 'INVALID_ARGUMENT', 'it has that already');
  assert.equal(code(() => ask({ level: 'admin' }, mine)), 'INVALID_ARGUMENT');
  // A tab on a site: the site is taken down to its origin; what is no website is no request.
  assert.deepEqual(ask({ level: 'read', site: ' https://ci.example:8443/job/7?token=x ' }), { kind: 'site', origin: 'https://ci.example:8443', level: 'read' });
  for (const site of [undefined, '', 'ci.example', 'file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 7]) {
    assert.equal(code(() => ask({ level: 'read', site })), 'INVALID_ARGUMENT', String(site));
  }

  // What the user could not grant is not put to them.
  assert.equal(code(() => ask({ level: 'write' }, mine, { maxAccess: 'explore' })), 'ACCESS_RESTRICTED');
  assert.equal(code(() => ask({ level: 'read', site: 'https://other.example' }, null, { allowed: ['app.example'] })), 'SITE_NOT_ALLOWED');
  assert.equal(code(() => checkAccessRequest(me, { level: 'read', site: 'https://mail.example.org' }, null, NO_LIMITS,
    { sites: ['example.org'], everything: false }, [], [], 0)), 'SITE_BLOCKED');
  assert.equal(code(() => checkAccessRequest(me, { level: 'read', site: 'https://x.example' }, null, NO_LIMITS,
    { sites: [], everything: true }, [], [], 0)), 'SETTINGS_UNREADABLE');

  // One request of an agent waits at a time; another agent's does not stand in the way; an old one has run out.
  const waits = { id: 'r1', clientId: me.id, kind: 'site' as const, origin: 'https://x.example', level: 'read' as const, reason: '', at: 1_000_000 };
  assert.equal(code(() => ask({ level: 'write' }, mine, {}, [waits])), 'ACCESS_REQUEST_PENDING');
  assert.equal(code(() => ask({ level: 'write' }, mine, {}, [{ ...waits, clientId: 'c-other' }])), 'ok');
  assert.equal(code(() => ask({ level: 'write' }, mine, {}, [waits], [], 1_000_000 + REQUEST_LASTS_MS)), 'ok');

  // A no stands for a while, for the same request: who asks, for what, where. Another request is another.
  const no = [{ key: requestKey({ clientId: me.id, kind: 'raise', origin: 'https://app.example', level: 'write' }), at: 1_000_000 }];
  assert.equal(code(() => ask({ level: 'write' }, mine, {}, [], no, 1_000_000 + 60_000)), 'ACCESS_REQUEST_DENIED');
  assert.equal(code(() => ask({ level: 'explore' }, mine, {}, [], no, 1_000_000 + 60_000)), 'ok');
  assert.equal(code(() => ask({ level: 'write' }, mine, {}, [], no, 1_000_000 + NO_STANDS_MS)), 'ok');

  // The agent's reason is its own words: one line, cut short.
  assert.equal(requestReason('  need it\nto post\tthe fix  '), 'need it to post the fix');
  assert.equal(requestReason('x'.repeat(500)).length, 200);
  assert.equal(requestReason(undefined), '');
});

test('a clock that is set back does not lock an agent out', () => {
  const limiter = new RateLimiter(20, 40, 1_000_000);
  assert.equal(limiter.tryTake(1_000_000 + 360_000), true);
  // The system's clock goes back six minutes, as after a correction of the time. A command still passes.
  for (let i = 0; i < 39; i++) assert.equal(limiter.tryTake(1_000_000), true, `command ${i}`);
  assert.equal(limiter.tryTake(1_000_000), false, 'the burst is still the limit');
  assert.equal(limiter.tryTake(1_000_000 + 100), true, 'and it fills up again as time goes on');
});

test('at rest a tab\'s notice says that it is paused, that an answer is needed, or that the agent is idle', () => {
  assert.equal(noticeAtRest(false, false), 'idle');
  assert.equal(noticeAtRest(false, true), 'asking');
  // Nothing is answered for a session that is paused: that is what it says, also while a question waits.
  assert.equal(noticeAtRest(true, true), 'paused');
  assert.equal(noticeAtRest(true, false), 'paused');
});
