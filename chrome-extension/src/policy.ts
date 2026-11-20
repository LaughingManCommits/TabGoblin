// Authorization and safety rules. Pure functions: no chrome.* and no DOM, so every rule is unit-tested.

/** read: look at the current page. explore: also navigate, follow links, expand. write: also operate and submit. */
export type Mode = 'read' | 'explore' | 'write';
export type Intent = 'interact' | 'submit';

const RANK: Record<Mode, number> = { read: 0, explore: 1, write: 2 };

/** One authorized tab, bound to one agent. */
export interface SessionAuth {
  id: string;
  authorizationId: string;
  tabId: number;
  /** scheme + hostname + port, exactly as URL.origin reports it. Subdomains are different origins. */
  origin: string;
  /** Every origin the user authorized for this session; `origin` is the first. */
  origins: string[];
  mode: Mode;
  paused: boolean;
  /** The tab left the authorized origins: nothing is accessible until the user resumes the session. */
  suspended: boolean;
  /** Owning agent, or null until an agent claims the session. */
  clientId: string | null;
  clientName: string | null;
  /** Epoch milliseconds, or null for "until revoked". */
  expiresAt: number | null;
}

/** An error with a stable code that travels back to the agent. */
export class CommandError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const ACTIONS = [
  'status', 'snapshot', 'extract', 'click', 'fill', 'press_key', 'scroll', 'navigate', 'screenshot',
  'wait_for', 'submit',
] as const;
export type Action = (typeof ACTIONS)[number];

/** The least access an action needs before anything else is checked. */
const REQUIRED: Record<string, Mode> = {
  snapshot: 'read', extract: 'read', scroll: 'read', screenshot: 'read', wait_for: 'read',
  navigate: 'explore', click: 'explore', press_key: 'explore',
  fill: 'write', submit: 'write',
};

/** The origin of an http(s) URL, or null for anything else (chrome://, file://, about:blank, garbage). */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

function needs(mode: Mode): CommandError {
  return mode === 'write'
    ? new CommandError('WRITE_NOT_AUTHORIZED',
      'This needs Write access. Ask the user to switch the session to Read / Write in the extension popup.')
    : new CommandError('EXPLORE_NOT_AUTHORIZED',
      'This needs Explore access: with Read access the agent can only look at the current page. Ask the user to switch the session to Explore in the extension popup.');
}

/**
 * Runs before every command. `tabUrl` is the session tab's current URL as the browser reports
 * it; an unknown URL fails closed.
 */
export function checkGate(
  session: Pick<SessionAuth, 'origins' | 'mode' | 'paused' | 'expiresAt' | 'suspended'> | null,
  action: string,
  tabUrl: string | undefined,
  now: number = Date.now(),
): void {
  if (!(ACTIONS as readonly string[]).includes(action)) {
    throw new CommandError('UNSUPPORTED_ACTION', `Unsupported action "${action}".`);
  }
  if (action === 'status') return;
  if (!session) {
    throw new CommandError('NOT_AUTHORIZED',
      'No website is authorized. Ask the user to open the site, click the TabGoblin icon and authorize it.');
  }
  if (session.expiresAt !== null && now >= session.expiresAt) {
    throw new CommandError('AUTHORIZATION_EXPIRED', 'This authorization has expired. The user must authorize the tab again.');
  }
  if (session.paused) {
    throw new CommandError('PAUSED', 'The user paused this session. Ask them to resume it in the extension popup.');
  }
  if (session.suspended) {
    throw new CommandError('SESSION_SUSPENDED',
      'The tab left the sites authorized for this session, so the session is suspended and nothing can be read. Ask the user to click the TabGoblin icon on that tab and resume it.');
  }
  if (!inScope(session.origins, tabUrl)) {
    throw new CommandError('ORIGIN_MISMATCH',
      'The tab is no longer on a site authorized for this session. The session is suspended; the user must resume it from the TabGoblin icon on that tab.');
  }
  const required = REQUIRED[action];
  if (RANK[session.mode] < RANK[required]) throw needs(required);
}

/** Whether a URL lies on one of the authorized origins. Unknown or non-web URLs never do. */
export function inScope(origins: readonly string[], url: string | undefined | null): boolean {
  const origin = originOf(url);
  return origin !== null && origins.includes(origin);
}

/** Who is asking: one authenticated server connection. */
export interface ClientIdentity {
  id: string;
  name: string;
}

/** Whether an agent may use a session: its own, an unclaimed one, or one left by its former self. */
export function canUse(
  session: Pick<SessionAuth, 'clientId' | 'clientName'>,
  client: ClientIdentity,
  connectedClientIds: ReadonlySet<string>,
): boolean {
  return session.clientId === client.id
    || session.clientId === null
    || (!connectedClientIds.has(session.clientId) && !!client.name && session.clientName === client.name);
}

