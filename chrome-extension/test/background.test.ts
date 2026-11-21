// The real background worker, run against a fake Chrome and fake agent servers.
// What is faked: chrome.* APIs, WebSocket, and the content script's answers. What is real: all of
// background.ts, the pairing handshake, the policy, the protocol validation.

/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { clientProof, serverProof } from '../src/pairing.ts';

const TOKEN = 'unit-test-token-0123456789abcdef0123456789';
const EXTENSION_ID = 'unittestextensionid';
const BASE_PORT = 5000;
const POPUP = { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup.html` };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class FakeEvent {
  listeners: ((...args: any[]) => any)[] = [];
  addListener(listener: (...args: any[]) => any): void { this.listeners.push(listener); }
  removeListener(listener: (...args: any[]) => any): void { this.listeners = this.listeners.filter((l) => l !== listener); }
  emit(...args: any[]): void { for (const listener of [...this.listeners]) listener(...args); }
}

interface FakeTab { id: number; url?: string; status: string; active: boolean; windowId: number; title: string }
const tabs = new Map<number, FakeTab>();
/** Every operation a (fake) page was asked to perform, as "tab:op". */
const pageLog: string[] = [];
/** Waits in progress inside fake pages, by operation id, so tests can hold and release them. */
const waits = new Map<string, (reply: object) => void>();
/** What a fake page answers to an operation, where a test needs more than an echo. */
const pageResults = new Map<string, object>();

function pageAnswer(tabId: number, msg: any): Promise<object> | object {
  const tab = tabs.get(tabId);
  let origin: string | null = null;
  try {
    origin = new URL(tab?.url ?? '').origin;
  } catch {
    origin = null;
  }
  // Chrome only delivers to a document the extension still has access to.
  if (!tab || !origin) return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
  const meta = { docId: `doc-${tabId}`, highestRef: 0, generation: 0, url: tab.url };
  if (!Array.isArray(msg.origins) || !msg.origins.includes(origin)) return { ok: false, code: 'ORIGIN_MISMATCH', message: 'wrong origin', ...meta };
  if (msg.op !== 'ping' && msg.op !== 'indicator') pageLog.push(`${tabId}:${msg.op}`);
  if (msg.op === 'wait') {
    return new Promise((resolve) => waits.set(msg.opId, (reply) => resolve({ ...reply, ...meta })));
  }
  if (msg.op === 'cancel') {
    waits.get(msg.opId)?.({ ok: false, code: 'CANCELLED', message: 'The wait was cancelled.' });
    waits.delete(msg.opId);
    return { ok: true, result: {}, ...meta };
  }
  const told = pageResults.get(msg.op);
  return { ok: true, result: told ?? (msg.op === 'snapshot' ? { text: `snapshot of tab ${tabId}` } : { op: msg.op }), ...meta };
}

const storageLocal: Record<string, any> = { token: TOKEN, port: BASE_PORT };
const storageSession: Record<string, any> = {};
const fakeChrome = {
  runtime: {
    id: EXTENSION_ID,
    getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
    onMessage: new FakeEvent(), onInstalled: new FakeEvent(), onStartup: new FakeEvent(),
  },
  storage: {
    local: {
      setAccessLevel: async () => undefined,
      get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in storageLocal).map((k) => [k, storageLocal[k]])),
      set: async (values: object) => { Object.assign(storageLocal, values); },
      remove: async (key: string) => { delete storageLocal[key]; },
    },
    session: {
      get: async (key: string) => ({ [key]: storageSession[key] }),
      set: async (values: object) => { Object.assign(storageSession, structuredClone(values)); },
    },
  },
  tabs: {
    get: async (id: number) => {
      const tab = tabs.get(id);
      if (!tab) throw new Error(`No tab with id: ${id}`);
      return { ...tab };
    },
    sendMessage: async (id: number, msg: object) => pageAnswer(id, msg),
    update: async () => undefined, reload: async () => undefined,
    captureVisibleTab: async () => 'data:image/jpeg;base64,QUJD',
    onUpdated: new FakeEvent(), onRemoved: new FakeEvent(), onCreated: new FakeEvent(), onActivated: new FakeEvent(),
  },
  scripting: { executeScript: async () => [{}] },
  action: { setBadgeText: async () => undefined, setBadgeBackgroundColor: async () => undefined, openPopup: async () => undefined },
  alarms: { create: async () => undefined, onAlarm: new FakeEvent() },
};

/** A fake agent server on one port: speaks the real handshake, then sends commands. */
class FakeServer {
  socket: FakeSocket | null = null;
  paired = false;
  closeCodes: number[] = [];
  events: any[] = [];
  private nonce = 'a'.repeat(32);
  private waiting = new Map<string, (response: any) => void>();
  private nextId = 1;
  readonly clientId: string;
  readonly name: string;
  readonly versions: number[];

  constructor(clientId: string, name: string, versions = [2]) {
    this.clientId = clientId;
    this.name = name;
    this.versions = versions;
  }

  attach(socket: FakeSocket): void {
    this.socket = socket;
    this.paired = false;
    this.deliver({ type: 'challenge', nonce: this.nonce, versions: this.versions });
  }

  async receive(msg: any): Promise<void> {
    if (msg.type === 'auth') {
      assert.equal(msg.proof, await clientProof(TOKEN, this.nonce, msg.nonce), 'the extension must prove it knows the token');
      this.deliver({ type: 'auth_ok', proof: await serverProof(TOKEN, this.nonce, msg.nonce), version: 2, clientId: this.clientId, clientName: this.name });
      this.paired = true;
    } else if (msg.type === 'event') {
      this.events.push(msg);
    } else if (typeof msg.id === 'string') {
      this.waiting.get(msg.id)?.(msg);
      this.waiting.delete(msg.id);
    }
  }

  deliver(msg: object): void {
    this.socket?.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** Sends a command and resolves with the extension's response. */
  command(action: string, extra: { session?: string; params?: object; id?: string; deadline?: number } = {}): Promise<any> {
    const id = extra.id ?? `${this.clientId}-${this.nextId++}`;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.deliver({ id, action, ...(extra.session ? { session: extra.session } : {}), params: extra.params ?? {}, deadline: extra.deadline ?? Date.now() + 30000 });
    });
  }
}

const servers = new Map<number, FakeServer>();

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  private server: FakeServer | undefined;

  constructor(url: string) {
    const port = Number(url.split(':').pop());
    setTimeout(() => {
      this.server = servers.get(port);
      if (!this.server) {
        this.readyState = 3;
        this.onclose?.({ code: 1006 }); // nothing listening on this port
        return;
      }
      this.readyState = 1;
      this.server.attach(this);
    }, 0);
  }

  send(data: string): void {
    void this.server?.receive(JSON.parse(data));
  }

  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    if (this.server) {
      this.server.closeCodes.push(code);
      this.server.paired = false;
    }
    setTimeout(() => this.onclose?.({ code }), 0);
  }
}

/** Sends a request the way the popup page does and resolves with the worker's reply. */
function popup(message: object, sender: object = POPUP): Promise<any> {
  return new Promise((resolve) => {
    let handled = false;
    for (const listener of fakeChrome.runtime.onMessage.listeners) {
      if (listener(message, sender, resolve) === true) handled = true;
    }
    if (!handled) resolve(undefined);
  });
}
const state = async (): Promise<any> => (await popup({ type: 'getState' })).state;
const code = (response: any): string => (response.success ? 'ok' : response.error.code);
async function until(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await condition()) return;
    await sleep(15);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const one = new FakeServer('c-one', 'agent-one');
const two = new FakeServer('c-two', 'agent-two');
const old = new FakeServer('c-old', 'old-agent', [1]);

before(async () => {
  servers.set(BASE_PORT, one);
  servers.set(BASE_PORT + 2, two); // a gap: some other program holds the port in between
  servers.set(BASE_PORT + 3, old);
  tabs.set(1, { id: 1, url: 'https://app.example/issues', status: 'complete', active: true, windowId: 1, title: 'Issues' });
  tabs.set(2, { id: 2, url: 'https://docs.example/guide', status: 'complete', active: false, windowId: 1, title: 'Guide' });
  (globalThis as any).chrome = fakeChrome;
  (globalThis as any).WebSocket = FakeSocket;
  // The worker's periodic scan would otherwise keep the test process alive.
  const realSetInterval = globalThis.setInterval;
  (globalThis as any).setInterval = (fn: () => void, ms: number) => realSetInterval(fn, ms).unref();
  await import('../src/background.ts');
  await until(() => one.paired && two.paired, 'the agents to pair');
});

test('finds servers across the port range and refuses one that speaks another protocol version', async () => {
  const s = await state();
  assert.equal(s.connection, 'connected');
  assert.deepEqual(s.clients.map((c: any) => `${c.name}:${c.port}`).sort(), ['agent-one:5000', 'agent-two:5002']);
  await until(() => old.closeCodes.includes(4406), 'the old-protocol server to be refused');
  assert.equal(old.paired, false);
});

test('nothing runs before a tab is authorized, and only the popup can authorize', async () => {
  assert.equal(code(await one.command('snapshot')), 'NOT_AUTHORIZED');
  assert.equal(code(await one.command('snapshot', { session: 's1' })), 'UNKNOWN_SESSION');

  // A content script lives inside a web page: its requests are not the popup's.
  const fromPage = await popup({ type: 'authorize', tabId: 1, mode: 'write' }, { id: EXTENSION_ID, url: 'https://evil.example/', tab: { id: 1 } });
  assert.equal(fromPage, undefined);
  const fromElsewhere = await popup({ type: 'authorize', tabId: 1, mode: 'write' }, { id: 'someotherextension', url: POPUP.url });
  assert.equal(fromElsewhere, undefined);
  assert.equal((await state()).sessions.length, 0);

  const reply = await popup({ type: 'authorize', tabId: 1, mode: 'read' });
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.state.sessions.map((x: any) => [x.id, x.origin, x.mode, x.suspended]), [['s1', 'https://app.example', 'read', false]]);
  assert.equal((await popup({ type: 'authorize', tabId: 99, mode: 'read' })).ok, false, 'an unknown tab cannot be authorized');
});

test('the first agent to use a session owns it; another agent cannot reach it', async () => {
  const mine = await one.command('snapshot');
  assert.equal(mine.result.text, 'snapshot of tab 1');
  const before = pageLog.length;
  assert.equal(code(await two.command('snapshot', { session: 's1' })), 'SESSION_NOT_OWNED');
  assert.equal(code(await two.command('snapshot')), 'NOT_AUTHORIZED');
  assert.equal(code(await two.command('click', { session: 's1', params: { ref: 1 } })), 'SESSION_NOT_OWNED');
  assert.equal(pageLog.length, before, 'a refused command must not reach the page');
  assert.equal((await two.command('status')).result.sessions.length, 0, 'another agent\'s session is not even listed');
  assert.equal((await one.command('status')).result.sessions[0].owner, 'you');
});

test('the access level is checked before the page is touched', async () => {
  const before = pageLog.length;
  assert.equal(code(await one.command('fill', { params: { ref: 1, text: 'x' } })), 'WRITE_NOT_AUTHORIZED');
  assert.equal(code(await one.command('navigate', { params: { url: '/x' } })), 'EXPLORE_NOT_AUTHORIZED');
  assert.equal(code(await one.command('press_key', { params: { key: 'Tab' } })), 'EXPLORE_NOT_AUTHORIZED');
  assert.equal(code(await one.command('evaluate', { params: { script: 'document.cookie' } })), 'UNSUPPORTED_ACTION');
  assert.equal(pageLog.length, before);
});

test('commands for one tab run in order, and a queued command can be cancelled before it runs', async () => {
  const first = one.command('wait_for', { id: 'w1', params: { text: 'never', timeoutMs: 20000 } });
  await until(() => waits.has(`${BASE_PORT}:w1`), 'the wait to reach the page');
  const snapshotsBefore = pageLog.filter((entry) => entry === '1:snapshot').length;
  const queued = one.command('snapshot', { id: 'q1' });
  await sleep(60);
  assert.equal(pageLog.filter((entry) => entry === '1:snapshot').length, snapshotsBefore, 'the second command waits its turn');

  one.deliver({ type: 'cancel', id: 'q1' });
  one.deliver({ type: 'cancel', id: 'w1' });
  assert.equal(code(await first), 'CANCELLED');
  assert.equal(code(await queued), 'CANCELLED');
  assert.equal(pageLog.filter((entry) => entry === '1:snapshot').length, snapshotsBefore, 'a cancelled queued command never reaches the page');
  assert.equal(code(await one.command('snapshot')), 'ok', 'the session works again afterwards');
});

test('a replayed id, a stale deadline, a malformed message and a flood are refused', async () => {
  assert.equal(code(await one.command('status', { id: 'once' })), 'ok');
  assert.equal(code(await one.command('status', { id: 'once' })), 'DUPLICATE_COMMAND');
  assert.equal(code(await one.command('snapshot', { deadline: Date.now() - 1 })), 'STALE_COMMAND');

  // Not a valid protocol message: ignored, and the connection keeps working.
  one.deliver({ id: 'bad', action: 'snapshot', session: 'tab-1', deadline: Date.now() + 1000 });
  one.deliver({ type: 'evaluate', script: 'document.cookie' });
  assert.equal(code(await one.command('status')), 'ok');

  const flood = await Promise.all(Array.from({ length: 80 }, () => two.command('status')));
  const limited = flood.filter((response) => code(response) === 'RATE_LIMITED').length;
  assert.ok(limited >= 30 && limited < 80, `${limited} of 80 commands were rate limited`);
  // The limit is temporary: once the flood stops, the agent is served again.
  await sleep(2300);
  assert.equal(code(await two.command('status')), 'ok');
});

test('leaving the site suspends the session; the user resumes it or adds the new site', async () => {
  const tab = tabs.get(1) as FakeTab;
  tab.url = 'https://login.example/signin';
  fakeChrome.tabs.onUpdated.emit(1, { status: 'loading' }, { ...tab });
  await until(async () => (await state()).sessions[0].suspended, 'the session to be suspended');
  const before = pageLog.length;
  assert.equal(code(await one.command('snapshot')), 'SESSION_SUSPENDED');
  assert.equal(code(await one.command('extract')), 'SESSION_SUSPENDED');
  assert.equal(pageLog.length, before, 'nothing of the other site is read');
  assert.equal((await one.command('status')).result.sessions[0].state, 'suspended');

  // Resuming only works on a site that is part of the session; adding the site is a separate, explicit act.
  assert.equal((await popup({ type: 'resumeSession', session: 's1', tabId: 1 })).ok, false);
  assert.equal((await popup({ type: 'addOrigin', session: 's1', tabId: 2 })).ok, false, 'only from the session\'s own tab');
  assert.equal(code(await one.command('snapshot')), 'SESSION_SUSPENDED');
  const added = await popup({ type: 'addOrigin', session: 's1', tabId: 1 });
  assert.deepEqual(added.state.sessions[0].origins, ['https://app.example', 'https://login.example']);
  assert.equal(code(await one.command('snapshot')), 'ok');

  // Chrome withdraws access when the tab changes site, even to an authorized one: unknown URL, suspended again.
  tab.url = undefined;
  fakeChrome.tabs.onUpdated.emit(1, { status: 'loading' }, { ...tab });
  await until(async () => (await state()).sessions[0].suspended, 'the session to be suspended again');
  tab.url = 'https://app.example/issues';
  assert.equal(code(await one.command('snapshot')), 'SESSION_SUSPENDED', 'returning alone does not resume it');
  assert.equal((await popup({ type: 'resumeSession', session: 's1', tabId: 1 })).ok, true);
  assert.equal(code(await one.command('snapshot')), 'ok');
  assert.equal(code(await two.command('snapshot', { session: 's1' })), 'SESSION_NOT_OWNED', 'the owner is unchanged');
});

test('an authorization with an expiry ends on its own', async () => {
  const reply = await popup({ type: 'authorize', tabId: 2, mode: 'read', clientId: 'c-two', minutes: 0.002 });
  assert.equal(reply.ok, true);
  assert.equal(code(await two.command('snapshot')), 'ok');
  await sleep(160);
  assert.equal(code(await two.command('snapshot')), 'AUTHORIZATION_EXPIRED');
  assert.deepEqual((await state()).sessions.map((x: any) => x.id), ['s1']);
  assert.equal(code(await two.command('snapshot')), 'NOT_AUTHORIZED');
});

test('Enter in a text box is refused without intent, and with it the user is asked first', async () => {
  await popup({ type: 'setMode', session: 's1', mode: 'write' });
  // A declared Enter runs as a submission: the key is pressed by the step that fires it.
  const presses = (): number => pageLog.filter((entry) => entry === '1:submit_fire').length;
  const before = presses();
  const enter = (params: object = {}): Promise<any> => one.command('press_key', { params: { key: 'Enter', ...params } });
  const box = (how: 'enter' | 'form', label: string): void => {
    pageResults.set('key_describe', { submit: how === 'form' ? 'form' : 'text', click: null, label });
    pageResults.set('submit_prepare', {
      target: { readSafe: false, disclosure: false, externalLink: false, submit: null, label }, by: 'enter', how, label, digest: null,
      preview: [{ field: label, text: 'Hello team' }],
    });
  };
  pageResults.set('submit_baseline', { problems: [], baseline: {} });
  pageResults.set('submit_fire', { dispatched: true, effect: 'the page handled the key itself' });
  // What was written shows up on the page afterwards: sent.
  pageResults.set('submit_observe', {
    expectSeen: false, submittedSeen: true, newAlerts: [], invalidFields: [], newStatuses: [], formGone: false, fieldsCleared: true,
    urlChanged: false, documentChanged: false,
  });

  // A message box: the page does not say whether Enter sends or starts a line.
  box('enter', 'Message');
  assert.equal(code(await enter()), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(presses(), before, 'the key is not pressed');

  // Declared: the user is asked, and told that it is a key press.
  const denied = enter({ intent: 'submit' });
  await until(async () => (await state()).pendingConfirm !== null, 'the user to be asked');
  const asked = (await state()).pendingConfirm;
  assert.deepEqual([asked.label, asked.how, asked.session], ['Message', 'enter', 's1']);
  // And where it is, what would be sent, and that nothing in its name makes it high-impact.
  assert.deepEqual([asked.origin, asked.word, asked.highImpact], ['https://app.example', null, false]);
  assert.deepEqual(asked.preview, [{ field: 'Message', text: 'Hello team' }]);
  await popup({ type: 'confirm', id: asked.id, allow: false });
  const refusal = await denied;
  assert.equal(code(refusal), 'SUBMIT_DENIED');
  assert.match(refusal.error.message, /Nothing was pressed/);
  assert.equal(presses(), before);
  await popup({ type: 'askAgain', session: 's1' });

  const allowed = enter({ intent: 'submit' });
  await until(async () => (await state()).pendingConfirm !== null, 'the user to be asked again');
  await popup({ type: 'confirm', id: (await state()).pendingConfirm.id, allow: true });
  const sent = await allowed;
  assert.equal(code(sent), 'ok');
  assert.equal(presses(), before + 1, 'pressed once, after the user allowed it');
  // Like every submission it gets an id and a verdict.
  assert.equal(sent.result.state, 'CONFIRMED');
  assert.match(sent.result.submissionId, /^sub-/);
  assert.equal(sent.result.key, 'Enter');

  // With confirmations switched off by the user, the declared intent is enough.
  await popup({ type: 'setConfirm', value: false });
  assert.equal(code(await enter({ intent: 'submit' })), 'ok');
  assert.equal(code(await enter()), 'SUBMIT_INTENT_REQUIRED', 'but it still has to be declared');
  await popup({ type: 'setConfirm', value: true });

  // A field of a form: Enter submits the form for certain, and the user is told that.
  box('form', 'Email');
  const form = enter({ intent: 'submit' });
  await until(async () => (await state()).pendingConfirm !== null, 'the user to be asked about the form');
  assert.equal((await state()).pendingConfirm.how, 'form');
  await popup({ type: 'confirm', id: (await state()).pendingConfirm.id, allow: false });
  assert.equal(code(await form), 'SUBMIT_DENIED');

  // Other keys, and Enter where it submits nothing, go through.
  pageResults.set('key_describe', { submit: null, click: null, label: 'Search' });
  assert.equal(code(await enter()), 'ok');
  assert.equal(code(await one.command('press_key', { params: { key: 'a' } })), 'ok');

  // Enter that the page left to the browser sent nothing: no submission is recorded for it.
  box('enter', 'Notes');
  pageResults.set('submit_fire', { dispatched: true, effect: 'inserted a new paragraph' });
  await popup({ type: 'setConfirm', value: false });
  const line = await enter({ intent: 'submit' });
  await popup({ type: 'setConfirm', value: true });
  assert.equal(code(line), 'ok');
  assert.deepEqual([line.result.submitted, line.result.effect, line.result.state], [false, 'inserted a new paragraph', undefined]);
  assert.match(line.result.note, /sent nothing/);
  for (const op of ['key_describe', 'submit_prepare', 'submit_baseline', 'submit_fire', 'submit_observe']) pageResults.delete(op);
});

test('the same text is not sent twice by Enter', async () => {
  await popup({ type: 'setConfirm', value: false });
  const enter = (params: object = {}): Promise<any> => one.command('press_key', { params: { key: 'Enter', intent: 'submit', ...params } });
  const fires = (): number => pageLog.filter((entry) => entry === '1:submit_fire').length;
  pageResults.set('key_describe', { submit: 'text', click: null, label: 'Message' });
  pageResults.set('submit_prepare', {
    target: { readSafe: false, disclosure: false, externalLink: false, submit: null, label: 'Message' },
    by: 'enter', how: 'enter', label: 'Message', digest: 'abc-12',
  });
  pageResults.set('submit_baseline', { problems: [], baseline: {} });
  pageResults.set('submit_fire', { dispatched: true, effect: 'the page handled the key itself' });
  pageResults.set('submit_observe', {
    expectSeen: false, submittedSeen: true, newAlerts: [], invalidFields: [], newStatuses: [], formGone: false, fieldsCleared: true,
    urlChanged: false, documentChanged: false,
  });

  assert.equal((await enter()).result.state, 'CONFIRMED');
  const before = fires();
  const again = await enter();
  assert.equal(code(again), 'DUPLICATE_SUBMISSION');
  assert.equal(fires(), before, 'the key is not pressed a second time');
  // On the user's word it is.
  assert.equal((await enter({ repeat: true })).result.state, 'CONFIRMED');
  assert.equal(fires(), before + 1);

  for (const op of ['key_describe', 'submit_prepare', 'submit_baseline', 'submit_fire', 'submit_observe']) pageResults.delete(op);
  await popup({ type: 'setConfirm', value: true });
});

test('a no stands: what the user declined is not asked again until they take it back', async () => {
  const ask = (agent: FakeServer, label: string): Promise<any> => {
    pageResults.set('key_describe', { submit: 'text', click: null, label });
    pageResults.set('submit_prepare', {
      target: { readSafe: false, disclosure: false, externalLink: false, submit: null, label }, by: 'enter', how: 'enter', label, digest: null,
    });
    return agent.command('press_key', { params: { key: 'Enter', intent: 'submit' } });
  };
  pageResults.set('submit_baseline', { problems: [], baseline: {} });
  pageResults.set('submit_fire', { dispatched: true, effect: 'the page handled the key itself' });
  pageResults.set('submit_observe', {
    expectSeen: false, submittedSeen: true, newAlerts: [], invalidFields: [], newStatuses: [], formGone: false, fieldsCleared: true,
    urlChanged: false, documentChanged: false,
  });
  const answer = async (allow: boolean): Promise<void> => {
    await until(async () => (await state()).pendingConfirm !== null, 'the user to be asked');
    await popup({ type: 'confirm', id: (await state()).pendingConfirm.id, allow });
  };
  const notAsked = async (): Promise<any> => (await state()).sessions.find((x: any) => x.id === 's1').notAsked;
  await popup({ type: 'askAgain', session: 's1' });

  // Declined once: the same request is refused without a question.
  const first = ask(one, 'Reply');
  await answer(false);
  assert.equal(code(await first), 'SUBMIT_DENIED');
  const second = await ask(one, 'Reply');
  assert.equal(code(second), 'SUBMIT_DENIED');
  assert.match(second.error.message, /not asked again so soon/);
  assert.equal((await state()).pendingConfirm, null, 'no prompt was raised');
  assert.deepEqual(await notAsked(), { labels: ['Reply'], all: false });

  // Another request is asked about. While it waits, a request of another session is refused at once.
  await popup({ type: 'authorize', tabId: 2, mode: 'write', clientId: 'c-two' });
  const other = (await state()).sessions.find((x: any) => x.tabId === 2).id;
  const waiting = ask(one, 'Note');
  await until(async () => (await state()).pendingConfirm !== null, 'the user to be asked');
  const crowded = await ask(two, 'Elsewhere');
  assert.equal(code(crowded), 'CONFIRMATION_PENDING');
  assert.equal((await state()).pendingConfirm.label, 'Note', 'the question on screen is still the first');
  await popup({ type: 'confirm', id: (await state()).pendingConfirm.id, allow: true });
  assert.equal(code(await waiting), 'ok');
  await popup({ type: 'revoke', session: other });

  // The user takes the no back: asked again, and it can be allowed.
  await popup({ type: 'askAgain', session: 's1' });
  assert.deepEqual(await notAsked(), { labels: [], all: false });
  const third = ask(one, 'Reply');
  await answer(true);
  assert.equal(code(await third), 'ok');

  // Three requests in a row declined: the session is not heard, whatever it asks.
  for (const label of ['One', 'Two', 'Three']) {
    const refused = ask(one, label);
    await answer(false);
    assert.equal(code(await refused), 'SUBMIT_DENIED', label);
  }
  const fourth = await ask(one, 'Four');
  assert.equal(code(fourth), 'SUBMIT_DENIED');
  assert.match(fourth.error.message, /no further one is put to them/);
  assert.equal((await state()).pendingConfirm, null);
  assert.equal((await notAsked()).all, true);
  await popup({ type: 'askAgain', session: 's1' });
  const fifth = ask(one, 'Four');
  await answer(true);
  assert.equal(code(await fifth), 'ok');

  for (const op of ['key_describe', 'submit_prepare', 'submit_baseline', 'submit_fire', 'submit_observe']) pageResults.delete(op);
});

test('Enter or Space on a control follows the rules of a click on it', async () => {
  const presses = (): number => pageLog.filter((entry) => entry === '1:press_key').length;
  const before = presses();
  const control = (submit: 'form' | 'likely' | null, externalLink = false): object =>
    ({ submit: null, label: 'Save', click: { readSafe: false, disclosure: false, externalLink, submit, label: 'Save' } });

  for (const key of ['Enter', 'Space']) {
    pageResults.set('key_describe', control('form'));
    assert.equal(code(await one.command('press_key', { params: { key, ref: 3 } })), 'SUBMIT_INTENT_REQUIRED', key);
    pageResults.set('key_describe', control('likely'));
    assert.equal(code(await one.command('press_key', { params: { key, ref: 3 } })), 'SUBMIT_INTENT_REQUIRED', key);
    pageResults.set('key_describe', control(null, true));
    assert.equal(code(await one.command('press_key', { params: { key, ref: 3 } })), 'NAVIGATION_BLOCKED', key);
  }
  assert.equal(presses(), before, 'none of these reached the page as a key press');

  // A control that submits nothing is activated as before.
  pageResults.set('key_describe', control(null));
  assert.equal(code(await one.command('press_key', { params: { key: 'Enter', ref: 3 } })), 'ok');
  assert.equal(presses(), before + 1);

  // Declared as a submission, the control is needed by ref: a submission is run on a named control.
  pageResults.set('key_describe', control('form'));
  assert.equal(code(await one.command('press_key', { params: { key: 'Enter', intent: 'submit' } })), 'SUBMIT_INTENT_REQUIRED');
  assert.equal(presses(), before + 1);
  pageResults.delete('key_describe');
  await popup({ type: 'setMode', session: 's1', mode: 'read' });
});

test('pause cancels what is running and blocks what follows; revoke ends the session', async () => {
  const running = one.command('wait_for', { id: 'w2', params: { text: 'never', timeoutMs: 20000 } });
  await until(() => waits.has(`${BASE_PORT}:w2`), 'the wait to reach the page');
  await popup({ type: 'pause', session: 's1' });
  assert.equal(code(await running), 'CANCELLED');
  assert.equal(code(await one.command('snapshot')), 'PAUSED');
  await popup({ type: 'resume', session: 's1' });
  assert.equal(code(await one.command('snapshot')), 'ok');

  await popup({ type: 'revoke', session: 's1' });
  assert.equal(code(await one.command('snapshot')), 'NOT_AUTHORIZED');
  assert.equal((await state()).sessions.length, 0);
});

test('closing a tab ends its session, and a disconnected agent stays out until allowed again', async () => {
  await popup({ type: 'authorize', tabId: 2, mode: 'read', clientId: 'c-one' });
  assert.equal((await state()).sessions.length, 1);
  tabs.delete(2);
  fakeChrome.tabs.onRemoved.emit(2);
  await until(async () => (await state()).sessions.length === 0, 'the session of the closed tab to end');

  await popup({ type: 'disconnectClient', clientId: 'c-two' });
  await until(() => two.closeCodes.includes(4403), 'the agent to be disconnected');
  await sleep(2700); // the next scan connects again, recognises the agent and closes it again
  await popup({ type: 'getState' });
  await sleep(100);
  assert.equal(two.paired && (await state()).clients.some((c: any) => c.id === 'c-two'), false, 'a disconnected agent must not slip back in');
  assert.ok(two.closeCodes.filter((c) => c === 4403).length >= 1);

  await popup({ type: 'allowClient', clientId: 'c-two' });
  await until(async () => (await state()).clients.some((c: any) => c.id === 'c-two'), 'the agent to be allowed back');
});
