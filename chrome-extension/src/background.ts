// Background service worker: connects to every local Java server (one per agent), binds each
// authorized tab to one agent as a session, enforces authorization before every command, and
// keeps the short-lived activity feed.
//
// It never touches cookies, headers, storage of the page, the debugger or the network of the site,
// and it has no way to run agent-supplied code: commands map to a fixed set of operations.

import { clientProof, randomNonce, safeEqual, serverProof } from './pairing.ts';
import {
  ALLOW_LASTS_MS, CommandError, RateLimiter, RecentIds, activityLabel, canUse, checkAsk, checkClick, checkGate, askModeOf, checkKey, failureNote, highImpactWord, inScope,
  needsAsking, noteAnswer, notePassed, rememberAllow, remembersAllow, standingAllows, standingRefusals,
  judgeSubmission, originOf, parseKey, requireMode, resolveNavigation, resolveSession,
  type AllowMemory, type AskMemory, type AskMode, type ClickTarget, type KeyTarget, type Mode, type SessionAuth, type SubmitHow, type SubmitSignals, type SubmitVerdict,
} from './policy.ts';
import {
  CLOSE_UNAUTHORIZED, CLOSE_USER_DISCONNECTED, CLOSE_VERSION, PROTOCOL_VERSION, parseServerMessage,
  type CommandMessage,
} from './protocol.ts';
import type { SubmitBaseline } from './submit.ts';

const DEFAULT_PORT = 47821;
/** Servers take the first free port of this many, counting up from the configured one. */
const PORT_RANGE = 8;
const MAX_INBOUND_CHARS = 1_000_000;
const CONFIRM_TIMEOUT_MS = 60_000;
const ACTIVITY_KEPT = 6;
const DIAGNOSTICS_KEPT = 50;
const SUBMISSIONS_KEPT = 20;
/** An identical submission within this window is refused unless explicitly repeated. */
const DUPLICATE_WINDOW_MS = 120_000;
const VERIFY_WINDOW_MS = 6000;
const COMMANDS_PER_SECOND = 20;
const COMMAND_BURST = 40;
const REF_RANGE_SIZE = 100_000;

interface Config {
  token: string;
  port: number;
  /** When the user is asked about a submission, unless a session has its own setting. */
  ask: AskMode;
  indicator: boolean;
}

type SubmissionState = 'PREPARED' | 'FILLED' | 'SUBMITTING' | 'VERIFYING' | 'CONFIRMED' | 'FAILED' | 'UNCERTAIN';

interface SubmissionRecord {
  id: string;
  /** Fingerprint of the submitted content, for recognising an identical repeat. */
  digest: string | null;
  state: SubmissionState;
  verified: SubmitVerdict['verified'];
  evidence: string[];
  time: number;
}

/** One authorized tab bound to one agent. Lives in chrome.storage.session. */
interface SessionRecord extends SessionAuth {
  /** Highest element ref handed out so far; new documents continue after it. */
  refHigh: number;
  /** Which block of ref numbers this session draws from. Live sessions never share one. */
  refRange: number;
  /** Identity of the document last seen in the tab; refs do not survive a change. */
  documentId: string | null;
  generation: number;
  submissions: SubmissionRecord[];
  /** What the user answered to this session's requests lately, so that a no stands for a while. */
  asks?: AskMemory;
  /** When the user is asked, for this session only. Unset: as the general setting says. */
  ask?: AskMode;
}

interface ActivityEntry {
  id: number;
  session: string | null;
  label: string;
  status: 'running' | 'ok' | 'error' | 'info';
  note?: string;
  time: number;
}

interface Persisted {
  sessions: SessionRecord[];
  sessionSeq: number;
  activity: ActivityEntry[];
  activitySeq: number;
  /** Agents the user disconnected; they are refused until allowed again. */
  blockedClients: string[];
  /** Highest ref ever used in each block, so a number is never handed out twice in a browser run. */
  refRanges: number[];
  /** Recent operations: ids, types, durations and error codes only. */
  diagnostics: { client?: string; session: string | null; action: string; ms: number; code: string }[];
}

/** One authenticated server connection, i.e. one agent. */
interface Client {
  port: number;
  ws: WebSocket;
  clientId: string;
  name: string;
  authenticated: boolean;
  keepalive?: ReturnType<typeof setInterval>;
  limiter: RateLimiter;
  seen: RecentIds;
}

type ConfirmAnswer = 'allow' | 'deny' | 'timeout' | 'cancelled';
/**
 * How a submission that the user is asked about would be made: by a click on a control, by Enter
 * in a field of a form, which submits the form, or by Enter in another text box, which may send
 * what is written there.
 */
type ConfirmHow = SubmitHow;

/** A command in flight, with what is needed to stop it at a safe point. */
interface Operation {
  key: string;
  client: Client;
  commandId: string;
  sessionId: string;
  action: string;
  /** Reason once cancelled; checked before every step that has not reached the page yet. */
  cancelled: string | null;
  finishConfirm?: (answer: ConfirmAnswer) => void;
  /** Set while the page is waiting on behalf of this operation. */
  waitingInPage?: boolean;
}

let config: Config = { token: '', port: DEFAULT_PORT, ask: 'always', indicator: true };

/**
 * What the user allowed lately, by session, for the automatic mode. Kept here and nowhere else:
 * it does not outlast the worker, and is not written to storage.
 */
const allows = new Map<string, AllowMemory>();

/** Forgets what was allowed in a session: nothing passes unasked there until the user allows it anew. */
function forgetAllows(sessionId: string): void {
  allows.delete(sessionId);
}
let persisted: Persisted = { sessions: [], sessionSeq: 0, activity: [], activitySeq: 0, blockedClients: [], refRanges: [], diagnostics: [] };
const clients = new Map<number, Client>();
const operations = new Map<string, Operation>();
const queues = new Map<string, Promise<void>>();
/** The settings for asking, in the words the activity list uses. */
const ASK_LABELS: Record<AskMode, string> = { always: 'every time', auto: 'automatic', never: 'never' };

/** What the user is told about a request: what it is, why it counts as high-impact, where, and what it would send. */
interface ConfirmFacts {
  label: string;
  how: ConfirmHow;
  /** The word in the name that makes it high-impact, or null. */
  word: string | null;
  /** The website the tab is on. */
  origin: string | null;
  /** The beginning of what would be sent, by field. */
  preview: { field: string; text: string }[];
  /** The minutes an Allow would stand for this control (automatic mode), or null when it is for this once. */
  lasts: number | null;
}

const pendingConfirms = new Map<string, ConfirmFacts & { id: string; session: string; finish: (a: ConfirmAnswer) => void }>();
const newTabs = new Map<number, number>();
const indicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();
let pairingFailed = false;
let versionMismatch = false;
let lastScan = 0;

const ready: Promise<void> = (async () => {
  try {
    // Keep the pairing token out of reach of content scripts.
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Older Chrome: content scripts here never read storage anyway.
  }
  const stored = await chrome.storage.local.get(['token', 'port', 'ask', 'confirmSubmissions', 'indicator']);
  config = {
    token: typeof stored.token === 'string' ? stored.token : '',
    port: typeof stored.port === 'number' ? stored.port : DEFAULT_PORT,
    // Before there were three settings there were two: asking, or not.
    ask: stored.ask !== undefined ? askModeOf(stored.ask) : stored.confirmSubmissions === false ? 'never' : 'always',
    indicator: stored.indicator !== false,
  };
  const saved = (await chrome.storage.session.get('state')).state as Persisted | undefined;
  if (saved) {
    // Tolerate state written by an earlier version of this extension in the same browser run.
    persisted = { ...persisted, ...saved };
    persisted.sessions.forEach((s, i) => {
      s.refRange ??= i;
      s.origins ??= [s.origin];
      s.suspended ??= false;
    });
    // Anything still "running" or mid-submission belonged to a worker that no longer exists.
    persisted.activity = persisted.activity.filter((a) => a.status !== 'running');
    for (const session of persisted.sessions) {
      for (const sub of session.submissions) {
        if (sub.state === 'SUBMITTING' || sub.state === 'VERIFYING') {
          sub.state = 'UNCERTAIN';
          sub.evidence = ['the extension restarted before the outcome could be observed'];
        }
      }
      session.submissions = session.submissions.filter((s) => s.state !== 'PREPARED' && s.state !== 'FILLED');
    }
  }
  refreshBadge();
})();