/** Throws unless the session's access level is at least `required`. */
export function requireMode(mode: Mode, required: Mode): void {
  if (RANK[mode] < RANK[required]) throw needs(required);
}

/**
 * Picks the session a command is for and decides whether this agent may use it.
 *
 * A session belongs to the agent that claimed it. An unclaimed session is claimed by the first
 * agent that uses it. If the owner is gone and a same-named agent appears (the IDE restarted its
 * server), ownership moves to it; a different agent never takes over someone else's session.
 */
export function resolveSession<T extends SessionAuth>(
  sessions: readonly T[],
  client: ClientIdentity,
  requested: string | undefined,
  connectedClientIds: ReadonlySet<string>,
): { session: T; claim: boolean } {
  const usable = (s: T): boolean => canUse(s, client, connectedClientIds);

  if (requested !== undefined) {
    const session = sessions.find((s) => s.id === requested);
    if (!session) {
      throw new CommandError('UNKNOWN_SESSION', `There is no session ${requested}. Call browser_status to list your sessions.`);
    }
    if (!usable(session)) {
      throw new CommandError('SESSION_NOT_OWNED',
        `Session ${requested} belongs to another agent. Only the user can hand a tab to a different agent.`);
    }
    return { session, claim: session.clientId !== client.id };
  }
  const candidates = sessions.filter(usable);
  if (candidates.length === 0) {
    throw new CommandError('NOT_AUTHORIZED',
      'No website is authorized for this agent. Ask the user to open the site, click the TabGoblin icon and authorize it.');
  }
  if (candidates.length > 1) {
    const list = candidates.map((s) => `${s.id} (${s.origin})`).join(', ');
    throw new CommandError('SESSION_REQUIRED',
      `Several tabs are authorized: ${list}. Pass session=<id> so the command reaches the tab you mean.`);
  }
  return { session: candidates[0], claim: candidates[0].clientId !== client.id };
}

/**
 * Resolves an absolute or relative URL against the current page and insists the result stays on
 * the authorized origin.
 */
export function resolveNavigation(input: string, currentUrl: string, authorized: string | readonly string[]): string {
  const origins = typeof authorized === 'string' ? [authorized] : authorized;
  let target: URL;
  try {
    target = new URL(input, currentUrl);
  } catch {
    throw new CommandError('INVALID_URL', 'The URL could not be parsed.');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new CommandError('NAVIGATION_BLOCKED', `Only http(s) URLs can be opened, not ${target.protocol}`);
  }
  if (target.username || target.password) {
    throw new CommandError('NAVIGATION_BLOCKED', 'URLs with embedded credentials are not allowed.');
  }
  if (!origins.includes(target.origin)) {
    throw new CommandError('NAVIGATION_BLOCKED',
      `${target.origin} is outside the authorized origin ${origins.join(', ')}. Only the user can authorize another site.`);
  }
  return target.href;
}

/** What the content script reports about an element before it is clicked. */
export interface ClickTarget {
  /** Same-origin link or disclosure toggle: equivalent to navigating or expanding. */
  readSafe: boolean;
  /** A control that only shows or hides content: aria-expanded, tabs, details. */
  disclosure: boolean;
  /** Link whose destination is outside the page's origin. */
  externalLink: boolean;
  /** 'form': submits a form. 'likely': its label suggests it submits or changes data. */
  submit: 'form' | 'likely' | null;
  /** Short label of the control, for the user's confirmation prompt. */
  label: string;
}

/**
 * Decides whether a click may proceed. Returns 'submit' when it is a submission (which the
 * caller may additionally put in front of the user) and 'interact' otherwise.
 */
export function checkClick(mode: Mode, intent: Intent, target: ClickTarget): 'interact' | 'submit' {
  if (target.externalLink) {
    throw new CommandError('NAVIGATION_BLOCKED', 'That link leads outside the authorized origin, so it was not clicked.');
  }
  if (mode === 'read') throw needs('explore');
  if (mode === 'explore') {
    if ((target.readSafe || target.disclosure) && !target.submit && intent !== 'submit') return 'interact';
    throw new CommandError('WRITE_NOT_AUTHORIZED',
      'With Explore access only links, tabs and expand/collapse controls can be clicked. Ask the user to switch the session to Read / Write in the extension popup.');
  }
  if (intent === 'submit') return 'submit';
  if (target.submit === 'form') {
    throw new CommandError('SUBMIT_INTENT_REQUIRED',
      'This control submits a form. If the user explicitly asked for this submission, use browser_submit (or repeat the click with intent="submit").');
  }
  if (target.submit === 'likely') {
    throw new CommandError('SUBMIT_INTENT_REQUIRED',
      'This control looks like it submits or changes data. If the user explicitly asked for that, use browser_submit (or repeat the click with intent="submit"); otherwise leave it.');
  }
  return 'interact';
}

