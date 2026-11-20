// Background service worker: owns the WebSocket to the local Java server, enforces
// authorization before every command, and keeps the short-lived activity feed.
//
// It never touches cookies, headers, storage of the page, the debugger or the network of the site,
// and it has no way to run agent-supplied code: commands map to a fixed set of operations.

import { clientProof, randomNonce, safeEqual, serverProof } from './pairing.ts';
import {
  CommandError, activityLabel, checkClick, checkGate, failureNote, originOf, resolveNavigation,
  type Access, type Authorization, type ClickTarget,
} from './policy.ts';

const DEFAULT_PORT = 47821;
const MAX_INBOUND_CHARS = 1_000_000;
const CONFIRM_TIMEOUT_MS = 60_000;
const ACTIVITY_KEPT = 5;

interface Config {
  token: string;
  port: number;
  confirmSubmissions: boolean;
}

interface ActivityEntry {
  id: number;
  label: string;
  status: 'running' | 'ok' | 'error' | 'info';
  note?: string;
  time: number;
}

/** Lives in chrome.storage.session: survives worker restarts, cleared when the browser closes. */
interface Session {
  auth: Authorization | null;
  paused: boolean;
  activity: ActivityEntry[];
  activitySeq: number;
  /** Highest element ref handed out so far; new documents continue after it. */
  refHigh: number;
}

type ConnectionStatus = 'unpaired' | 'connecting' | 'connected' | 'disconnected' | 'pairing_failed';
type ConfirmAnswer = 'allow' | 'deny' | 'timeout' | 'cancelled';

let config: Config = { token: '', port: DEFAULT_PORT, confirmSubmissions: true };
let session: Session = { auth: null, paused: false, activity: [], activitySeq: 0, refHigh: 0 };
let connection: ConnectionStatus = 'disconnected';
let socket: WebSocket | null = null;
let authenticated = false;
let keepalive: ReturnType<typeof setInterval> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectDelay = 1000;
let pendingConfirm: { id: string; label: string; finish: (answer: ConfirmAnswer) => void } | null = null;
let queue: Promise<void> = Promise.resolve();

const ready: Promise<void> = (async () => {
  try {
    // Keep the pairing token out of reach of content scripts.
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Older Chrome: content scripts here never read storage anyway.
  }
  const stored = await chrome.storage.local.get(['token', 'port', 'confirmSubmissions']);
  config = {
    token: typeof stored.token === 'string' ? stored.token : '',
    port: typeof stored.port === 'number' ? stored.port : DEFAULT_PORT,
    confirmSubmissions: stored.confirmSubmissions !== false,
  };
  const saved = (await chrome.storage.session.get('session')).session as Session | undefined;
  if (saved) {
    session = saved;
    // Anything still "running" belonged to a worker that no longer exists.
    session.activity = session.activity.filter((a) => a.status !== 'running');
  }
  refreshBadge();
})();

function saveSession(): void {
  void chrome.storage.session.set({ session });
}

// ---------------------------------------------------------------- activity feed and badge

function beginActivity(label: string): ActivityEntry {
  const entry: ActivityEntry = { id: ++session.activitySeq, label, status: 'running', time: Date.now() };
  pushActivity(entry);
  return entry;
}

function endActivity(entry: ActivityEntry, status: 'ok' | 'error', label: string, note?: string): void {
  entry.status = status;
  entry.label = label;
  entry.note = note;
  entry.time = Date.now();
  saveSession();
  refreshBadge();
}

/** Records something that is not a command, e.g. an authorization change. */
function noteActivity(label: string): void {
  pushActivity({ id: ++session.activitySeq, label, status: 'info', time: Date.now() });
}

function pushActivity(entry: ActivityEntry): void {
  session.activity.push(entry);
  // The running entry plus the last five finished ones.
  const finished = session.activity.filter((a) => a.status !== 'running').slice(-ACTIVITY_KEPT);
  const running = session.activity.filter((a) => a.status === 'running');
  session.activity = finished.concat(running);
  saveSession();
  refreshBadge();
}