function save(): void {
  void chrome.storage.session.set({ state: persisted });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function sessionById(id: string): SessionRecord | undefined {
  return persisted.sessions.find((s) => s.id === id);
}

function connectedClientIds(): Set<string> {
  return new Set([...clients.values()].filter((c) => c.authenticated).map((c) => c.clientId));
}

// ---------------------------------------------------------------- activity feed and badge

function beginActivity(session: string | null, label: string): ActivityEntry {
  const entry: ActivityEntry = { id: ++persisted.activitySeq, session, label, status: 'running', time: Date.now() };
  pushActivity(entry);
  return entry;
}

function endActivity(entry: ActivityEntry, status: 'ok' | 'error', label: string, note?: string): void {
  entry.status = status;
  entry.label = label;
  entry.note = note;
  entry.time = Date.now();
  save();
  refreshBadge();
}

/** Records something that is not a command, e.g. an authorization change. */
function noteActivity(session: string | null, label: string): void {
  pushActivity({ id: ++persisted.activitySeq, session, label, status: 'info', time: Date.now() });
}

function pushActivity(entry: ActivityEntry): void {
  persisted.activity.push(entry);
  // Running entries plus the most recent finished ones.
  const finished = persisted.activity.filter((a) => a.status !== 'running').slice(-ACTIVITY_KEPT);
  const running = persisted.activity.filter((a) => a.status === 'running');
  persisted.activity = finished.concat(running);
  save();
  refreshBadge();
}

function refreshBadge(): void {
  const running = persisted.activity.some((a) => a.status === 'running');
  const active = persisted.sessions.filter((s) => !s.paused && !s.suspended).length;
  const paused = persisted.sessions.some((s) => s.paused && !s.suspended);
  let text = '';
  let color = '#5f6368';
  if (pendingConfirms.size) {
    text = '?';
    color = '#d97706';
  } else if (running) {
    text = 'RUN';
    color = '#2563eb';
  } else if (!active && paused) {
    text = 'II';
  } else if (active) {
    text = 'ON';
    color = '#15803d';
  }
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
}

/** Shows or hides the in-page indicator. Best effort: it never injects and never blocks a command. */
function setIndicator(session: SessionRecord, text: string | null): Promise<void> {
  clearTimeout(indicatorTimers.get(session.id));
  indicatorTimers.delete(session.id);
  if (text && !config.indicator) return Promise.resolve();
  return chrome.tabs.sendMessage(session.tabId, { bcmcp: 1, op: 'indicator', origins: session.origins, text }, { frameId: 0 })
    .then(() => undefined, () => undefined);
}

function hideIndicatorSoon(session: SessionRecord): void {
  clearTimeout(indicatorTimers.get(session.id));
  indicatorTimers.set(session.id, setTimeout(() => void setIndicator(session, null), 2500));
}

// ---------------------------------------------------------------- sessions and authorization

async function getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

async function authorize(tabId: number, mode: Mode, clientId: string | null, minutes: number | null): Promise<void> {
  const tab = await getTab(tabId);
  const origin = originOf(tab?.url);
  if (!origin) {
    throw new Error('This page cannot be authorized. Open an http(s) website, then click the extension icon on that tab.');
  }
  const owner = clientId ? [...clients.values()].find((c) => c.authenticated && c.clientId === clientId) : undefined;
  if (clientId && !owner) throw new Error('That agent is no longer connected.');
  // One authorization per tab: a new one replaces the old.
  const existing = persisted.sessions.find((s) => s.tabId === tabId);
  if (existing) endSession(existing, 'Replaced by a new authorization');
  // Each live session numbers its refs in its own block, so a ref from one tab never resolves in
  // another; a block is taken up again where it left off, so numbers stay small and never repeat.
  let refRange = 0;
  while (persisted.sessions.some((s) => s.refRange === refRange)) refRange++;
  const session: SessionRecord = {
    id: `s${++persisted.sessionSeq}`,
    authorizationId: crypto.randomUUID(),
    tabId,
    origin,
    origins: [origin],
    mode,
    paused: false,
    suspended: false,
    clientId: owner ? owner.clientId : null,
    clientName: owner ? owner.name : null,
    expiresAt: minutes ? Date.now() + minutes * 60_000 : null,
    refHigh: Math.max(persisted.refRanges[refRange] ?? 0, refRange * REF_RANGE_SIZE),
    refRange,
    documentId: null,
    generation: 0,
    submissions: [],
  };
  persisted.sessions.push(session);
  noteActivity(session.id, `Site authorized (${modeLabel(mode)})`);
  pushState();
}

function modeLabel(mode: Mode): string {
  return mode === 'write' ? 'read / write' : mode === 'explore' ? 'explore' : 'read only';
}

function cancelOperations(match: (op: Operation) => boolean, reason: string): void {
  for (const op of operations.values()) {
    if (!match(op) || op.cancelled) continue;
    op.cancelled = reason;
    op.finishConfirm?.('cancelled');
    const session = sessionById(op.sessionId);
    if (op.waitingInPage && session) {
      void chrome.tabs.sendMessage(session.tabId, { bcmcp: 1, op: 'cancel', origins: session.origins, opId: op.key }, { frameId: 0 })
        .catch(() => undefined);
    }
  }
}

/** Ends a session: its operations stop, its refs die, and the agent is told why on its next call. */
function endSession(session: SessionRecord, reason: string): void {
  if (!persisted.sessions.includes(session)) return;
  cancelOperations((op) => op.sessionId === session.id, 'The session ended.');
  void setIndicator(session, null);
  persisted.sessions = persisted.sessions.filter((s) => s !== session);
  forgetAllows(session.id);
  noteActivity(session.id, reason);
  pushState();
}

/**
 * The tab left the sites authorized for the session. Nothing of it is accessible any more, but
 * the session itself (owner, access level, history) is kept until the user resumes it on that
 * tab, so a detour through a login page does not mean starting over.
 */
function suspendSession(session: SessionRecord): void {
  if (!persisted.sessions.includes(session) || session.suspended) return;
  cancelOperations((op) => op.sessionId === session.id, 'The tab left the authorized sites.');
  void setIndicator(session, null);
  session.suspended = true;
  session.documentId = null;
  forgetAllows(session.id);
  noteActivity(session.id, 'Left authorized site: session suspended');
  pushState();
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(() => {
    const session = persisted.sessions.find((s) => s.tabId === tabId);
    if (session) endSession(session, 'Tab closed: access revoked');
  });
});

// Any navigation of an authorized tab: if it is no longer on an authorized origin, access stops
// immediately. tab.url is only visible while Chrome still grants this extension the tab, so an
// unknown URL also stops access (fail closed).
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  void ready.then(() => {
    const session = persisted.sessions.find((s) => s.tabId === tabId);
    if (!session) return;
    if (info.url === undefined && info.status === undefined) return;
    if (!session.suspended && !inScope(session.origins, tab.url)) suspendSession(session);
  });
});

// Tabs opened from an authorized tab are noticed, never followed: a new tab is outside the session.
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId !== undefined) newTabs.set(tab.openerTabId, Date.now());
});

// The user being active in the browser is a good moment to look for a server that has just
// been started, without waiting for the next alarm.
chrome.tabs.onActivated.addListener(() => scan(false, 10000));

// ---------------------------------------------------------------- talking to the page

interface PageReply {
  ok: boolean;
  result?: unknown;
  highestRef?: number;
  docId?: string;
  generation?: number;
  url?: string;
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
    await sleep(150);
    tab = await getTab(tabId);
  }
  return tab;
}