const SUBMIT_WORDS = /\b(submit|save|send|post|publish|delete|remove|confirm|pay|purchase|buy|order|checkout|approve|reject|merge|create|comment|reply|update|apply|transfer|donate|subscribe|unsubscribe|register|sign ?up|log ?out|sign ?out|accept|agree|upload|share|invite|archive|close issue|cancel subscription)\b/i;

/** Heuristic for controls outside a form: does the label read like a submission? */
export function looksLikeSubmission(label: string): boolean {
  return SUBMIT_WORDS.test(label);
}

const HIGH_IMPACT_WORDS = /\b(delete|remove|destroy|erase|wipe|pay|purchase|buy|order|checkout|transfer|donate|withdraw|refund|cancel subscription|close account|deactivate|terminate|revoke|merge|publish|deploy|release|send money)\b/i;

/** Destructive, financial or publishing actions: the user is always asked, whatever their setting. */
export function isHighImpact(label: string): boolean {
  return HIGH_IMPACT_WORDS.test(label);
}

const KEYS: Record<string, Mode> = {
  Enter: 'write', ' ': 'write', Backspace: 'write', Delete: 'write',
  Escape: 'explore', Tab: 'explore', 'Shift+Tab': 'explore',
  ArrowUp: 'explore', ArrowDown: 'explore', ArrowLeft: 'explore', ArrowRight: 'explore',
  Home: 'explore', End: 'explore', PageUp: 'explore', PageDown: 'explore',
};
const KEY_ALIASES: Record<string, string> = {
  enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', 'shift+tab': 'Shift+Tab',
  space: ' ', spacebar: ' ', backspace: 'Backspace', delete: 'Delete', del: 'Delete',
  arrowup: 'ArrowUp', up: 'ArrowUp', arrowdown: 'ArrowDown', down: 'ArrowDown',
  arrowleft: 'ArrowLeft', left: 'ArrowLeft', arrowright: 'ArrowRight', right: 'ArrowRight',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
};

/** Normalizes a key name and says which access level pressing it needs. Characters count as typing. */
export function parseKey(input: string): { key: string; mode: Mode } {
  const raw = input.length === 1 ? input : input.trim();
  const named = KEY_ALIASES[raw.toLowerCase()];
  if (named) return { key: named, mode: KEYS[named] };
  if ([...raw].length === 1) return { key: raw, mode: 'write' };
  throw new CommandError('INVALID_ARGUMENT',
    `Unsupported key "${raw.slice(0, 20)}". Use Enter, Escape, Tab, Shift+Tab, Space, Backspace, Delete, an arrow key, Home, End, PageUp, PageDown or a single character.`);
}

/** Signals the page showed after a submission was dispatched. */
export interface SubmitSignals {
  /** The expected text is now visible outside the fields it was typed into. */
  expectSeen: boolean;
  /** Text that was submitted is now visible on the page outside the fields it was typed into. */
  submittedSeen: boolean;
  /** Texts of error alerts that were not there before. */
  newAlerts: string[];
  /** Labels of fields the page marks invalid. */
  invalidFields: string[];
  /** Texts of status messages that were not there before. */
  newStatuses: string[];
  formGone: boolean;
  fieldsCleared: boolean;
  urlChanged: boolean;
  documentChanged: boolean;
}

export interface SubmitVerdict {
  state: 'CONFIRMED' | 'FAILED' | 'UNCERTAIN';
  /** 'content': the expected text was found. 'reaction': the page reacted as if it accepted. */
  verified: 'content' | 'reaction' | null;
  evidence: string[];
}

/**
 * Judges a submission from what the page showed. A dispatched click alone is never success:
 * without a positive signal the outcome is UNCERTAIN, and any error signal makes it FAILED.
 */
