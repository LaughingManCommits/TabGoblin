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
/** What the badge on the toolbar was set to, in order. */
const badges: string[] = [];
/** Every repeating timer the worker set up, so that a test can let one come round without waiting for it. */
const intervals: { fn: () => void; ms: number }[] = [];
/** What the pages were told for their notice, in order: the tab, the state, and what else came with it. */
const notices: { tab: number; state: unknown; text?: unknown; ended?: unknown }[] = [];

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
  if (msg.op === 'indicator') {
    // Everything that came with it, so that a test sees if more than the notice's own fields went out.
    const { bcmcp: _, op: __, origins: ___, ...told } = msg;
    notices.push({ tab: tabId, ...told });
  }
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
  action: {
    setBadgeText: async ({ text }: { text: string }) => { badges.push(text); },
    setBadgeBackgroundColor: async () => undefined, openPopup: async () => undefined,
  },
  alarms: { create: async () => undefined, onAlarm: new FakeEvent() },
};

/** A fake agent server on one port: speaks the real handshake, then sends commands. */
class FakeServer {
  socket: FakeSocket | null = null;
  /** The server has sent `auth_ok`. The extension checks its proof a moment later: ask the worker whether it is paired. */
  paired = false;
  /** Sends a command right behind every `auth_ok`, as a server does whose agent was waiting for the extension. */
  eager = false;
  /** The answers to those commands, in order. One that is never answered stays pending. */
  eagerAnswers: Promise<any>[] = [];
  /** A server that hangs: its connections stay open, and it says nothing, to old ones and to new ones. */
  silent = false;
  /** Says who it is in its first message, as a server does now. One from before that says it only in its proven answer. */
  announces = true;
  /** Who it says it is there. Its own id, unless a test has it name another. */
  announced: string;
  /** How many times the extension proved to this server that it knows the token. */
  proofs = 0;
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
    this.announced = clientId;
    this.name = name;
    this.versions = versions;
  }

  attach(socket: FakeSocket): void {
    this.socket = socket;
    this.paired = false;
    if (this.silent) return;
    this.deliver(this.challenge());
  }

  private challenge(): object {
    return { type: 'challenge', nonce: this.nonce, versions: this.versions, ...(this.announces ? { clientId: this.announced } : {}) };
  }

  /** The server runs again: a connection that was made meanwhile gets its answer now. */
  wake(): void {
    this.silent = false;
    if (this.socket?.readyState === 1 && !this.paired) this.deliver(this.challenge());
  }

  async receive(msg: any): Promise<void> {
    if (this.silent) return;
    if (msg.type === 'ping') {
      this.deliver({ type: 'pong' });
    } else if (msg.type === 'auth') {
      this.proofs += 1;
      assert.equal(msg.proof, await clientProof(TOKEN, this.nonce, msg.nonce), 'the extension must prove it knows the token');
      this.deliver({ type: 'auth_ok', proof: await serverProof(TOKEN, this.nonce, msg.nonce), version: 2, clientId: this.clientId, clientName: this.name });
      this.paired = true;
      if (this.eager) this.eagerAnswers.push(this.command('status'));
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
  (globalThis as any).setInterval = (fn: () => void, ms: number) => {
    intervals.push({ fn, ms });
    return realSetInterval(fn, ms).unref();
  };
  await import('../src/background.ts');
  // Paired as the worker sees it. A fake server calls itself paired when it has sent `auth_ok`;
  // the worker checks that proof a moment later, and a test that starts in between finds no agent.
  await until(async () => (await state()).clients.length === 2, 'the agents to pair');
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

  // Each answer says how long the command ran, and how long it waited for its turn before that.
  const held = one.command('wait_for', { id: 'w-timed', params: { text: 'never', timeoutMs: 20000 } });
  await until(() => waits.has(`${BASE_PORT}:w-timed`), 'the second wait to reach the page');
  const behind = one.command('snapshot', { id: 'q-timed' });
  await sleep(60);
  one.deliver({ type: 'cancel', id: 'w-timed' });
  const waited = await behind;
  assert.equal(code(waited), 'ok');
  assert.ok(waited.timing.queued >= 40, `it waited ${waited.timing.queued} ms for its turn`);
  assert.ok(waited.timing.ran < waited.timing.queued, 'waiting for its turn is not running');
  assert.equal(waited.timing.asked, 0);
  const holding = (await held).timing;
  assert.ok(holding.ran >= 40 && holding.queued < 40, JSON.stringify(holding));
  // A refusal and the status are answered at once, and say so.
  assert.deepEqual(Object.keys((await one.command('status')).timing).sort(), ['asked', 'queued', 'ran']);
  assert.ok((await one.command('evaluate')).timing.queued < 40, 'nothing was in its way');
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
  await popup({ type: 'setAsk', value: 'never' });
  assert.equal(code(await enter({ intent: 'submit' })), 'ok');
  assert.equal(code(await enter()), 'SUBMIT_INTENT_REQUIRED', 'but it still has to be declared');
  await popup({ type: 'setAsk', value: 'always' });

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
  await popup({ type: 'setAsk', value: 'never' });
  const line = await enter({ intent: 'submit' });
  await popup({ type: 'setAsk', value: 'always' });
  assert.equal(code(line), 'ok');
  assert.deepEqual([line.result.submitted, line.result.effect, line.result.state], [false, 'inserted a new paragraph', undefined]);
  assert.match(line.result.note, /sent nothing/);
  for (const op of ['key_describe', 'submit_prepare', 'submit_baseline', 'submit_fire', 'submit_observe']) pageResults.delete(op);
});