function noteDocument(session: SessionRecord, reply: PageReply | undefined): void {
  if (!reply) return;
  if (typeof reply.highestRef === 'number' && reply.highestRef > session.refHigh) {
    session.refHigh = reply.highestRef;
    persisted.refRanges[session.refRange] = reply.highestRef;
  }
  if (typeof reply.docId === 'string' && reply.docId !== session.documentId) session.documentId = reply.docId;
  if (typeof reply.generation === 'number') session.generation = reply.generation;
}

/** Makes sure our content script is present in the tab's current document. Safe to repeat. */
async function ensureContentScript(session: SessionRecord): Promise<void> {
  const ping = { bcmcp: 1, op: 'ping', origins: session.origins, refBase: session.refHigh };
  let reply: PageReply | undefined;
  try {
    reply = await sendToPage(session.tabId, ping, 3000);
  } catch (e) {
    if (e instanceof CommandError) throw e;
    // No receiver: this document has no content script yet.
  }
  if (!reply) {
    try {
      await withTimeout(
        chrome.scripting.executeScript({ target: { tabId: session.tabId }, files: ['content.js'] }),
        8000, () => new Error('injection timed out'));
      reply = await sendToPage(session.tabId, ping, 3000);
    } catch (e) {
      if (e instanceof CommandError) throw e;
      throw new CommandError('PAGE_UNAVAILABLE',
        'The extension cannot access this page. Browser pages, the Chrome Web Store and error pages are off limits; otherwise ask the user to click the extension icon on the tab and authorize it again.');
    }
  }
  if (!reply?.ok) throw pageError(session, reply);
  noteDocument(session, reply);
}

function pageError(session: SessionRecord, reply: PageReply | undefined): CommandError {
  if (reply?.code === 'ORIGIN_MISMATCH') suspendSession(session);
  return new CommandError(reply?.code ?? 'PAGE_ERROR', reply?.message ?? 'The page did not answer.');
}

function checkpoint(op: Operation): void {
  if (op.cancelled) throw new CommandError('CANCELLED', `${op.cancelled} Nothing further was done.`);
}

/**
 * Runs exactly one operation in the page. Never re-sends it. `pastSafePoint` is for steps that
 * follow something already dispatched and therefore must not be skipped by a cancellation.
 */
async function page<T>(
  op: Operation, session: SessionRecord, name: string, params: object, timeoutMs = 15000, pastSafePoint = false,
): Promise<T> {
  if (!pastSafePoint) checkpoint(op);
  await waitWhileLoading(session.tabId, 10000);
  await ensureContentScript(session);
  if (!pastSafePoint) checkpoint(op);
  let reply: PageReply;
  try {
    reply = await sendToPage(session.tabId,
      { bcmcp: 1, op: name, origins: session.origins, refBase: session.refHigh, opId: op.key, ...params }, timeoutMs);
  } catch (e) {
    if (e instanceof CommandError) throw e;
    throw new CommandError('PAGE_NAVIGATED',
      'The page navigated or reloaded before the operation finished. The outcome is unknown; take a new snapshot.');
  }
  noteDocument(session, reply);
  save();
  if (!reply?.ok) throw pageError(session, reply);
  return reply.result as T;
}

// ---------------------------------------------------------------- commands

function summarize(session: SessionRecord, client: Client, tab: chrome.tabs.Tab | undefined): object {
  return {
    session: session.id,
    clientId: session.clientId ?? '',
    authorizationId: session.authorizationId,
    origin: session.origin,
    origins: session.origins,
    suspended: session.suspended,
    tabId: session.tabId,
    frameId: 0,
    documentId: session.documentId ?? '',
    mode: session.mode,
    generation: session.generation,
    state: session.suspended ? 'suspended' : session.paused ? 'paused' : 'active',
    paused: session.paused,
    // For agents: when the user is asked before a submission in this session. It may differ from the general setting.
    confirmation: session.ask ?? config.ask,
    owner: session.clientId === client.clientId ? 'you' : 'unclaimed',
    expiresAt: session.expiresAt,
    tab: tab ? { title: tab.title ?? '', url: tab.url ?? '' } : null,
  };
}

async function sessionsFor(client: Client): Promise<object[]> {
  const identity = { id: client.clientId, name: client.name };
  const connected = connectedClientIds();
  const mine = persisted.sessions.filter((s) => canUse(s, identity, connected));
  return Promise.all(mine.map(async (s) => summarize(s, client, await getTab(s.tabId))));
}

async function statusResult(client: Client, diagnostics: boolean): Promise<object> {
  return {
    client: { id: client.clientId, name: client.name, port: client.port },
    // For agents: whether a submission is put to the user. The general setting; a session may differ.
    confirmSubmissions: config.ask !== 'never',
    confirmation: config.ask,
    sessions: await sessionsFor(client),
    // Only this agent's own operations: what another agent did in its tabs is not this one's to see.
    ...(diagnostics
      ? { diagnostics: persisted.diagnostics.filter((d) => d.client === client.clientId).slice(-20).map(({ client: _, ...rest }) => rest) }
      : {}),
  };
}

/** Throws unless the command may run right now. Re-reads the session and the tab's URL every time. */
async function gate(op: Operation, action: string): Promise<{ session: SessionRecord; tab: chrome.tabs.Tab }> {
  checkpoint(op);
  const session = sessionById(op.sessionId);
  if (!session) {
    throw new CommandError('NOT_AUTHORIZED',
      'This session has ended (revoked, expired, or the tab closed or left the site). The user must authorize the tab again.');
  }
  if (session.clientId !== op.client.clientId) {
    throw new CommandError('SESSION_NOT_OWNED', `Session ${session.id} now belongs to another agent.`);
  }
  const tab = await getTab(session.tabId);
  if (!tab) endSession(session, 'Tab closed: access revoked');
  try {
    checkGate(tab ? session : null, action, tab?.url);
  } catch (e) {
    if (e instanceof CommandError && e.code === 'ORIGIN_MISMATCH') suspendSession(session);
    if (e instanceof CommandError && e.code === 'AUTHORIZATION_EXPIRED') endSession(session, 'Authorization expired');
    throw e;
  }
  return { session, tab: tab as chrome.tabs.Tab };
}

async function runCommand(op: Operation, action: string, params: Record<string, unknown>): Promise<unknown> {
  const { session, tab } = await gate(op, action);
  switch (action) {
    case 'snapshot':
      return page(op, session, 'snapshot', {
        interactiveOnly: params.interactiveOnly === true,
        viewportOnly: params.viewportOnly === true,
        diff: params.diff === true,
        ref: params.ref, maxLines: params.maxLines, startLine: params.startLine,
      });
    case 'extract':
      return page(op, session, 'extract', {
        maxChars: params.maxChars, offset: params.offset, links: params.links,
        outline: params.outline === true, mainOnly: params.mainOnly === true, ref: params.ref,
      });
    case 'click':
      return click(op, session, params);
    case 'fill':
      return page(op, session, 'fill', {
        ref: params.ref, text: params.text, append: params.append === true, method: params.method,
      });
    case 'press_key':
      return pressKey(op, session, params);
    case 'scroll':
      return page(op, session, 'scroll', { direction: params.direction, amount: params.amount, ref: params.ref });
    case 'navigate':
      return navigate(op, session, tab, params);
    case 'screenshot':
      return screenshot(op, session);
    case 'wait_for': {
      const timeoutMs = Math.min(Number(params.timeoutMs) || 5000, 30000);
      op.waitingInPage = true;
      try {
        return await page(op, session, 'wait',
          { text: params.text, ref: params.ref, condition: params.condition, timeoutMs }, timeoutMs + 5000);
      } finally {
        op.waitingInPage = false;
      }
    }
    case 'submit':
      return submit(op, session, {
        ref: Number(params.ref),
        fields: Array.isArray(params.fields)
          ? (params.fields as { ref: unknown; text: unknown }[]).map((f) => ({ ref: Number(f.ref), text: String(f.text ?? '') }))
          : [],
        expectText: typeof params.expectText === 'string' ? params.expectText : undefined,
        submissionId: typeof params.submissionId === 'string' ? params.submissionId : undefined,
        repeat: params.repeat === true,
      });
    default:
      throw new CommandError('UNSUPPORTED_ACTION', `Unsupported action "${action}".`);
  }
}