export function judgeSubmission(signals: SubmitSignals, expected: boolean): SubmitVerdict {
  const evidence: string[] = [];
  if (signals.newAlerts.length || signals.invalidFields.length) {
    for (const alert of signals.newAlerts.slice(0, 3)) evidence.push(`error message appeared: "${alert}"`);
    if (signals.invalidFields.length) evidence.push(`fields marked invalid: ${signals.invalidFields.slice(0, 5).join(', ')}`);
    return { state: 'FAILED', verified: null, evidence };
  }
  if (signals.documentChanged) evidence.push('the page navigated after submitting');
  else if (signals.urlChanged) evidence.push('the address changed after submitting');
  if (signals.formGone) evidence.push('the form is no longer on the page');
  else if (signals.fieldsCleared) evidence.push('the submitted fields were cleared');
  for (const status of signals.newStatuses.slice(0, 2)) evidence.push(`status message appeared: "${status}"`);

  if (signals.expectSeen) {
    evidence.unshift('the expected text is now visible on the page');
    return { state: 'CONFIRMED', verified: 'content', evidence };
  }
  if (expected) {
    evidence.push('the expected text did not appear');
    return { state: 'UNCERTAIN', verified: null, evidence };
  }
  // No expectation was named, but what was submitted has shown up on the page: that is content.
  if (signals.submittedSeen) {
    evidence.unshift('the submitted text is now visible on the page');
    return { state: 'CONFIRMED', verified: 'content', evidence };
  }
  if (evidence.length) return { state: 'CONFIRMED', verified: 'reaction', evidence };
  return { state: 'UNCERTAIN', verified: null, evidence: ['the page showed no visible reaction'] };
}

/** Token bucket: at most `burst` at once, refilled at `perSecond`. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly perSecond: number;
  private readonly burst: number;

  constructor(perSecond: number, burst: number, now: number = Date.now()) {
    this.perSecond = perSecond;
    this.burst = burst;
    this.tokens = burst;
    this.last = now;
  }

  tryTake(now: number = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Remembers recently seen command ids so a replayed command is recognised. */
export class RecentIds {
  private readonly ids = new Set<string>();
  private readonly capacity: number;

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  /** True the first time an id is seen, false for a duplicate. */
  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > this.capacity) {
      this.ids.delete(this.ids.values().next().value as string);
    }
    return true;
  }
}

/** Generic activity wording. Never includes page content or entered text. */
export function activityLabel(action: string, intent?: string): { running: string; done: string } {
  switch (action) {
    case 'snapshot': return { running: 'Reading page', done: 'Read page' };
    case 'extract': return { running: 'Extracting text', done: 'Extracted text' };
    case 'click':
      return intent === 'submit'
        ? { running: 'Submitting', done: 'Submitted' }
        : { running: 'Clicking element', done: 'Clicked element' };
    case 'fill': return { running: 'Entering text', done: 'Entered text' };
    case 'press_key':
      return intent === 'submit'
        ? { running: 'Submitting', done: 'Submitted' }
        : { running: 'Pressing key', done: 'Pressed key' };
    case 'scroll': return { running: 'Scrolling', done: 'Scrolled' };
    case 'navigate': return { running: 'Navigating', done: 'Navigated' };
    case 'screenshot': return { running: 'Capturing screenshot', done: 'Captured screenshot' };
    case 'wait_for': return { running: 'Waiting for content', done: 'Waited for content' };
    case 'submit': return { running: 'Submitting', done: 'Submitted' };
    default: return { running: 'Working', done: 'Done' };
  }
}

/** Short, generic reason shown in the activity feed when a command fails. */
export function failureNote(code: string): string {
  switch (code) {
    case 'NOT_AUTHORIZED': return 'no site authorized';
    case 'PAUSED': return 'paused';
    case 'ORIGIN_MISMATCH': return 'left authorized site';
    case 'SESSION_SUSPENDED': return 'session suspended';
    case 'WRITE_NOT_AUTHORIZED': return 'needs Write access';
    case 'EXPLORE_NOT_AUTHORIZED': return 'needs Explore access';
    case 'AUTHORIZATION_EXPIRED': return 'authorization expired';
    case 'SESSION_NOT_OWNED': return 'another agent\'s session';
    case 'SESSION_REQUIRED': return 'no session named';
    case 'UNKNOWN_SESSION': return 'unknown session';
    case 'SUBMIT_INTENT_REQUIRED': return 'submission not requested';
    case 'SUBMIT_DENIED': return 'you declined';
    case 'SUBMIT_NOT_CONFIRMED': return 'not confirmed';
    case 'DUPLICATE_SUBMISSION': return 'duplicate submission blocked';
    case 'NAVIGATION_BLOCKED': return 'outside authorized site';
    case 'STALE_REF': return 'page changed';
    case 'STALE_COMMAND': return 'arrived too late';
    case 'DUPLICATE_COMMAND': return 'duplicate command';
    case 'RATE_LIMITED': return 'too many commands';
    case 'CANCELLED': return 'cancelled';
    case 'SENSITIVE_FIELD': return 'sensitive field';
    case 'WAIT_TIMEOUT': return 'timed out';
    default: return 'failed';
  }
}