test('the same text is not sent twice by Enter', async () => {
  await popup({ type: 'setAsk', value: 'never' });
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
  await popup({ type: 'setAsk', value: 'always' });
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
  assert.deepEqual(await notAsked(), { requests: [{ how: 'enter', label: 'Reply' }], all: false });

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
  assert.deepEqual(await notAsked(), { requests: [], all: false });
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

test('automatic: the user is asked the first time for each control, and what they allowed passes for a while', async () => {
  const ask = (label: string): Promise<any> => {
    pageResults.set('key_describe', { submit: 'text', click: null, label });
    pageResults.set('submit_prepare', {
      target: { readSafe: false, disclosure: false, externalLink: false, submit: null, label }, by: 'enter', how: 'enter', label, digest: null,
    });
    return one.command('press_key', { params: { key: 'Enter', intent: 'submit' } });
  };
  pageResults.set('submit_baseline', { problems: [], baseline: {} });
  pageResults.set('submit_fire', { dispatched: true, effect: 'the page handled the key itself' });
  pageResults.set('submit_observe', {
    expectSeen: false, submittedSeen: true, newAlerts: [], invalidFields: [], newStatuses: [], formGone: false, fieldsCleared: true,
    urlChanged: false, documentChanged: false,
  });
  // `lasts`: what the prompt says an Allow would reach, in minutes; null when it is for this once.
  const asked = async (label: string, lasts: number | null = 15): Promise<void> => {
    const request = ask(label);
    await until(async () => (await state()).pendingConfirm !== null, `the user to be asked about ${label}`);
    assert.equal((await state()).pendingConfirm.label, label);
    assert.equal((await state()).pendingConfirm.lasts, lasts, `what the prompt says about an Allow for “${label}”`);
    await sleep(20); // the user takes a moment
    await popup({ type: 'confirm', id: (await state()).pendingConfirm.id, allow: true });
    const answer = await request;
    assert.equal(code(answer), 'ok');
    // The server is told the user's time apart from the extension's own.
    assert.ok(answer.timing.asked >= 15 && answer.timing.asked <= answer.timing.ran, JSON.stringify(answer.timing));
  };
  // The activity list keeps its newest entries only, so the newest of its kind is what tells.
  const lastAutomatic = async (): Promise<number> => Math.max(0, ...(await state()).activity
    .filter((entry: any) => entry.label.startsWith('Allowed automatically')).map((entry: any) => entry.id));
  const unasked = async (label: string): Promise<void> => {
    const before = await lastAutomatic();
    const answer = await ask(label);
    assert.equal(code(answer), 'ok');
    assert.equal(answer.timing.asked, 0, 'nobody was asked');
    assert.equal((await state()).pendingConfirm, null);
    assert.ok(await lastAutomatic() > before, `${label} is marked in the activity list as allowed automatically`);
  };
  const session = async (): Promise<any> => (await state()).sessions.find((x: any) => x.id === 's1');
  await popup({ type: 'askAgain', session: 's1' });
  await popup({ type: 'setAsk', session: 's1', value: 'auto' });
  assert.equal((await session()).ask, 'auto');
  assert.equal((await state()).ask, 'always', 'the general setting is as it was');
  // The agent is told both: the general setting, and for each of its sessions what holds there.
  const told = (await one.command('status')).result;
  assert.equal(told.confirmation, 'always');
  assert.equal(told.sessions.find((x: any) => x.session === 's1').confirmation, 'auto');

  await asked('Message');
  assert.deepEqual((await session()).passes, [{ how: 'enter', label: 'Message', minutes: 15 }]);
  await unasked('Message');
  await asked('Reply');
  // A high-impact name is asked about every time, and is not remembered.
  await asked('Delete thread', null);
  await asked('Delete thread', null);
  // So is a control without a name: it could not be told from another one, nor be shown to the user.
  await asked('', null);
  await asked('', null);
  assert.deepEqual((await session()).passes.map((pass: any) => pass.label), ['Message', 'Reply']);

  // A burst: after five unasked in a minute the next is put to the user.
  for (let i = 0; i < 4; i++) await unasked('Message');
  await asked('Message');

  // What was allowed is forgotten when the session is paused, when its access changes, and on the user's word.
  await popup({ type: 'pause', session: 's1' });
  await popup({ type: 'resume', session: 's1' });
  assert.deepEqual((await session()).passes, []);
  await asked('Reply');
  await popup({ type: 'setMode', session: 's1', mode: 'write' });
  assert.deepEqual((await session()).passes, []);
  await asked('Reply');
  await popup({ type: 'forgetAllowed', session: 's1' });
  assert.deepEqual((await session()).passes, []);

  // The general setting replaces what a session had of its own.
  await popup({ type: 'setAsk', value: 'always' });
  assert.equal((await session()).ask, 'always');
  await asked('Reply', null);
  await asked('Reply', null);
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

test('disconnecting an agent ends its sessions; allowing it again gives back the connection and no tab', async () => {
  for (const [id, host] of [[2, 'docs'], [3, 'wiki'], [4, 'mail']] as const) {
    tabs.set(id, { id, url: `https://${host}.example/start`, status: 'complete', active: false, windowId: 1, title: host });
  }
  await popup({ type: 'authorize', tabId: 1, mode: 'read', clientId: 'c-one' });
  await popup({ type: 'authorize', tabId: 2, mode: 'write', clientId: 'c-two' });
  await popup({ type: 'authorize', tabId: 3, mode: 'write', clientId: 'c-two' });
  await popup({ type: 'authorize', tabId: 4, mode: 'read', clientId: null }); // for any agent, and taken up by none
  let s = await state();
  const [ofOne, first, second, open] = s.sessions.map((x: any) => x.id);
  assert.deepEqual(s.sessions.map((x: any) => x.clientId), ['c-one', 'c-two', 'c-two', null]);
  // The popup is told what a Disconnect would end, so that it can say so before the click.
  const tabsOf = (view: any, id: string): number => view.clients.find((c: any) => c.id === id).tabs;
  assert.deepEqual([tabsOf(s, 'c-one'), tabsOf(s, 'c-two')], [1, 2]);

  // Something of the agent's is under way in a page.
  void two.command('wait_for', { session: first, id: 'wd', params: { text: 'never', timeoutMs: 20000 } });
  await until(() => waits.has(`${BASE_PORT + 2}:wd`), 'the wait to reach the page');
  // And in its other tab it has put a question to the user.
  const pageAnswers = ['key_describe', 'submit_prepare', 'submit_baseline'].map((op) => [op, pageResults.get(op)] as const);
  pageResults.set('key_describe', { submit: 'text', click: null, label: 'Message' });
  pageResults.set('submit_prepare', {
    target: { readSafe: false, disclosure: false, externalLink: false, submit: null, label: 'Message' }, by: 'enter', how: 'enter', label: 'Message', digest: null,
    preview: [{ field: 'Message', text: 'Hello team' }],
  });
  pageResults.set('submit_baseline', { problems: [], baseline: {} });
  await popup({ type: 'setAsk', session: second, value: 'always' });
  const sentBefore = pageLog.filter((entry) => entry === '3:submit_fire').length;
  void two.command('press_key', { session: second, params: { key: 'Enter', intent: 'submit' } });
  await until(async () => (await state()).pendingConfirm?.session === second, 'the user to be asked');

  await popup({ type: 'disconnectClient', clientId: 'c-two' });
  await until(() => two.closeCodes.includes(4403), 'the agent to be disconnected');
  await until(() => !waits.has(`${BASE_PORT + 2}:wd`), 'the wait in the page to be cancelled');
  s = await state();
  assert.equal(s.pendingConfirm, null, 'its question to the user is withdrawn');
  await sleep(50);
  assert.equal(pageLog.filter((entry) => entry === '3:submit_fire').length, sentBefore, 'and nothing was pressed');
  for (const [op, answer] of pageAnswers) {
    if (answer === undefined) pageResults.delete(op);
    else pageResults.set(op, answer);
  }
  assert.deepEqual(s.sessions.map((x: any) => x.id), [ofOne, open], 'its two sessions ended; another agent\'s and nobody\'s stay');
  // The list keeps what still runs behind what is finished, so the newest note is looked for by its words.
  const disconnects = (view: any): string[] => view.activity.map((a: any) => a.label).filter((label: string) => label.startsWith('Agent disconnected'));
  assert.equal(disconnects(s).at(-1), 'Agent disconnected by you; 2 sessions ended');
  assert.equal(s.activity.filter((a: any) => a.label === 'Access revoked: you disconnected its agent').length, 2);
  assert.equal(code(await one.command('snapshot', { session: ofOne })), 'ok', 'the other agent keeps working');

  // An agent of the same name finds nothing to take up. Before, a session whose owner was not
  // connected passed to it, and a name is what an agent gives itself.
  const twin = new FakeServer('c-twin', 'agent-two');
  servers.set(BASE_PORT + 5, twin);
  for (let i = 0; i < 120 && !(await state()).clients.some((c: any) => c.id === 'c-twin'); i++) await sleep(50);
  assert.equal(code(await twin.command('snapshot', { session: first })), 'UNKNOWN_SESSION');
  assert.equal(code(await twin.command('snapshot', { session: second })), 'UNKNOWN_SESSION');
  assert.equal(tabsOf(await state(), 'c-twin'), 0);
  await popup({ type: 'disconnectClient', clientId: 'c-twin' });
  servers.delete(BASE_PORT + 5);
  assert.equal(disconnects(await state()).at(-1), 'Agent disconnected by you', 'an agent without a tab ends none');
  assert.deepEqual((await state()).sessions.map((x: any) => x.id), [ofOne, open]);

  // Allowed again, the agent is connected and has no tab: each one needs the user's click again.
  await popup({ type: 'allowClient', clientId: 'c-two' });
  await until(async () => (await state()).clients.some((c: any) => c.id === 'c-two'), 'the agent to be allowed back');
  assert.equal(tabsOf(await state(), 'c-two'), 0);
  assert.equal(code(await two.command('snapshot', { session: first })), 'UNKNOWN_SESSION');
  const status = await two.command('status');
  assert.deepEqual(status.result.sessions.map((x: any) => [x.session, x.owner]), [[open, 'unclaimed']], 'nothing of its own is left');
  // A new click on the tab gives it a new session; the old id stays dead.
  await popup({ type: 'authorize', tabId: 2, mode: 'read', clientId: 'c-two' });
  const again = (await state()).sessions.at(-1);
  assert.notEqual(again.id, first);
  assert.equal(code(await two.command('snapshot', { session: again.id })), 'ok');

  for (const left of (await state()).sessions) await popup({ type: 'revoke', session: left.id });
  for (const id of [2, 3, 4]) tabs.delete(id);
  assert.equal((await state()).sessions.length, 0);
});

test('what a server sends right behind the pairing is a message like any other, not a failed pairing', async () => {
  const within = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> => Promise.race([
    promise, sleep(ms).then(() => { throw new Error(`timed out waiting for ${what}`); }),
  ]);
  /** Waits across scans: the popup asks for one whenever it is open, at most every 2.5 seconds. */
  const eventually = async (condition: () => boolean, what: string): Promise<void> => {
    for (let i = 0; i < 120 && !condition(); i++) {
      await state();
      await sleep(50);
    }
    assert.ok(condition(), `timed out waiting for ${what}`);
  };
  // A server whose agent was waiting for the extension: its command leaves in the same turn as
  // `auth_ok`, and reaches the worker while it is still checking the server's proof.
  const eager = new FakeServer('c-eager', 'eager-agent');
  eager.eager = true;
  servers.set(BASE_PORT + 4, eager);
  await eventually(() => eager.eagerAnswers.length === 1, 'the new server to be found');
  assert.equal(code(await within(eager.eagerAnswers[0], 3000, 'an answer to the command sent with the pairing')), 'ok');
  let s = await state();
  assert.equal(s.connection, 'connected');
  assert.ok(s.clients.some((c: any) => c.id === 'c-eager'), 'the server is paired');
  assert.deepEqual(eager.closeCodes, [], 'and its connection was not closed');

  // An agent the user disconnected is turned away as that. Its command behind `auth_ok` does not
  // make it a failed pairing, which would stop the search for every other server.
  await popup({ type: 'disconnectClient', clientId: 'c-eager' });
  await until(() => eager.closeCodes.includes(4403), 'the agent to be disconnected');
  await eventually(() => eager.closeCodes.filter((c) => c === 4403).length >= 2, 'the agent to come back and be turned away again');
  await sleep(50);
  s = await state();
  assert.equal(s.connection, 'connected', 'no pairing has failed');
  assert.ok(!s.clients.some((c: any) => c.id === 'c-eager'));
  servers.delete(BASE_PORT + 4);
});

test('an agent the user disconnected is turned away before anything is proven to it, where its server says who it is', async () => {
  /** Waits across scans: the popup asks for one whenever it is open, at most every 2.5 seconds. */
  const eventually = async (condition: () => boolean | Promise<boolean>, what: string): Promise<void> => {
    for (let i = 0; i < 160 && !(await condition()); i++) {
      await state();
      await sleep(50);
    }
    assert.ok(await condition(), `timed out waiting for ${what}`);
  };
  const turnedAway = (server: FakeServer): number => server.closeCodes.filter((c) => c === 4403).length;
  const paired = async (id: string): Promise<boolean> => (await state()).clients.some((c: any) => c.id === id);
  const back = new FakeServer('c-back', 'back-agent');
  servers.set(BASE_PORT + 7, back);
  await eventually(() => paired('c-back'), 'the new server to be found');
  assert.equal(back.proofs, 1);

  await popup({ type: 'disconnectClient', clientId: 'c-back' });
  await until(() => turnedAway(back) === 1, 'the agent to be disconnected');
  // The ports are looked at again and again while the popup is open. Its server is still there and
  // is connected to each time, because only a connection says whose server holds a port. It says so
  // at once, and that is where it ends: no proof goes to it, so it never counts the extension as
  // connected and writes nothing about it. Before, each look paired with it and closed it again.
  await eventually(() => turnedAway(back) >= 3, 'the server to be looked at again, and turned away');
  assert.equal(back.proofs, 1, 'nothing was proven to it again');
  assert.equal(back.paired, false);
  assert.equal(await paired('c-back'), false);
  assert.equal((await state()).connection, 'connected', 'and no pairing has failed');

  // A server from before this says who it is only in its proven answer. It is turned away as it
  // always was: after the pairing, and not let in.
  back.announces = false;
  const before = turnedAway(back);
  await eventually(() => back.proofs >= 2 && turnedAway(back) > before, 'the older server to be paired with and turned away');
  await sleep(50);
  assert.equal(await paired('c-back'), false, 'a disconnected agent must not slip back in');
  assert.equal((await state()).connection, 'connected');
  back.announces = true;

  // What a server says of itself before the proof turns it away and gives it nothing. One that
  // names another agent there is paired with as itself, by the id in its proven answer.
  const liar = new FakeServer('c-liar', 'liar-agent');
  liar.announced = 'c-one';
  servers.set(BASE_PORT + 5, liar);
  await eventually(() => paired('c-liar'), 'the server to be paired with under its proven id');
  const s = await state();
  assert.equal(s.clients.filter((c: any) => c.id === 'c-one').length, 1, 'the agent it named is there once, as before');
  assert.equal(s.clients.find((c: any) => c.id === 'c-liar').tabs, 0, 'and it has none of that agent\'s tabs');
  // And one that names a disconnected agent is not paired with: it has turned itself away.
  liar.announced = 'c-back';
  await popup({ type: 'disconnectClient', clientId: 'c-liar' });
  await until(() => turnedAway(liar) === 1, 'the server to be disconnected');
  await popup({ type: 'allowClient', clientId: 'c-liar' });
  const proofs = liar.proofs;
  await eventually(() => turnedAway(liar) >= 3, 'the server to be looked at again');
  assert.equal(liar.proofs, proofs);
  assert.equal(await paired('c-liar'), false);

  servers.delete(BASE_PORT + 5);
  servers.delete(BASE_PORT + 7);
});

test('the panels of the popup fold on the user\'s word, and the prompt is not one of them', async () => {
  assert.deepEqual((await state()).folded, []);
  await popup({ type: 'setFolded', panel: 'activity', value: true });
  // A question that waits for the user cannot be folded away.
  await popup({ type: 'setFolded', panel: 'confirm', value: true });
  assert.deepEqual((await state()).folded, ['activity']);
  assert.deepEqual(storageLocal.folded, ['activity'], 'kept for the next time the popup opens');
  // A page is not the popup: it folds nothing.
  await popup({ type: 'setFolded', panel: 'sessions', value: true }, { id: EXTENSION_ID, url: 'https://evil.example/', tab: { id: 1 } });
  assert.deepEqual((await state()).folded, ['activity']);
  await popup({ type: 'setFolded', panel: 'activity', value: false });
  assert.deepEqual((await state()).folded, []);
});

test('the page is told what runs and how it ended, in the list\'s fixed words and nothing of the page', async () => {
  await popup({ type: 'authorize', tabId: 1, mode: 'read', clientId: 'c-one' });
  const sid = (await state()).sessions.at(-1).id;
  const start = notices.length;
  /** What tab 1 was told since the last look. */
  let seen = start;
  const next = async (count: number, what: string): Promise<object[]> => {
    await until(() => notices.length >= seen + count, what);
    await sleep(30); // and nothing more than that
    const told = notices.slice(seen);
    seen = notices.length;
    assert.ok(told.every((n) => n.tab === 1), 'no other tab is told anything');
    return told.map(({ tab: _, ...rest }) => rest);
  };

  // A command that runs through: what runs, then that it ended, with a line for it.
  assert.equal(code(await one.command('snapshot', { session: sid })), 'ok');
  assert.deepEqual(await next(2, 'the snapshot to be said'), [
    { state: 'working', text: 'Reading page' },
    { state: 'idle', ended: { text: 'Read page', mark: 'ok' } },
  ]);
  // A command that is refused: the line says so, with the short note.
  assert.equal(code(await one.command('fill', { session: sid, params: { ref: 3, text: 'the secret text' } })), 'WRITE_NOT_AUTHORIZED');
  assert.deepEqual(await next(2, 'the refused fill to be said'), [
    { state: 'working', text: 'Entering text' },
    { state: 'idle', ended: { text: 'Entering text (needs Write access)', mark: 'error' } },
  ]);
  // A screenshot: the notice is taken away before the capture and not announced. Its line comes after.
  assert.equal(code(await one.command('screenshot', { session: sid })), 'ok');
  assert.deepEqual(await next(2, 'the screenshot to be said'), [
    { state: 'off' },
    { state: 'idle', ended: { text: 'Captured screenshot', mark: 'ok' } },
  ]);

  // A submission the user is asked about: the page says that the agent waits for them.
  await popup({ type: 'setMode', session: sid, mode: 'write' });
  await popup({ type: 'setAsk', session: sid, value: 'always' });
  const answers = ['key_describe', 'submit_prepare', 'submit_baseline'].map((op) => [op, pageResults.get(op)] as const);
  pageResults.set('key_describe', { submit: 'text', click: null, label: 'Message' });
  pageResults.set('submit_prepare', {
    target: { readSafe: false, disclosure: false, externalLink: false, submit: null, label: 'Message' }, by: 'enter', how: 'enter', label: 'Message', digest: null,
    preview: [{ field: 'Message', text: 'Hello team' }],
  });
  pageResults.set('submit_baseline', { problems: [], baseline: {} });
  const asked = one.command('press_key', { session: sid, params: { key: 'Enter', intent: 'submit' } });
  await until(async () => (await state()).pendingConfirm?.session === sid, 'the user to be asked');
  assert.deepEqual(await next(2, 'the question to be said'), [{ state: 'working', text: 'Submitting' }, { state: 'asking' }]);
  await popup({ type: 'confirm', id: (await state()).pendingConfirm.id, allow: false });
  assert.equal(code(await asked), 'SUBMIT_DENIED');
  assert.deepEqual(await next(2, 'the answer to be said'), [
    { state: 'working', text: 'Submitting' },
    { state: 'idle', ended: { text: 'Submitting (you declined)', mark: 'error' } },
  ]);
  for (const [op, answer] of answers) {
    if (answer === undefined) pageResults.delete(op);
    else pageResults.set(op, answer);
  }

  // Pause in the page itself: the click is answered there. Only the page of the session's tab can.
  await popup({ bcmcp: 'indicator-pause' }, { id: EXTENSION_ID, url: 'https://docs.example/guide', tab: { id: 2 } });
  await popup({ bcmcp: 'indicator-pause' }, { id: EXTENSION_ID, url: 'https://app.example/issues', tab: { id: 1 } });
  assert.deepEqual(await next(1, 'the pause to be said'), [{ state: 'paused', ended: { text: 'Paused by you', mark: 'info' } }]);
  assert.equal((await state()).sessions.at(-1).paused, true);
  // A paused session runs nothing, and the page is not told that it does.
  assert.equal(code(await one.command('snapshot', { session: sid })), 'PAUSED');
  assert.deepEqual(await next(1, 'the refusal to be said'), [{ state: 'paused', ended: { text: 'Reading page (paused)', mark: 'error' } }]);
  await popup({ type: 'resume', session: sid });
  assert.deepEqual(await next(1, 'the resume to be said'), [{ state: 'idle' }]);
  await popup({ type: 'pause', session: sid });
  assert.deepEqual(await next(1, 'the pause from the popup to be said'), [{ state: 'paused' }]);
  await popup({ type: 'resume', session: sid });
  await next(1, 'the second resume to be said');

  // Switched off: it is taken away, and a command says nothing in the page.
  await popup({ type: 'setIndicator', value: false });
  assert.deepEqual(await next(1, 'the notice to be taken away'), [{ state: 'off' }]);
  assert.equal(code(await one.command('snapshot', { session: sid })), 'ok');
  await sleep(50);
  assert.equal(notices.length, seen, 'nothing is said while the notice is switched off');
  await popup({ type: 'setIndicator', value: true });
  // A session that ends takes its notice with it.
  await popup({ type: 'revoke', session: sid });
  assert.deepEqual(await next(1, 'the end of the session to be said'), [{ state: 'off' }]);

  // All of it, read once more: a state, and the fixed words. Nothing of a page, of what was typed,
  // of a control's name, of a site or of an agent.
  const all = JSON.stringify(notices.slice(start));
  for (const secret of ['snapshot of tab', 'the secret text', 'Hello team', 'Message', 'app.example', 'agent-one', 'c-one']) {
    assert.ok(!all.includes(secret), `the page was told "${secret}"`);
  }
  for (const notice of notices.slice(start)) {
    assert.deepEqual(Object.keys(notice).filter((key) => !['tab', 'state', 'text', 'ended'].includes(key)), []);
  }
});

test('a server that stops answering is taken for gone, and the badge says ON only while an agent is there to act', async () => {
  for (const left of (await state()).sessions) await popup({ type: 'revoke', session: left.id });
  const quiet = new FakeServer('c-quiet', 'quiet-agent');
  servers.set(BASE_PORT + 6, quiet);
  const found = async (): Promise<boolean> => (await state()).clients.some((c: any) => c.id === 'c-quiet');
  for (let i = 0; i < 120 && !(await found()); i++) await sleep(50);
  assert.ok(await found(), 'the new server is found');
  tabs.set(9, { id: 9, url: 'https://quiet.example/board', status: 'complete', active: false, windowId: 1, title: 'Board' });
  const reply = await popup({ type: 'authorize', tabId: 9, mode: 'read', clientId: 'c-quiet' });
  assert.equal(reply.ok, true);
  const sid = reply.state.sessions.at(-1).id;
  assert.equal(code(await quiet.command('snapshot', { session: sid })), 'ok');
  await sleep(30);
  assert.equal(badges.at(-1), 'ON');

  // The heartbeat of this connection is the last one that was set up; it comes round every twenty seconds.
  const beat = intervals.filter((i) => i.ms === 20000).at(-1)!.fn;
  // A server that answers stays, however many heartbeats pass.
  for (let i = 0; i < 5; i++) {
    beat();
    await sleep(20);
  }
  assert.ok(await found());
  assert.equal(quiet.closeCodes.length, 0);

  // It hangs: the connection stays open, and nothing comes back.
  quiet.silent = true;
  beat();
  await sleep(20);
  beat();
  await sleep(20);
  assert.ok(await found(), 'two heartbeats are let go by: one answer may be late');
  assert.equal(quiet.closeCodes.length, 0);
  beat();
  await until(async () => !(await found()), 'the silent server to be taken for gone');
  assert.ok(quiet.closeCodes.includes(4408));
  // The other agents are untouched, and the tab stays authorized: the popup says that its agent
  // is not connected, and the badge no longer says that an agent may act.
  const s = await state();
  assert.deepEqual(s.clients.map((c: any) => c.id).sort(), ['c-one', 'c-two']);
  assert.equal(s.sessions.find((x: any) => x.id === sid).ownerConnected, false);
  await sleep(30);
  assert.equal(badges.at(-1), 'OFF');
  // While it hangs it is looked for again, and gets no further than a connection without an answer.
  for (let i = 0; i < 40; i++) {
    await state();
    await sleep(50);
  }
  assert.equal(await found(), false);

  // It runs again: it is found, the tab is its own as before, and the badge says ON.
  quiet.wake();
  for (let i = 0; i < 120 && !(await found()); i++) await sleep(50);
  assert.ok(await found(), 'the server is found again');
  assert.equal(code(await quiet.command('snapshot', { session: sid })), 'ok');
  await sleep(30);
  assert.equal(badges.at(-1), 'ON');

  await popup({ type: 'revoke', session: sid });
  tabs.delete(9);
  servers.delete(BASE_PORT + 6);
  quiet.socket?.close();
  await until(async () => !(await found()), 'the server to be gone at the end');
  await sleep(30);
  assert.equal(badges.at(-1), '', 'no tab is authorized: the badge says nothing');
});

test('a server that is started again is told its tabs at once, by its agent\'s name', async () => {
  for (const left of (await state()).sessions) await popup({ type: 'revoke', session: left.id });
  const port = BASE_PORT + 6;
  const has = async (id: string): Promise<boolean> => (await state()).clients.some((c: any) => c.id === id);
  const arrive = async (server: FakeServer): Promise<void> => {
    servers.set(port, server);
    for (let i = 0; i < 120 && !(await has(server.clientId)); i++) await sleep(50);
    assert.ok(await has(server.clientId), `${server.clientId} is found`);
  };
  const leave = async (server: FakeServer): Promise<void> => {
    servers.delete(port);
    server.socket?.close();
    await until(async () => !(await has(server.clientId)), `${server.clientId} to be gone`);
  };
  /** Whether the extension has told this server, without being asked, that the tab is its own. */
  const told = (server: FakeServer, session: string): boolean => server.events
    .some((e) => e.event === 'sessions' && e.data.sessions.some((x: any) => x.session === session));
  const row = async (session: string): Promise<any> => (await state()).sessions.find((x: any) => x.id === session);

  // An agent's server, with a tab of its own.
  const first = new FakeServer('c-first', 'restarting-agent');
  await arrive(first);
  tabs.set(9, { id: 9, url: 'https://restart.example/board', status: 'complete', active: false, windowId: 1, title: 'Board' });
  const reply = await popup({ type: 'authorize', tabId: 9, mode: 'read', clientId: 'c-first' });
  assert.equal(reply.ok, true);
  const sid = reply.state.sessions.at(-1).id;
  await until(() => told(first, sid), 'the first server to be told its tab');

  // The server is stopped. The tab stays authorized, and nobody is there to act on it.
  await leave(first);
  assert.equal((await row(sid)).ownerConnected, false);
  await sleep(30);
  assert.equal(badges.at(-1), 'OFF');

  // It is started again: a new id, the same name, known when it pairs. It is told its tab right
  // behind the pairing, without asking for anything, and the popup and the badge say that the
  // tab's agent is there. Before, the server heard of the tab only with its first command.
  const again = new FakeServer('c-again', 'restarting-agent');
  await arrive(again);
  await until(() => told(again, sid), 'the restarted server to be told its tab');
  assert.equal((await row(sid)).ownerConnected, true);
  // It is the new server's own, and not one it may take up with a command some time: everything
  // that names the tab's agent names the one that is there.
  assert.equal((await row(sid)).clientId, 'c-again');
  assert.equal((await again.command('status')).result.sessions[0].owner, 'you');
  await sleep(30);
  assert.equal(badges.at(-1), 'ON');
  assert.equal(code(await again.command('snapshot', { session: sid })), 'ok');

  // Started once more, by an agent that says its name only later: nothing is its own before it
  // has said it, and all of it the moment it does.
  await leave(again);
  const late = new FakeServer('c-late', '');
  await arrive(late);
  await sleep(100);
  assert.equal(told(late, sid), false, 'an agent without a name is given nothing');
  assert.equal((await row(sid)).ownerConnected, false);
  assert.equal((await row(sid)).clientId, 'c-again', 'the tab stays with the server that is gone');
  assert.equal(code(await late.command('snapshot', { session: sid })), 'SESSION_NOT_OWNED');
  late.deliver({ type: 'client', name: 'restarting-agent' });
  await until(() => told(late, sid), 'the server to be told its tab once it has said its name');
  assert.equal((await row(sid)).ownerConnected, true);
  assert.equal((await row(sid)).clientId, 'c-late');
  await sleep(30);
  assert.equal(badges.at(-1), 'ON');

  // Another agent, with another name, is told nothing of it and cannot reach it.
  assert.equal(told(one, sid), false);
  assert.equal(code(await one.command('snapshot', { session: sid })), 'SESSION_NOT_OWNED');

  await popup({ type: 'revoke', session: sid });
  tabs.delete(9);
  await leave(late);
});