/** Asks the user, in the extension popup, to allow one submission. */
function askUser(op: Operation, facts: ConfirmFacts): Promise<ConfirmAnswer> {
  return new Promise<ConfirmAnswer>((resolve) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => finish('timeout'), CONFIRM_TIMEOUT_MS);
    const finish = (answer: ConfirmAnswer): void => {
      if (!pendingConfirms.has(id)) return;
      clearTimeout(timer);
      pendingConfirms.delete(id);
      op.finishConfirm = undefined;
      refreshBadge();
      resolve(answer);
    };
    pendingConfirms.set(id, { ...facts, id, session: op.sessionId, finish });
    op.finishConfirm = finish;
    refreshBadge();
    // Best effort: bring the popup up so the request is seen. The "?" badge is the fallback.
    try {
      void chrome.action.openPopup().catch(() => undefined);
    } catch {
      // not available in this Chrome build or no focused window
    }
  });
}

/** Puts a submission in front of the user when their setting or its impact calls for it. */
async function confirmWithUser(
  op: Operation, session: SessionRecord, label: string, how: ConfirmHow = 'click', preview: ConfirmFacts['preview'] = [],
): Promise<void> {
  const word = highImpactWord(label);
  const mode = session.ask ?? config.ask;
  const key = `${how}:${label}`;
  const origin = originOf((await getTab(session.tabId))?.url);
  if (!needsAsking(mode, word, allows.get(session.id), key, origin, Date.now())) {
    if (mode === 'auto') {
      // The user allowed this control a short while ago. It is said in the activity list, in fixed words.
      allows.set(session.id, notePassed(allows.get(session.id) as AllowMemory, Date.now()));
      noteActivity(session.id, 'Allowed automatically: you allowed it before');
    }
    return;
  }
  const nothing = how === 'click' ? 'Nothing was clicked.' : 'Nothing was pressed.';
  // Not while another request waits, not about what was just declined, not after a run of refusals.
  checkAsk(session.asks, key, pendingConfirms.size > 0, Date.now());
  // What an Allow would reach is said in the prompt, before the user answers.
  const lasting = remembersAllow(mode, word, label, origin);
  const answer = await askUser(op, { label, how, word, origin, preview, lasts: lasting ? ALLOW_LASTS_MS / 60_000 : null });
  if (answer !== 'cancelled') {
    session.asks = noteAnswer(session.asks, key, label, answer, Date.now());
    save();
  }
  if (answer === 'deny') {
    throw new CommandError('SUBMIT_DENIED', `The user declined this submission. ${nothing}`);
  }
  // Access may have been paused, revoked or changed while the question was open.
  const now = await gate(op, 'submit');
  if (now.session !== session || now.session.mode !== 'write') {
    throw new CommandError('WRITE_NOT_AUTHORIZED', `Authorization changed while waiting for confirmation. ${nothing}`);
  }
  if (answer !== 'allow') {
    throw new CommandError('SUBMIT_NOT_CONFIRMED',
      `The user did not confirm the submission within 60 seconds. ${nothing} Ask them to confirm in the TabGoblin popup before trying again.`);
  }
  // In the automatic mode what was allowed passes for a while: only if the prompt said so, and
  // only under the setting the session has now.
  if (lasting && origin !== null && remembersAllow(session.ask ?? config.ask, word, label, origin)) {
    allows.set(session.id, rememberAllow(allows.get(session.id), key, how, label, origin, Date.now()));
    pushState();
  }
}