function refreshBadge(): void {
  const running = session.activity.some((a) => a.status === 'running');
  let text = '';
  let color = '#5f6368';
  if (pendingConfirm) {
    text = '?';
    color = '#d97706';
  } else if (running) {
    text = 'RUN';
    color = '#2563eb';
  } else if (session.auth && session.paused) {
    text = 'II';
  } else if (session.auth) {
    text = 'ON';
    color = '#15803d';
  }
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
}

// ---------------------------------------------------------------- authorization

async function getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

async function authorize(tabId: number, access: Access): Promise<void> {
  const tab = await getTab(tabId);
  const origin = originOf(tab?.url);
  if (!origin) {
    throw new Error('This page cannot be authorized. Open an http(s) website, then click the extension icon on that tab.');
  }
  pendingConfirm?.finish('cancelled');
  session.auth = { tabId, origin, access };
  session.paused = false;
  noteActivity(access === 'write' ? 'Site authorized (read / write)' : 'Site authorized (read only)');
  pushState();
}

function revoke(reason: string): void {
  if (!session.auth) return;
  session.auth = null;
  session.paused = false;
  pendingConfirm?.finish('cancelled');
  noteActivity(reason);
  pushState();
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(() => {
    if (session.auth?.tabId === tabId) revoke('Tab closed: access revoked');
  });
});

// Any navigation of the authorized tab: if it is no longer on the authorized origin, access ends
// immediately. tab.url is only visible while Chrome still grants this extension the tab, so an
// unknown URL also ends access (fail closed).
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  void ready.then(() => {
    if (session.auth?.tabId !== tabId) return;
    if (info.url === undefined && info.status === undefined) return;
    if (originOf(tab.url) !== session.auth.origin) revoke('Left authorized site: access revoked');
  });
});

// ---------------------------------------------------------------- talking to the page

interface PageReply {
  ok: boolean;
  result?: unknown;
  highestRef?: number;
  code?: string;
  message?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); });
  });
}

function sendToPage(tabId: number, message: object, timeoutMs: number): Promise<PageReply> {
  return withTimeout(
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }) as Promise<PageReply>,
    timeoutMs,
    () => new CommandError('PAGE_TIMEOUT',
      'The page did not respond in time (it may be busy or showing a dialog). The outcome is unknown; take a snapshot before repeating anything.'));
}

async function waitWhileLoading(tabId: number, maxMs: number): Promise<chrome.tabs.Tab | undefined> {
  const deadline = Date.now() + maxMs;
  let tab = await getTab(tabId);
  while (tab?.status === 'loading' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    tab = await getTab(tabId);
  }
  return tab;
}

/** Makes sure our content script is present in the tab's current document. Safe to repeat. */
async function ensureContentScript(auth: Authorization): Promise<void> {
  const ping = { bcmcp: 1, op: 'ping', origin: auth.origin };
  let reply: PageReply | undefined;
  try {
    reply = await sendToPage(auth.tabId, ping, 3000);
  } catch (e) {
    if (e instanceof CommandError) throw e;
    // No receiver: this document has no content script yet.
  }
  if (!reply) {
    try {
      await withTimeout(
        chrome.scripting.executeScript({ target: { tabId: auth.tabId }, files: ['content.js'] }),
        8000, () => new Error('injection timed out'));
      reply = await sendToPage(auth.tabId, ping, 3000);
    } catch (e) {
      if (e instanceof CommandError) throw e;
      throw new CommandError('PAGE_UNAVAILABLE',
        'The extension cannot access this page. Browser pages, the Chrome Web Store and error pages are off limits; otherwise ask the user to click the extension icon on the tab and authorize it again.');
    }
  }
  if (!reply?.ok) throw pageError(reply);
}

function pageError(reply: PageReply | undefined): CommandError {
  if (reply?.code === 'ORIGIN_MISMATCH') revoke('Left authorized site: access revoked');
  return new CommandError(reply?.code ?? 'PAGE_ERROR', reply?.message ?? 'The page did not answer.');
}

/** Runs exactly one operation in the page. Never re-sends it. */
async function page<T>(auth: Authorization, op: string, params: object, timeoutMs = 15000): Promise<T> {
  await waitWhileLoading(auth.tabId, 10000);
  await ensureContentScript(auth);
  let reply: PageReply;
  try {
    reply = await sendToPage(auth.tabId, { bcmcp: 1, op, origin: auth.origin, refBase: session.refHigh, ...params }, timeoutMs);
  } catch (e) {
    if (e instanceof CommandError) throw e;
    throw new CommandError('PAGE_NAVIGATED',
      'The page navigated or reloaded before the operation finished. The outcome is unknown; take a new snapshot.');
  }
  if (typeof reply?.highestRef === 'number' && reply.highestRef > session.refHigh) {
    session.refHigh = reply.highestRef;
    saveSession();
  }
  if (!reply?.ok) throw pageError(reply);
  return reply.result as T;
}

// ---------------------------------------------------------------- commands

async function statusResult(): Promise<object> {
  const tab = session.auth ? await getTab(session.auth.tabId) : undefined;
  return {
    authorized: !!session.auth,
    origin: session.auth?.origin ?? null,
    access: session.auth?.access ?? null,
    paused: session.paused,
    confirmSubmissions: config.confirmSubmissions,
    tab: session.auth && tab ? { title: tab.title ?? '', url: tab.url ?? '' } : null,
  };
}

/** Throws unless the command may run right now. Re-reads the tab's URL every time. */
async function gate(action: string): Promise<{ auth: Authorization; tab: chrome.tabs.Tab }> {
  let tab: chrome.tabs.Tab | undefined;
  if (session.auth) {
    tab = await getTab(session.auth.tabId);
    if (!tab) revoke('Tab closed: access revoked');
  }
  try {
    checkGate({ auth: session.auth, paused: session.paused }, action, tab?.url);
  } catch (e) {
    if (e instanceof CommandError && e.code === 'ORIGIN_MISMATCH') revoke('Left authorized site: access revoked');
    throw e;
  }
  return { auth: session.auth as Authorization, tab: tab as chrome.tabs.Tab };
}

async function runCommand(action: string, params: Record<string, unknown>): Promise<unknown> {
  if (action === 'status') return statusResult();
  const { auth, tab } = await gate(action);
  switch (action) {
    case 'snapshot':
      return page(auth, 'snapshot', {
        interactiveOnly: params.interactiveOnly === true,
        viewportOnly: params.viewportOnly === true,
      });
    case 'extract':
      return page(auth, 'extract', { maxChars: params.maxChars, offset: params.offset });
    case 'click':
      return click(auth, params);
    case 'fill':
      return page(auth, 'fill', { ref: params.ref, text: params.text, append: params.append === true });
    case 'scroll':
      return page(auth, 'scroll', { direction: params.direction, amount: params.amount, ref: params.ref });
    case 'navigate':
      return navigate(auth, tab, params);
    case 'screenshot':
      return screenshot(auth);
    case 'wait_for': {
      const timeoutMs = Math.min(Number(params.timeoutMs) || 5000, 30000);
      return page(auth, 'wait', { text: params.text, ref: params.ref, gone: params.gone === true, timeoutMs }, timeoutMs + 5000);
    }
    default:
      throw new CommandError('UNSUPPORTED_ACTION', `Unsupported action "${action}".`);
  }
}

/** Asks the user, in the extension popup, to allow one submission. */
function askUser(label: string): Promise<ConfirmAnswer> {
  return new Promise<ConfirmAnswer>((resolve) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => finish('timeout'), CONFIRM_TIMEOUT_MS);
    const finish = (answer: ConfirmAnswer): void => {
      if (pendingConfirm?.id !== id) return;
      clearTimeout(timer);
      pendingConfirm = null;
      refreshBadge();
      resolve(answer);
    };
    pendingConfirm = { id, label, finish };
    refreshBadge();
    // Best effort: bring the popup up so the request is seen. The "?" badge is the fallback.
    try {
      void chrome.action.openPopup().catch(() => undefined);
    } catch {
      // not available in this Chrome build or no focused window
    }
  });
}