/** Finds out what an interaction did to the tab: nothing, an in-page route change, a new document, or leaving the origin. */
async function settle(session: SessionRecord, before: { url: string | undefined; docId: string | null; at: number }): Promise<object> {
  await sleep(250);
  const tab = await waitWhileLoading(session.tabId, 10000);
  if (!inScope(session.origins, tab?.url)) {
    suspendSession(session);
    return {
      navigation: 'left-origin',
      leftAuthorizedOrigin: true,
      note: 'The tab went outside the sites authorized for this session. The session is suspended: nothing can be read until the user clicks the TabGoblin icon on that tab and resumes it.',
    };
  }
  let navigation = 'none';
  let title = tab?.title;
  let blocked = false;
  try {
    await ensureContentScript(session);
    navigation = session.documentId !== before.docId ? 'new-document' : tab?.url !== before.url ? 'same-document' : 'none';
    if (navigation === 'same-document') {
      // The address changed without a new document: the site is still swapping its content in.
      // Reading now would return the old page under the new address, so wait for it to finish.
      const quiet = await sendToPage(session.tabId, { bcmcp: 1, op: 'quiet', origins: session.origins, maxMs: 3000 }, 6000)
        .catch(() => undefined);
      const settled = quiet?.result as { title?: string } | undefined;
      title = (await getTab(session.tabId))?.title ?? settled?.title ?? title;
    }
  } catch (e) {
    navigation = 'unknown';
    blocked = e instanceof CommandError && e.code === 'PAGE_TIMEOUT';
  }
  save();
  const opened = (newTabs.get(session.tabId) ?? 0) >= before.at;
  const notes: string[] = [];
  if (blocked) {
    notes.push('The page stopped answering after this action. It may be showing a browser dialog (for example "Leave site?") that only the user can answer, or still be loading. Ask the user to look at the tab, or take a snapshot in a moment.');
  }
  if (opened) notes.push('A new tab was opened. It is not part of this session; the user can authorize it separately.');
  return {
    navigated: navigation !== 'none',
    navigation,
    url: tab?.url,
    title,
    ...(opened ? { openedNewTab: true } : {}),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}

async function click(op: Operation, session: SessionRecord, params: Record<string, unknown>): Promise<object> {
  const intent = params.intent === 'submit' ? 'submit' : 'interact';
  const ref = Number(params.ref);
  const target = await page<ClickTarget>(op, session, 'describe', { ref });
  const kind = checkClick(session.mode, intent, target);
  if (kind === 'submit') {
    return submit(op, session, { ref, fields: [], expectText: undefined, submissionId: undefined, repeat: false });
  }
  const before = { url: (await getTab(session.tabId))?.url, docId: session.documentId, at: Date.now() };
  const result = await page<{ dispatched: true; note?: string }>(op, session, 'click', { ref });
  return { ...result, ...(await settle(session, before)) };
}

async function pressKey(op: Operation, session: SessionRecord, params: Record<string, unknown>): Promise<object> {
  const { key, mode } = parseKey(String(params.key ?? ''));
  requireMode(session.mode, mode);
  const intent = params.intent === 'submit' ? 'submit' : 'interact';
  const target = await page<KeyTarget>(op, session, 'key_describe', { ref: params.ref, key });
  const verdict = checkKey(session.mode, intent, target);
  if (verdict === 'click') {
    // The key would do what a click on this control does, and that click is a submission.
    if (params.ref === undefined || params.ref === null) {
      throw new CommandError('SUBMIT_INTENT_REQUIRED',
        'The control that has the keyboard submits or changes data. Use browser_submit with its ref, which also verifies the outcome.');
    }
    return submit(op, session, { ref: Number(params.ref), fields: [], expectText: undefined, submissionId: undefined, repeat: false });
  }
  if (verdict === 'ask') {
    // Enter in a text box, declared: a submission like any other. Fingerprinted, refused as a
    // repeat, put to the user, sent once, and judged by what the page does.
    return submit(op, session, {
      ref: params.ref === undefined || params.ref === null ? null : Number(params.ref),
      fields: [], expectText: undefined, submissionId: undefined, repeat: params.repeat === true, by: 'enter',
    });
  }
  const before = { url: (await getTab(session.tabId))?.url, docId: session.documentId, at: Date.now() };
  const result = await page<object>(op, session, 'press_key', { ref: params.ref, key });
  return { ...result, key, ...(await settle(session, before)) };
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

async function navigate(op: Operation, session: SessionRecord, tab: chrome.tabs.Tab, params: Record<string, unknown>): Promise<object> {
  const history = typeof params.history === 'string' ? params.history : null;
  let requested: string | null = null;
  if (!history) requested = resolveNavigation(String(params.url ?? ''), tab.url as string, session.origins);
  checkpoint(op);
  await ensureContentScript(session);
  const before = { url: tab.url, docId: session.documentId };
  // Text typed into the page and not sent is lost when the tab moves on: the agent is told.
  const unsaved = await sendToPage(session.tabId, { bcmcp: 1, op: 'unsaved', origins: session.origins }, 3000)
    .then((reply) => Number((reply?.result as { fields?: number } | undefined)?.fields) || 0, () => 0);
  const loaded = trackLoad(session.tabId, 20000);
  if (history === 'back' || history === 'forward') {
    // Done inside the page, towards a known entry of this origin; it refuses when there is none.
    try {
      await page(op, session, 'history_go', { direction: history });
    } catch (e) {
      // The document may already be gone when the move was quick; anything else is a refusal.
      if (!(e instanceof CommandError) || e.code !== 'PAGE_NAVIGATED') throw e;
    }
  } else if (history === 'reload') {
    await chrome.tabs.reload(session.tabId);
  } else {
    await chrome.tabs.update(session.tabId, { url: requested as string });
  }
  const outcome = await loaded;
  const after = await getTab(session.tabId);
  // A redirect or a history entry can leave the origin even though the request looked fine.
  if (!inScope(session.origins, after?.url)) {
    suspendSession(session);
    if (requested && originOf(requested) !== originOf(tab.url)) {
      // An authorized site of this session, but a different one: Chrome withdraws an extension's
      // access whenever a tab changes site, and only a user click gives it back.
      return {
        navigation: 'needs-user',
        suspended: true,
        note: 'The tab moved to another site of this session. The session is suspended until the user clicks the TabGoblin icon on the tab and resumes it there.',
      };
    }
    throw new CommandError('ORIGIN_MISMATCH',
      'The navigation ended outside the sites authorized for this session (a redirect or an earlier page of another site). The session is suspended until the user resumes it from the extension icon on that tab.');
  }
  let navigation = 'unknown';
  if (outcome === 'timeout') {
    navigation = 'timeout';
  } else {
    try {
      await ensureContentScript(session);
      navigation = session.documentId !== before.docId ? 'new-document' : after?.url !== before.url ? 'same-document' : 'no-change';
    } catch {
      navigation = 'unknown';
    }
  }
  save();
  const strip = (u: string | undefined): string => (u ?? '').split('#')[0];
  const notes: string[] = [];
  if (navigation === 'timeout') notes.push('The page is still loading.');
  if (unsaved && navigation === 'new-document') {
    notes.push(`The page that was left had ${unsaved} field${unsaved === 1 ? '' : 's'} with text that was entered and not sent; it is gone.`);
  }
  return {
    navigation,
    url: after?.url,
    title: after?.title,
    ...(requested && strip(after?.url) !== strip(requested) ? { redirected: true, requestedUrl: requested } : {}),
    ...(unsaved && navigation === 'new-document' ? { discardedInput: unsaved } : {}),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}

async function screenshot(op: Operation, session: SessionRecord): Promise<object> {
  const tab = await getTab(session.tabId);
  if (!tab?.active) {
    throw new CommandError('TAB_NOT_VISIBLE',
      'The session\'s tab is not the visible tab of its window, so it cannot be captured. Ask the user to switch to it.');
  }
  await setIndicator(session, null);
  let dataUrl: string;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
  } catch (e) {
    throw new CommandError('SCREENSHOT_FAILED', `Chrome could not capture the tab: ${e instanceof Error ? e.message : String(e)}`);
  }
  // captureVisibleTab captures whatever is in front. Discard the image if that changed meanwhile.
  const after = await getTab(session.tabId);
  if (!after?.active || !inScope(session.origins, after.url)) {
    throw new CommandError('SCREENSHOT_FAILED', 'The visible tab changed during capture, so the image was discarded.');
  }
  const comma = dataUrl.indexOf(',');
  // Tell the agent how much of the page the image covers. The image is still good without it.
  let note: string | undefined;
  try {
    note = (await page<{ text: string }>(op, session, 'coverage', {}, 3000)).text;
  } catch {
    note = undefined;
  }
  return { data: dataUrl.slice(comma + 1), mimeType: 'image/jpeg', url: after.url, ...(note ? { note } : {}) };
}

/** What a key press reports when the page itself took Enter, or submitted a form on it: it may have sent something. */
const SENT_BY_ENTER = new Set(['the page handled the key itself', 'submitted the form']);

interface SubmitRequest {
  /** The control to submit with. Null: the text box that has the keyboard, by Enter. */
  ref: number | null;
  /** Set when the agent asked for Enter. Otherwise the page says how the control submits. */
  by?: 'enter';
  fields: { ref: number; text: string }[];
  expectText: string | undefined;
  submissionId: string | undefined;
  repeat: boolean;
}

function rememberSubmission(session: SessionRecord, record: SubmissionRecord): void {
  session.submissions = session.submissions.filter((s) => s.id !== record.id).concat(record).slice(-SUBMISSIONS_KEPT);
  save();
}

function forgetSubmission(session: SessionRecord, id: string): void {
  session.submissions = session.submissions.filter((s) => s.id !== id);
  save();
  // The popup shows the last submission of a session: it should not show one that never was.
  pushState();
}

/**
 * One submission, at most once: PREPARED -> FILLED -> SUBMITTING -> VERIFYING -> CONFIRMED |
 * FAILED | UNCERTAIN. Up to and including the last check before the click it can be cancelled
 * and leaves nothing behind. After the click it cannot be undone and is never repeated: its
 * outcome is observed and reported with the evidence, UNCERTAIN when nothing conclusive showed.
 */
async function submit(op: Operation, session: SessionRecord, request: SubmitRequest): Promise<object> {
  const id = request.submissionId ?? `sub-${crypto.randomUUID().slice(0, 12)}`;
  const known = session.submissions.find((s) => s.id === id);
  if (known) {
    return {
      submissionId: id, state: known.state, verified: known.verified, evidence: known.evidence, dispatched: false,
      note: 'This submission id was already handled; nothing was sent again.',
    };
  }
  const steps: SubmissionState[] = [];
  const record: SubmissionRecord = { id, digest: null, state: 'PREPARED', verified: null, evidence: [], time: Date.now() };
  const advance = (state: SubmissionState): void => {
    record.state = state;
    record.time = Date.now();
    steps.push(state);
    rememberSubmission(session, record);
  };
  const finish = (verdict: SubmitVerdict, extra: object = {}): object => {
    record.verified = verdict.verified;
    record.evidence = verdict.evidence;
    advance(verdict.state);
    void page(op, session, 'submit_done', { submissionId: id }, 3000, true).catch(() => undefined);
    noteActivity(session.id, `Submission ${verdict.state.toLowerCase()}`);
    return { submissionId: id, state: verdict.state, verified: verdict.verified, evidence: verdict.evidence, steps, ...extra };
  };

  try {
    // PREPARED: every ref resolves and the policy allows it, before anything is touched.
    const prepared = await page<{
      target: ClickTarget; digest: string | null; by: 'click' | 'enter'; how: ConfirmHow; label: string; preview?: ConfirmFacts['preview'];
    }>(
      op, session, 'submit_prepare', { ref: request.ref, fields: request.fields, submissionId: id, by: request.by });
    const target = prepared.target;
    // A text box is submitted by Enter in it, anything else by a click on it.
    const byEnter = prepared.by === 'enter';
    if (byEnter) requireMode(session.mode, 'write');
    else checkClick(session.mode, 'submit', target);
    const repeatOf = prepared.digest === null ? undefined : session.submissions.find((s) =>
      s.id !== id && s.digest === prepared.digest && Date.now() - s.time < DUPLICATE_WINDOW_MS
      && (s.state === 'CONFIRMED' || s.state === 'UNCERTAIN' || s.state === 'SUBMITTING' || s.state === 'VERIFYING'));
    if (repeatOf && !request.repeat) {
      throw new CommandError('DUPLICATE_SUBMISSION',
        `The same content was submitted here ${Math.round((Date.now() - repeatOf.time) / 1000)}s ago (${repeatOf.id}, ${repeatOf.state}). Nothing was sent or typed. Inspect the page first; pass repeat=true only if the user wants it sent again.`);
    }
    record.digest = prepared.digest;
    advance('PREPARED');
    // The user decides before a single character is entered: declining leaves the page untouched.
    await confirmWithUser(op, session, byEnter ? prepared.label : target.label, byEnter ? prepared.how : 'click', prepared.preview ?? []);

    for (const field of request.fields) {
      const filled = await page<{ valueMatches: boolean }>(op, session, 'fill',
        { ref: field.ref, text: field.text, append: false, method: 'set' });
      if (!filled.valueMatches) {
        forgetSubmission(session, id);
        throw new CommandError('FILL_REJECTED',
          `The field with ref [${field.ref}] did not keep the text, so nothing was submitted. Take a snapshot to see what the field holds.`);
      }
    }
    advance('FILLED');

    // The "before" picture, taken right before the click, plus the browser's own form validation.
    const { problems, baseline } = await page<{ problems: string[]; baseline: SubmitBaseline }>(
      op, session, 'submit_baseline', { submissionId: id, expectText: request.expectText });
    if (problems.length) {
      return finish(
        { state: 'FAILED', verified: null, evidence: problems.map((p) => `not submitted, the form rejects: ${p}`) },
        { dispatched: false });
    }
    checkpoint(op); // last point at which the submission can still be cancelled
    advance('SUBMITTING');

    const before = { url: (await getTab(session.tabId))?.url, docId: session.documentId, at: Date.now() };
    let fired: { dispatched?: boolean; note?: string; effect?: string } = {};
    try {
      fired = await page<{ dispatched: true; note?: string; effect?: string }>(
        op, session, 'submit_fire', { ref: request.ref, submissionId: id }, 15000, true);
    } catch (e) {
      const code = e instanceof CommandError ? e.code : '';
      if (code === 'STALE_REF' || code === 'ELEMENT_DISABLED') {
        forgetSubmission(session, id);
        throw e; // refused inside the page before the click: nothing was dispatched
      }
      return finish({ state: 'UNCERTAIN', verified: null,
        evidence: [`the page stopped answering while the ${byEnter ? 'key was being pressed' : 'click was being dispatched'}`] },
      { dispatched: true });
    }
    if (byEnter && !SENT_BY_ENTER.has(fired.effect ?? '')) {
      // The page left the key to the browser: it started a new line, or did nothing. That is not a
      // submission, so it is not recorded as one and does not stand in the way of a later one.
      forgetSubmission(session, id);
      void page(op, session, 'submit_done', { submissionId: id }, 3000, true).catch(() => undefined);
      const settled = sessionById(session.id) ? await settle(session, before) : {};
      const notes = [fired.note, (settled as { note?: string }).note, 'Enter sent nothing here: it started a new line, or did nothing.'];
      return { dispatched: true, key: 'Enter', effect: fired.effect, submitted: false, ...settled, note: notes.filter(Boolean).join(' ') };
    }
    advance('VERIFYING');
    // The agent's own texts, to recognise them on the page afterwards even across a navigation.
    const submitted = request.fields.map((f) => f.text.trim())
      .filter((t) => t.length >= 4 && !/^(true|false|on|off|yes|no|checked|unchecked)$/i.test(t));
    const verdict = await verify(op, session, id, baseline, request.expectText, submitted);
    const where = sessionById(session.id) ? await settle(session, before) : { leftAuthorizedOrigin: true };
    if (byEnter) {
      // What Enter does is the page's own business: when nothing shows, it may only have started a new line.
      const evidence = verdict.state === 'UNCERTAIN'
        ? [...verdict.evidence, 'Enter may only have started a new line here: look at the text box before pressing it again']
        : verdict.evidence;
      return finish({ ...verdict, evidence }, { dispatched: true, key: 'Enter', effect: fired.effect, ...where });
    }
    return finish(verdict, { dispatched: true, ...(fired.note ? { clickNote: fired.note } : {}), ...where });
  } catch (e) {
    if (record.state === 'PREPARED' || record.state === 'FILLED') forgetSubmission(session, id);
    throw e;
  }
}

/** Watches the page after the click until it shows a conclusive signal or the window closes. */
async function verify(
  op: Operation, session: SessionRecord, id: string, baseline: SubmitBaseline, expectText: string | undefined,
  submitted: string[],
): Promise<SubmitVerdict> {
  const started = Date.now();
  let verdict: SubmitVerdict = { state: 'UNCERTAIN', verified: null, evidence: ['the outcome could not be observed'] };
  await sleep(300);
  for (;;) {
    const tab = await waitWhileLoading(session.tabId, 8000);
    if (!sessionById(session.id) || session.suspended || !inScope(session.origins, tab?.url)) {
      if (sessionById(session.id)) suspendSession(session);
      return { state: 'UNCERTAIN', verified: null, evidence: ['the tab left the authorized sites after submitting, so the result could not be read'] };
    }
    try {
      const signals = await page<SubmitSignals>(op, session, 'submit_observe', { submissionId: id, baseline, expectText, submitted }, 8000, true);
      verdict = judgeSubmission(signals, !!expectText);
    } catch {
      // The page may be between documents; look again until the window closes.
    }
    if (verdict.state === 'FAILED' || verdict.verified === 'content') return verdict;
    // A reaction alone is accepted only once the page had a moment to show an error instead.
    if (verdict.state === 'CONFIRMED' && Date.now() - started >= 1500) return verdict;
    if (op.cancelled) {
      return { state: 'UNCERTAIN', verified: null, evidence: [...verdict.evidence, 'verification was cancelled before a result showed'] };
    }
    if (Date.now() - started >= VERIFY_WINDOW_MS) return verdict;
    await sleep(400);
  }
}

function respond(client: Client, body: object): void {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(body));
}

function recordDiagnostic(client: string, session: string | null, action: string, ms: number, code: string): void {
  persisted.diagnostics = persisted.diagnostics.concat({ client, session, action, ms, code }).slice(-DIAGNOSTICS_KEPT);
}

async function execute(op: Operation, command: CommandMessage): Promise<void> {
  const started = Date.now();
  const params = command.params;
  const labels = activityLabel(command.action, typeof params.intent === 'string' ? params.intent : undefined);
  let entry: ActivityEntry | null = null;
  let code = 'ok';
  let response: object;
  try {
    checkpoint(op); // cancelled while it waited in the queue
    if (Date.now() > command.deadline) {
      throw new CommandError('STALE_COMMAND', 'The command waited too long behind other operations and was dropped without running.');
    }
    entry = beginActivity(op.sessionId, labels.running);
    const session = sessionById(op.sessionId);
    if (session && command.action !== 'screenshot') void setIndicator(session, `Agent: ${labels.running}`);
    const result = await runCommand(op, command.action, params);
    endActivity(entry, 'ok', labels.done);
    response = { id: command.id, success: true, result };
  } catch (e) {
    const error = e instanceof CommandError
      ? e
      : new CommandError('EXTENSION_ERROR', e instanceof Error ? e.message : String(e));
    code = error.code;
    if (entry) endActivity(entry, 'error', labels.running, failureNote(error.code));
    else noteActivity(op.sessionId, `${labels.running} blocked (${failureNote(error.code)})`);
    response = { id: command.id, success: false, error: { code: error.code, message: error.message } };
  } finally {
    operations.delete(op.key);
    const session = sessionById(op.sessionId);
    if (session) hideIndicatorSoon(session);
  }
  recordDiagnostic(op.client.clientId, op.sessionId, command.action, Date.now() - started, code);
  save();
  respond(op.client, response);
  respond(op.client, { type: 'event', event: 'activity', data: { id: command.id, session: op.sessionId, action: command.action, ms: Date.now() - started, code } });
}

/** Validates, rate-limits and routes one command to its session's queue. */
async function onCommand(client: Client, command: CommandMessage): Promise<void> {
  const refuse = (code: string, message: string): void => {
    recordDiagnostic(client.clientId, command.session ?? null, command.action, 0, code);
    respond(client, { id: command.id, success: false, error: { code, message } });
  };
  if (!client.seen.add(command.id)) {
    return refuse('DUPLICATE_COMMAND', 'A command with this id was already received on this connection; it was not run again.');
  }
  if (!client.limiter.tryTake()) {
    return refuse('RATE_LIMITED', 'Too many commands at once. Slow down and send the command again.');
  }
  if (Date.now() > command.deadline) {
    return refuse('STALE_COMMAND', 'The command arrived after its deadline and was dropped without running.');
  }
  await ready;
  if (command.action === 'status') {
    respond(client, { id: command.id, success: true, result: await statusResult(client, command.params.diagnostics === true) });
    return;
  }
  let session: SessionRecord;
  try {
    const resolved = resolveSession(persisted.sessions, { id: client.clientId, name: client.name }, command.session, connectedClientIds());
    session = resolved.session;
    if (resolved.claim) {
      session.clientId = client.clientId;
      session.clientName = client.name || null;
      noteActivity(session.id, 'Session taken up by an agent');
      pushState();
    }
  } catch (e) {
    const error = e instanceof CommandError ? e : new CommandError('EXTENSION_ERROR', String(e));
    noteActivity(command.session ?? null, `${activityLabel(command.action).running} blocked (${failureNote(error.code)})`);
    return refuse(error.code, error.message);
  }
  const op: Operation = {
    key: `${client.port}:${command.id}`, client, commandId: command.id, sessionId: session.id,
    action: command.action, cancelled: null,
  };
  operations.set(op.key, op);
  // One command at a time per tab, in arrival order; other tabs are not held up.
  const run = (): Promise<void> => execute(op, command);
  const next = (queues.get(session.id) ?? Promise.resolve()).then(run, run);
  queues.set(session.id, next);
  void next.finally(() => {
    if (queues.get(session.id) === next) queues.delete(session.id);
  });
}

// ---------------------------------------------------------------- connections to the Java servers

/** Tells every connected agent which sessions it has now. */
function pushState(): void {
  save();
  refreshBadge();
  for (const client of clients.values()) {
    if (!client.authenticated) continue;
    void sessionsFor(client).then((sessions) => respond(client, { type: 'event', event: 'sessions', data: { sessions } }));
  }
}

function dropClient(client: Client, closeCode?: number, reason?: string): void {
  clearInterval(client.keepalive);
  if (clients.get(client.port) === client) clients.delete(client.port);
  cancelOperations((op) => op.client === client, 'The agent disconnected.');
  if (client.ws.readyState <= WebSocket.OPEN) client.ws.close(closeCode, reason);
}

function connectPort(port: number): void {
  const existing = clients.get(port);
  if (existing && existing.ws.readyState <= WebSocket.OPEN) return;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const client: Client = {
    port, ws, clientId: '', name: '', authenticated: false,
    limiter: new RateLimiter(COMMANDS_PER_SECOND, COMMAND_BURST), seen: new RecentIds(),
  };
  clients.set(port, client);
  const token = config.token;
  const clientNonce = randomNonce();
  let serverNonce = '';
  let handshake: Promise<void> = Promise.resolve();

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string' || event.data.length > MAX_INBOUND_CHARS) {
      ws.close(1009, 'Message too large');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch {
      ws.close(1008, 'Invalid JSON');
      return;
    }
    const msg = parseServerMessage(raw);
    if (!msg) {
      // Before pairing nothing malformed is tolerated; afterwards an unknown message is ignored.
      if (!client.authenticated) ws.close(1008, 'Invalid message');
      return;
    }

    /** A message of a paired server. */
    const regular = (): void => {
      if (msg.type === 'command') void onCommand(client, msg.command);
      else if (msg.type === 'cancel') cancelOperations((op) => op.key === `${port}:${msg.id}`, 'The agent cancelled the command.');
      else if (msg.type === 'client') {
        client.name = msg.name;
        for (const session of persisted.sessions) {
          if (session.clientId === client.clientId) session.clientName = msg.name || null;
        }
        save();
      }
    };
    if (client.authenticated) {
      regular();
      return;
    }

    // Not paired yet: only the challenge-response is accepted. The server must prove it knows
    // the token too, so a stray local process on this port cannot drive the browser.
    // The messages take their turn one after the other, in the order they came.
    handshake = handshake.then(async () => {
      // The connection was closed or dropped while this message waited for its turn.
      if (clients.get(port) !== client || ws.readyState !== WebSocket.OPEN) return;
      // A server may send its first message right behind `auth_ok`, while its proof is still being
      // checked here. By its turn the server is paired, and this is a message like any other.
      // Before that nothing has changed: without a valid `auth_ok` it is a failed pairing.
      if (client.authenticated) {
        regular();
        return;
      }
      if (msg.type === 'challenge' && !serverNonce) {
        if (!msg.versions.includes(PROTOCOL_VERSION)) {
          versionMismatch = true;
          ws.close(CLOSE_VERSION, 'No common protocol version');
          return;
        }
        serverNonce = msg.nonce;
        ws.send(JSON.stringify({
          type: 'auth', nonce: clientNonce, version: PROTOCOL_VERSION,
          proof: await clientProof(token, serverNonce, clientNonce),
        }));
      } else if (msg.type === 'auth_ok' && serverNonce && msg.version === PROTOCOL_VERSION
          && safeEqual(msg.proof, await serverProof(token, serverNonce, clientNonce))) {
        if (clients.get(port) !== client) return;
        if (persisted.blockedClients.includes(msg.clientId)) {
          dropClient(client, CLOSE_USER_DISCONNECTED, 'Disconnected by the user');
          return;
        }
        client.clientId = msg.clientId;
        client.name = msg.clientName;
        client.authenticated = true;
        pairingFailed = false;
        versionMismatch = false;
        // Regular traffic also keeps the MV3 service worker alive while connected.
        client.keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
        }, 20000);
        pushState();
      } else {
        pairingFailed = true;
        ws.close(CLOSE_UNAUTHORIZED, 'Pairing failed');
      }
    });
  };

  ws.onclose = (event) => {
    const wasPaired = client.authenticated;
    if (event.code === CLOSE_UNAUTHORIZED) {
      pairingFailed = true;
      // The token this extension holds was refused, typically because it was rotated. Other
      // servers share it: a heartbeat makes each of them check now instead of in a while.
      for (const other of clients.values()) {
        if (other !== client && other.authenticated && other.ws.readyState === WebSocket.OPEN) other.ws.send('{"type":"ping"}');
      }
    }
    if (event.code === CLOSE_VERSION) versionMismatch = true;
    dropClient(client);
    if (wasPaired) {
      pushState();
      // The server may be restarting: look for it again shortly.
      setTimeout(() => scan(true), 1500);
    }
  };
  ws.onerror = () => undefined;
}

/**
 * Looks for servers on every port of the range that has no live connection yet. Each server takes
 * the first free port, but other software may hold ports in between, so the whole range is tried.
 * Throttled, because the popup asks for it while it is open.
 */
function scan(force: boolean, minGapMs = 2500): void {
  void ready.then(() => {
    // A wrong token will not fix itself: wait for the user to pair again.
    if (!config.token || pairingFailed) return;
    const now = Date.now();
    if (!force && now - lastScan < minGapMs) return;
    lastScan = now;
    for (let port = config.port; port < config.port + PORT_RANGE; port++) connectPort(port);
  });
}

function connectionStatus(): string {
  if (!config.token) return 'unpaired';
  // A refused token needs the user's attention even while another server is still connected.
  if (pairingFailed) return 'pairing_failed';
  if ([...clients.values()].some((c) => c.authenticated)) return 'connected';
  if (versionMismatch) return 'version_mismatch';
  return 'disconnected';
}

// ---------------------------------------------------------------- popup

interface PopupMessage {
  type: string;
  tabId?: number;
  mode?: Mode;
  session?: string;
  clientId?: string | null;
  minutes?: number | null;
  token?: string;
  port?: number;
  value?: boolean | string;
  id?: string;
  allow?: boolean;
}

function popupState(): object {
  const connected = connectedClientIds();
  return {
    connection: connectionStatus(),
    port: config.port,
    hasToken: !!config.token,
    ask: config.ask,
    indicator: config.indicator,
    clients: [...clients.values()].filter((c) => c.authenticated).map((c) => ({ id: c.clientId, name: c.name, port: c.port })),
    blockedClients: persisted.blockedClients,
    sessions: persisted.sessions.map((s) => ({
      id: s.id, tabId: s.tabId, origin: s.origin, mode: s.mode, paused: s.paused, expiresAt: s.expiresAt,
      origins: s.origins, suspended: s.suspended,
      clientId: s.clientId, clientName: s.clientName, ownerConnected: !!s.clientId && connected.has(s.clientId),
      lastSubmission: s.submissions.length ? s.submissions[s.submissions.length - 1].state : null,
      // What would not be put to the user right now, so that the popup can say so and offer to lift it.
      notAsked: standingRefusals(s.asks, Date.now()),
      // When the user is asked in this session, and what passes without a question right now.
      ask: s.ask ?? config.ask,
      passes: standingAllows(allows.get(s.id), Date.now()),
    })),
    activity: persisted.activity,
    pendingConfirm: [...pendingConfirms.values()].map((c) => ({
      id: c.id, session: c.session, label: c.label, highImpact: c.word !== null, word: c.word, how: c.how, origin: c.origin, preview: c.preview,
      lasts: c.lasts,
    }))[0] ?? null,
  };
}