async function click(auth: Authorization, params: Record<string, unknown>): Promise<object> {
  const intent = params.intent === 'submit' ? 'submit' : 'interact';
  const ref = Number(params.ref);
  const target = await page<ClickTarget>(auth, 'describe', { ref });
  const kind = checkClick(auth.access, intent, target);

  if (kind === 'submit' && config.confirmSubmissions) {
    const answer = await askUser(target.label);
    if (answer === 'deny') {
      throw new CommandError('SUBMIT_DENIED', 'The user declined this submission. Nothing was clicked.');
    }
    // Access may have been paused, revoked or changed while the question was open.
    const now = await gate('click');
    if (now.auth.tabId !== auth.tabId || now.auth.origin !== auth.origin || now.auth.access !== 'write') {
      throw new CommandError('WRITE_NOT_AUTHORIZED', 'Authorization changed while waiting for confirmation. Nothing was clicked.');
    }
    if (answer !== 'allow') {
      throw new CommandError('SUBMIT_NOT_CONFIRMED',
        'The user did not confirm the submission within 60 seconds. Nothing was clicked. Ask them to confirm in the Browser Context MCP popup before trying again.');
    }
  }

  const before = (await getTab(auth.tabId))?.url;
  const result = await page<{ dispatched: true; note?: string }>(auth, 'click', { ref });

  // The click may have started a navigation; find out where the tab ended up.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const tab = await waitWhileLoading(auth.tabId, 10000);
  if (originOf(tab?.url) !== auth.origin) {
    revoke('Left authorized site: access revoked');
    return {
      ...result,
      leftAuthorizedOrigin: true,
      note: 'The click took the tab outside the authorized origin. Agent access has been revoked; the user must authorize again.',
    };
  }
  return { ...result, navigated: tab?.url !== before, url: tab?.url, title: tab?.title };
}

/** Resolves once the tab finished a load, or right away for same-document navigations. */
function trackLoad(tabId: number, timeoutMs: number): Promise<'complete' | 'timeout'> {
  return new Promise((resolve) => {
    let sawLoading = false;
    const done = (outcome: 'complete' | 'timeout'): void => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      clearTimeout(idle);
      resolve(outcome);
    };
    const listener = (id: number, info: { status?: string }): void => {
      if (id !== tabId) return;
      if (info.status === 'loading') sawLoading = true;
      if (info.status === 'complete' && sawLoading) done('complete');
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    const idle = setTimeout(() => { if (!sawLoading) done('complete'); }, 1500);
  });
}

async function navigate(auth: Authorization, tab: chrome.tabs.Tab, params: Record<string, unknown>): Promise<object> {
  const url = resolveNavigation(String(params.url ?? ''), tab.url as string, auth.origin);
  const loaded = trackLoad(auth.tabId, 20000);
  await chrome.tabs.update(auth.tabId, { url });
  const outcome = await loaded;
  const after = await getTab(auth.tabId);
  // A redirect can leave the origin even though the requested URL was inside it.
  if (originOf(after?.url) !== auth.origin) {
    revoke('Left authorized site: access revoked');
    throw new CommandError('ORIGIN_MISMATCH',
      'The site redirected the navigation outside the authorized origin. Agent access has been revoked; the user must authorize again.');
  }
  return {
    url: after?.url,
    title: after?.title,
    ...(outcome === 'timeout' ? { note: 'The page is still loading.' } : {}),
  };
}