function modeOf(value: unknown): Mode {
  return value === 'write' ? 'write' : value === 'explore' ? 'explore' : 'read';
}

async function handlePopup(msg: PopupMessage): Promise<void> {
  await ready;
  const session = msg.session ? sessionById(msg.session) : undefined;
  switch (msg.type) {
    case 'getState':
      scan(false);
      return;
    case 'pair': {
      const token = (msg.token ?? '').trim();
      const port = Number(msg.port);
      if (token.length < 32) throw new Error('That does not look like a pairing token.');
      if (!Number.isInteger(port) || port < 1 || port > 65535 - PORT_RANGE) throw new Error('Port must be between 1 and 65527.');
      config.token = token;
      config.port = port;
      await chrome.storage.local.set({ token, port });
      for (const client of [...clients.values()]) dropClient(client);
      pairingFailed = false;
      versionMismatch = false;
      scan(true);
      return;
    }
    case 'forget':
      config.token = '';
      await chrome.storage.local.remove('token');
      for (const client of [...clients.values()]) dropClient(client);
      pushState();
      return;
    case 'authorize':
      await authorize(Number(msg.tabId), modeOf(msg.mode), msg.clientId ?? null,
        typeof msg.minutes === 'number' && msg.minutes > 0 ? msg.minutes : null);
      return;
    case 'setMode':
      if (session) {
        session.mode = modeOf(msg.mode);
        forgetAllows(session.id);
        // Narrowing access stops anything that needed the wider one.
        if (session.mode !== 'write') cancelOperations((op) => op.sessionId === session.id, 'The user reduced the session\'s access.');
        noteActivity(session.id, `Access changed to ${modeLabel(session.mode)}`);
        pushState();
      }
      return;
    case 'askAgain':
      // The user takes a no back: this session may put its requests to them again.
      if (session) {
        session.asks = undefined;
        noteActivity(session.id, 'May ask you again');
        pushState();
      }
      return;
    case 'pause':
      if (session && !session.paused) {
        session.paused = true;
        forgetAllows(session.id);
        cancelOperations((op) => op.sessionId === session.id, 'The user paused the session.');
        noteActivity(session.id, 'Paused by you');
        pushState();
      }
      return;
    case 'resume':
      if (session && session.paused) {
        session.paused = false;
        noteActivity(session.id, 'Resumed by you');
        pushState();
      }
      return;
    case 'revoke':
      if (session) endSession(session, 'Access revoked by you');
      return;
    case 'resumeSession':
    case 'addOrigin': {
      if (!session || !session.suspended) return;
      // The tab's address is visible here only because the user just clicked the icon on that
      // tab, which is also what gives Chrome's access to it back.
      const tab = await getTab(session.tabId);
      const origin = originOf(tab?.url);
      if (!origin || msg.tabId !== session.tabId) {
        throw new Error('Click the extension icon on the session\'s own tab to resume it.');
      }
      if (!session.origins.includes(origin)) {
        if (msg.type !== 'addOrigin') throw new Error('This tab is on a site that is not part of the session.');
        session.origins.push(origin);
        noteActivity(session.id, 'Site added to the session by you');
      }
      session.suspended = false;
      noteActivity(session.id, 'Session resumed by you');
      pushState();
      return;
    }
    case 'disconnectClient': {
      const client = [...clients.values()].find((c) => c.clientId === msg.clientId);
      if (msg.clientId && !persisted.blockedClients.includes(msg.clientId)) persisted.blockedClients.push(msg.clientId);
      if (client) dropClient(client, CLOSE_USER_DISCONNECTED, 'Disconnected by the user');
      noteActivity(null, 'Agent disconnected by you');
      pushState();
      return;
    }
    case 'allowClient':
      persisted.blockedClients = persisted.blockedClients.filter((id) => id !== msg.clientId);
      save();
      scan(true);
      return;
    case 'setAsk':
      // For one session, or for all: the general setting then replaces what sessions had of their own.
      if (msg.session) {
        if (session) {
          session.ask = askModeOf(msg.value);
          forgetAllows(session.id);
          noteActivity(session.id, `Asking changed to ${ASK_LABELS[session.ask]}`);
          pushState();
        }
        return;
      }
      config.ask = askModeOf(msg.value);
      await chrome.storage.local.set({ ask: config.ask });
      for (const each of persisted.sessions) {
        each.ask = undefined;
        forgetAllows(each.id);
      }
      pushState();
      return;
    case 'forgetAllowed':
      if (session) {
        forgetAllows(session.id);
        noteActivity(session.id, 'Will ask again about everything');
        pushState();
      }
      return;
    case 'setIndicator':
      config.indicator = msg.value !== false;
      await chrome.storage.local.set({ indicator: config.indicator });
      if (!config.indicator) persisted.sessions.forEach((s) => void setIndicator(s, null));
      return;
    case 'clearActivity':
      persisted.activity = persisted.activity.filter((a) => a.status === 'running');
      save();
      return;
    case 'confirm': {
      const pending = msg.id ? pendingConfirms.get(msg.id) : undefined;
      if (pending) pending.finish(msg.allow === true ? 'allow' : 'deny');
      return;
    }
    default:
      throw new Error('Unknown request.');
  }
}