async function screenshot(auth: Authorization): Promise<object> {
  const tab = await getTab(auth.tabId);
  if (!tab?.active) {
    throw new CommandError('TAB_NOT_VISIBLE',
      'The authorized tab is not the visible tab of its window, so it cannot be captured. Ask the user to switch to it.');
  }
  let dataUrl: string;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
  } catch (e) {
    throw new CommandError('SCREENSHOT_FAILED', `Chrome could not capture the tab: ${e instanceof Error ? e.message : String(e)}`);
  }
  // captureVisibleTab captures whatever is in front. Discard the image if that changed meanwhile.
  const after = await getTab(auth.tabId);
  if (!after?.active || originOf(after.url) !== auth.origin) {
    throw new CommandError('SCREENSHOT_FAILED', 'The visible tab changed during capture, so the image was discarded.');
  }
  const comma = dataUrl.indexOf(',');
  // Tell the agent how much of the page the image covers. The image is still good without it.
  let note: string | undefined;
  try {
    note = (await page<{ text: string }>(auth, 'coverage', {}, 3000)).text;
  } catch {
    note = undefined;
  }
  return { data: dataUrl.slice(comma + 1), mimeType: 'image/jpeg', url: after.url, ...(note ? { note } : {}) };
}

async function handleCommand(ws: WebSocket, msg: { id: string; action: string; params?: unknown }): Promise<void> {
  await ready;
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
  const labels = activityLabel(msg.action, typeof params.intent === 'string' ? params.intent : undefined);
  const entry = msg.action === 'status' ? null : beginActivity(labels.running);
  let response: object;
  try {
    const result = await runCommand(msg.action, params);
    if (entry) endActivity(entry, 'ok', labels.done);
    response = { id: msg.id, success: true, result };
  } catch (e) {
    const error = e instanceof CommandError
      ? e
      : new CommandError('EXTENSION_ERROR', e instanceof Error ? e.message : String(e));
    if (entry) endActivity(entry, 'error', labels.running, failureNote(error.code));
    response = { id: msg.id, success: false, error: { code: error.code, message: error.message } };
  }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(response));
}

// ---------------------------------------------------------------- WebSocket to the Java server

function pushState(): void {
  saveSession();
  refreshBadge();
  const ws = socket;
  if (!ws || !authenticated || ws.readyState !== WebSocket.OPEN) return;
  void statusResult().then((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'event', event: 'state', data }));
  });
}

function scheduleReconnect(): void {
  clearTimeout(reconnectTimer);
  // A wrong token will not fix itself: wait for the user to pair again.
  if (connection === 'pairing_failed' || connection === 'unpaired') return;
  reconnectTimer = setTimeout(() => void connect(), reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15000);
}

function dropSocket(): void {
  clearInterval(keepalive);
  const ws = socket;
  socket = null;
  authenticated = false;
  pendingConfirm?.finish('cancelled');
  if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
}

async function connect(): Promise<void> {
  await ready;
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  if (!config.token) {
    connection = 'unpaired';
    return;
  }
  connection = 'connecting';
  const ws = new WebSocket(`ws://127.0.0.1:${config.port}`);
  socket = ws;
  authenticated = false;
  const token = config.token;
  const clientNonce = randomNonce();
  let serverNonce = '';
  let handshake: Promise<void> = Promise.resolve();

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string' || event.data.length > MAX_INBOUND_CHARS) {
      ws.close(1009, 'Message too large');
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      ws.close(1008, 'Invalid JSON');
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (socket === ws && authenticated) {
      if (typeof msg.id === 'string' && typeof msg.action === 'string') {
        const command = msg as unknown as { id: string; action: string; params?: unknown };
        // One command at a time, in arrival order.
        queue = queue.then(() => handleCommand(ws, command)).catch(() => undefined);
      }
      return;
    }

    // Not paired yet: only the challenge-response is accepted. The server must prove it knows
    // the token too, so a stray local process on this port cannot drive the browser.
    handshake = handshake.then(async () => {
      if (msg.type === 'challenge' && typeof msg.nonce === 'string' && !serverNonce) {
        serverNonce = msg.nonce;
        ws.send(JSON.stringify({ type: 'auth', nonce: clientNonce, proof: await clientProof(token, serverNonce, clientNonce) }));
      } else if (msg.type === 'auth_ok' && serverNonce
          && safeEqual(String(msg.proof ?? ''), await serverProof(token, serverNonce, clientNonce))) {
        if (socket !== ws) return;
        authenticated = true;
        connection = 'connected';
        reconnectDelay = 1000;
        clearInterval(keepalive);
        // Regular traffic also keeps the MV3 service worker alive while connected.
        keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
        }, 20000);
        pushState();
      } else {
        connection = 'pairing_failed';
        ws.close(4401, 'Pairing failed');
      }
    });
  };

  ws.onclose = (event) => {
    if (socket !== ws) return;
    const failed = event.code === 4401 || connection === 'pairing_failed';
    dropSocket();
    connection = failed ? 'pairing_failed' : 'disconnected';
    scheduleReconnect();
  };
  ws.onerror = () => undefined;
}

// ---------------------------------------------------------------- popup

interface PopupMessage {
  type: string;
  tabId?: number;
  access?: Access;
  token?: string;
  port?: number;
  value?: boolean;
  id?: string;
  allow?: boolean;
}

function popupState(): object {
  return {
    connection,
    port: config.port,
    hasToken: !!config.token,
    confirmSubmissions: config.confirmSubmissions,
    auth: session.auth,
    paused: session.paused,
    activity: session.activity,
    pendingConfirm: pendingConfirm ? { id: pendingConfirm.id, label: pendingConfirm.label } : null,
  };
}

async function handlePopup(msg: PopupMessage): Promise<void> {
  await ready;
  switch (msg.type) {
    case 'getState':
      // A failed pairing is not retried until the user saves a token again.
      if (connection === 'disconnected') void connect();
      return;
    case 'pair': {
      const token = (msg.token ?? '').trim();
      const port = Number(msg.port);
      if (token.length < 32) throw new Error('That does not look like a pairing token.');
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
      config.token = token;
      config.port = port;
      await chrome.storage.local.set({ token, port });
      dropSocket();
      connection = 'disconnected';
      reconnectDelay = 1000;
      await connect();
      return;
    }
    case 'authorize':
      await authorize(Number(msg.tabId), msg.access === 'write' ? 'write' : 'read');
      return;
    case 'setAccess':
      if (session.auth) {
        session.auth.access = msg.access === 'write' ? 'write' : 'read';
        if (session.auth.access === 'read') pendingConfirm?.finish('cancelled');
        noteActivity(session.auth.access === 'write' ? 'Access changed to read / write' : 'Access changed to read only');
        pushState();
      }
      return;
    case 'setConfirm':
      config.confirmSubmissions = msg.value !== false;
      await chrome.storage.local.set({ confirmSubmissions: config.confirmSubmissions });
      pushState();
      return;
    case 'pause':
      if (session.auth && !session.paused) {
        session.paused = true;
        pendingConfirm?.finish('cancelled');
        noteActivity('Paused by you');
        pushState();
      }
      return;
    case 'resume':
      if (session.auth && session.paused) {
        session.paused = false;
        noteActivity('Resumed by you');
        pushState();
      }
      return;
    case 'revoke':
      revoke('Access revoked by you');
      return;
    case 'confirm':
      if (pendingConfirm && pendingConfirm.id === msg.id) pendingConfirm.finish(msg.allow === true ? 'allow' : 'deny');
      return;
    default:
      throw new Error('Unknown request.');
  }
}

chrome.runtime.onMessage.addListener((msg: PopupMessage, sender, sendResponse) => {
  // Only this extension's own popup page may change authorization. Content scripts run inside
  // web pages and are never trusted with that.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return false;
  handlePopup(msg).then(
    () => sendResponse({ ok: true, state: popupState() }),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e), state: popupState() }));
  return true;
});

// ---------------------------------------------------------------- lifecycle

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect' && connection !== 'pairing_failed') void connect();
});
chrome.runtime.onInstalled.addListener(() => void connect());
chrome.runtime.onStartup.addListener(() => void connect());
void chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
void connect();