chrome.runtime.onMessage.addListener((msg: PopupMessage & { bcmcp?: unknown }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  // The in-page indicator may only pause, and only the session of the tab it sits in. A content
  // script is never trusted with anything that widens access.
  if (msg?.bcmcp === 'indicator-pause' && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    void ready.then(() => {
      const session = persisted.sessions.find((s) => s.tabId === tabId);
      if (session && !session.paused) {
        session.paused = true;
        cancelOperations((op) => op.sessionId === session.id, 'The user paused the session.');
        noteActivity(session.id, 'Paused by you');
        void setIndicator(session, 'Agent paused');
        pushState();
      }
    });
    return false;
  }
  // Everything else only from this extension's own popup page.
  if (!sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return false;
  handlePopup(msg).then(
    () => sendResponse({ ok: true, state: popupState() }),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e), state: popupState() }));
  return true;
});

// ---------------------------------------------------------------- lifecycle

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'reconnect') return;
  scan(true);
  void ready.then(() => {
    for (const session of [...persisted.sessions]) {
      if (session.expiresAt !== null && Date.now() >= session.expiresAt) endSession(session, 'Authorization expired');
    }
  });
});
chrome.runtime.onInstalled.addListener(() => scan(true));
chrome.runtime.onStartup.addListener(() => scan(true));
void chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
// While at least one agent is connected the worker is awake anyway: find further agents quickly.
setInterval(() => {
  if ([...clients.values()].some((c) => c.authenticated)) scan(false);
}, 3000);
scan(true);
