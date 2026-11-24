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

/** The host of an address or an origin, as hosts are compared: lower case, and a name in another script in its encoded form. */
export function hostOf(address: string | undefined | null): string | null {
  if (!address) return null;
  try {
    return new URL(address).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The entry of the list of blocked sites that blocks this host, or null if none does. A host is
 * blocked by an entry that is the host itself or a domain it lies under; an address that is a
 * number is blocked only by itself. The server has the same rule (BlockedSites.java), and both
 * are held to the same cases.
 */
export function blockedBy(host: string | null, blocked: readonly string[]): string | null {
  if (!host) return null;
  const number = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  for (const domain of blocked) {
    if (host === domain || (!number && host.endsWith(`.${domain}`))) return domain;
  }
  return null;
}

/** What a server said of blocked sites: the domains, and whether everything is refused because its settings cannot be read. */
export interface Blocked {
  sites: readonly string[];
  everything: boolean;
}

export const NOTHING_BLOCKED: Blocked = { sites: [], everything: false };

/** The site among these addresses that is blocked, as its host; '*' when everything is; null when none is. */
export function blockedAmong(blocked: Blocked, addresses: readonly (string | null | undefined)[]): string | null {
  if (blocked.everything) return '*';
  for (const address of addresses) {
    const host = hostOf(address);
    if (blockedBy(host, blocked.sites)) return host;
  }
  return null;
}

/**
 * Refuses a command in a session whose tab, or one of whose sites, is on the user's list of
 * blocked sites. The server refuses the same before it sends anything; here it is checked
 * against where the tab is at this moment, which the server knows only from a report.
 */
export function checkBlocked(blocked: Blocked, addresses: readonly (string | null | undefined)[]): void {
  const host = blockedAmong(blocked, addresses);
  if (host === '*') {
    throw new CommandError('SETTINGS_UNREADABLE',
      'The TabGoblin server\'s settings file cannot be read, so every site counts as blocked until the user has mended it.');
  }
  if (host) {
    throw new CommandError('SITE_BLOCKED',
      `${host} is on the user's list of blocked sites: no agent may work there. Only the user can change that, in the settings of the TabGoblin server.`);
  }
}

/**
 * What the user's local security policy takes away from every agent, as the server's settings
 * file has it. Nothing in it widens what an agent may do. The server has the same rule
 * (BlockedSites.java, `Limits`) and refuses what it can tell before sending; here it is checked
 * at the moment of a command.
 */
export interface Limits {
  /** The strict profile: every submission is put to the user, a click that may change something is one, and a tab is for one named agent. */
  strict: boolean;
  /** The only sites agents may work on, as domains; none for no such limit. */
  allowed: readonly string[];
  /** Whether an agent may take a picture of a tab. */
  screenshots: boolean;
  /** The highest access level a session may have. */
  maxAccess: Mode;
  /** How long an authorization lasts at most, in minutes; 0 for no limit. */
  sessionMaxMinutes: number;
  /** After how many minutes without a command an authorization ends; 0 for never. */
  sessionIdleMinutes: number;
}

export const NO_LIMITS: Limits = { strict: false, allowed: [], screenshots: true, maxAccess: 'write', sessionMaxMinutes: 0, sessionIdleMinutes: 0 };

/** The lower of an access level and the highest one the policy allows. */
export function capMode(mode: Mode, max: Mode): Mode {
  return RANK[mode] <= RANK[max] ? mode : max;
}

/** What holds when several servers say different things: of each restriction the stricter one. */
export function strictest(all: readonly Limits[]): Limits {
  const least = (values: number[]): number => values.filter((v) => v > 0).reduce((a, b) => Math.min(a, b), Infinity);
  const minutes = (values: number[]): number => (Number.isFinite(least(values)) ? least(values) : 0);
  const limited = all.filter((l) => l.allowed.length > 0);
  return {
    strict: all.some((l) => l.strict),
    // A site has to be allowed by every server that limits sites.
    allowed: limited.length === 0 ? [] : limited[0].allowed.filter((site) => limited.every((l) => blockedBy(site, l.allowed) !== null)),
    screenshots: all.every((l) => l.screenshots),
    maxAccess: all.reduce<Mode>((mode, l) => capMode(mode, l.maxAccess), 'write'),
    sessionMaxMinutes: minutes(all.map((l) => l.sessionMaxMinutes)),
    sessionIdleMinutes: minutes(all.map((l) => l.sessionIdleMinutes)),
  };
}

/**
 * The host among these addresses that is outside the sites agents are limited to; null when all
 * are inside or there is no such limit. An address that names no site is outside: what cannot be
 * told to be allowed is not.
 */
export function outsideAllowed(limits: Limits, addresses: readonly (string | null | undefined)[]): string | null {
  if (limits.allowed.length === 0) return null;
  for (const address of addresses) {
    if (!address) continue;
    const host = hostOf(address);
    if (!host) return 'an address that names no site';
    if (!blockedBy(host, limits.allowed)) return host;
  }
  return null;
}

/**
 * Refuses a command that the user's security policy rules out: a screenshot where there are to
 * be none, an action above the highest access level, and anything on a site outside the allowed ones.
 */
export function checkLimits(limits: Limits, action: string, addresses: readonly (string | null | undefined)[]): void {
  if (action === 'screenshot' && !limits.screenshots) {
    throw new CommandError('SCREENSHOTS_DISABLED',
      'The user\'s security policy allows no screenshots. Nothing was captured. Read the page with browser_snapshot or browser_extract instead.');
  }
  const required = REQUIRED[action];
  if (required && RANK[required] > RANK[limits.maxAccess]) throw restricted(limits);
  const outside = outsideAllowed(limits, addresses);
  if (outside) {
    throw new CommandError('SITE_NOT_ALLOWED',
      `${outside} is not among the sites the user's security policy allows agents to work on. Only the user can change that, in the settings of the TabGoblin server.`);
  }
}

/** The refusal of something above the highest access level the policy allows. */
export function restricted(limits: Pick<Limits, 'maxAccess'>): CommandError {
  return new CommandError('ACCESS_RESTRICTED',
    `The user's security policy allows no session more than ${limits.maxAccess === 'explore' ? 'Explore' : 'Read'} access. Nothing was done. `
    + 'Only the user can change the policy, in the settings of the TabGoblin server.');
}

/**
 * When an authorization ends: the earliest of the time the user gave it, the longest the policy
 * lets one last, and the time since its last command that the policy lets pass. Null for never.
 */
export function endsAt(
  session: { expiresAt: number | null; createdAt?: number; lastUsedAt?: number }, limits: Pick<Limits, 'sessionMaxMinutes' | 'sessionIdleMinutes'>,
): number | null {
  const ends: number[] = [];
  if (session.expiresAt !== null) ends.push(session.expiresAt);
  if (limits.sessionMaxMinutes > 0 && session.createdAt !== undefined) ends.push(session.createdAt + limits.sessionMaxMinutes * 60_000);
  if (limits.sessionIdleMinutes > 0) {
    const last = session.lastUsedAt ?? session.createdAt;
    if (last !== undefined) ends.push(last + limits.sessionIdleMinutes * 60_000);
  }
  return ends.length ? Math.min(...ends) : null;
}

/** When the user is asked under the policy: under the strict profile about every submission, whatever was set. */
export function askUnder(limits: Pick<Limits, 'strict'>, mode: AskMode): AskMode {
  return limits.strict ? 'always' : mode;
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

/**
 * Whether an agent has an id that is the same at every start: the id of a key of its own, which
 * its process proved to the server. Any other id is made for one start of the agent.
 */
export function isLastingAgent(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^a-[0-9a-f]{12}$/.test(id);
}

/**
 * Whether an agent may use a session: its own, or one that no agent has taken up yet. An agent is
 * known by the id the server proved for it and by nothing else. What it calls itself is shown to
 * the user and decides nothing: a session never passes to another id.
 */
export function canUse(session: Pick<SessionAuth, 'clientId'>, client: ClientIdentity): boolean {
  return session.clientId === client.id || session.clientId === null;
}

/**
 * The sessions that go with an agent when the user disconnects it: those it owns. A session that
 * no agent has taken up yet was given to none, and stays.
 */
export function sessionsOfAgent<T extends Pick<SessionAuth, 'clientId'>>(sessions: readonly T[], client: ClientIdentity): T[] {
  return sessions.filter((session) => session.clientId !== null && canUse(session, client));
}

/** What the badge on the toolbar says; nothing when no tab is authorized. */
export type Badge = '?' | 'RUN' | 'ON' | 'OFF' | 'II' | '';

/**
 * What the badge on the toolbar says. `ON` is a promise: an agent may act now. That takes a
 * session that is neither paused nor suspended and a connected agent that may use it. A session
 * whose agent is not connected is `OFF`: the tab is still authorized, and nobody is there to act.
 * It said `ON` for that too once, which was stale as soon as a server had gone.
 */
export function badgeFor(
  asking: boolean,
  running: boolean,
  sessions: readonly (Pick<SessionAuth, 'clientId'> & { paused: boolean; suspended: boolean })[],
  connected: readonly ClientIdentity[],
): Badge {
  if (asking) return '?';
  if (running) return 'RUN';
  const open = sessions.filter((s) => !s.paused && !s.suspended);
  if (open.some((s) => connected.some((c) => canUse(s, c)))) return 'ON';
  if (open.length) return 'OFF';
  return sessions.some((s) => s.paused && !s.suspended) ? 'II' : '';
}

/**
 * How many heartbeats in a row a server may leave unanswered before it is taken for gone. A
 * connection can stay open to a server that no longer answers: one that hangs, or one the system
 * has stopped. The extension asks every twenty seconds, and counts the answers.
 */
export const HEARTBEATS_UNANSWERED = 2;

/** Whether a server that has left this many heartbeats in a row unanswered is taken for gone. */
export function serverGone(unanswered: number): boolean {
  return unanswered >= HEARTBEATS_UNANSWERED;
}

/** Throws unless the session's access level is at least `required`. */
export function requireMode(mode: Mode, required: Mode): void {
  if (RANK[mode] < RANK[required]) throw needs(required);
}

/**
 * Picks the session a command is for and decides whether this agent may use it.
 *
 * A session belongs to the agent that claimed it. An unclaimed session is claimed by the first
 * agent that uses it. No agent ever takes over another's session: an agent that is started again
 * has its sessions because it has the same id, which its key gives it.
 */
export function resolveSession<T extends SessionAuth>(
  sessions: readonly T[],
  client: ClientIdentity,
  requested: string | undefined,
): { session: T; claim: boolean } {
  const usable = (s: T): boolean => canUse(s, client);

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
export function checkClick(mode: Mode, intent: Intent, target: ClickTarget, strict = false): 'interact' | 'submit' {
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
  // What a click does is the page's own business. Under the strict profile only a click that
  // shows something (a link of this site, an expand or collapse control) passes as reading.
  if (strict && !target.readSafe && !target.disclosure) {
    throw new CommandError('SUBMIT_INTENT_REQUIRED',
      'Under the user\'s strict security profile a click on anything but a link or an expand/collapse control counts as a change, '
      + 'and the user confirms each one. If the user explicitly asked for it, use browser_submit (or repeat the click with intent="submit"); otherwise leave it.');
  }
  return 'interact';
}

const SUBMIT_WORDS = /\b(submit|save|send|post|publish|delete|remove|confirm|pay|purchase|buy|order|checkout|approve|reject|merge|create|comment|reply|update|apply|transfer|donate|subscribe|unsubscribe|register|sign ?up|log ?out|sign ?out|accept|agree|upload|share|invite|archive|close issue|cancel subscription)\b/i;

/** Heuristic for controls outside a form: does the label read like a submission? */
export function looksLikeSubmission(label: string): boolean {
  return SUBMIT_WORDS.test(label);
}

const SEARCH_WORDS = /\b(search|find|filter)\b/i;

/**
 * Heuristic for a one-line field whose Enter runs a search or a filter, which changes nothing.
 * It is not applied to text areas and editors: that is where messages are written.
 */
export function looksLikeSearch(label: string): boolean {
  return SEARCH_WORDS.test(label);
}

/** What the content script reports about the element a key is about to be pressed on. */
export interface KeyTarget {
  /**
   * Set when the key is Enter and the element takes text.
   * 'form': the field belongs to a form, which Enter submits.
   * 'text': a text area, an editor, or a field outside a form. Enter may send what is written
   *         there (a message, a comment) or only start a new line; the page does not say which.
   */
  submit: 'form' | 'text' | null;
  /** Set when the key does what a click on the element does: Enter or Space on a button, a link, a tab. */
  click: ClickTarget | null;
  /** Short label of the element, for the user's confirmation prompt. */
  label: string;
}

/**
 * Decides whether a key may be pressed.
 * - 'press': go ahead.
 * - 'ask': it is a submission the agent declared; the caller puts it in front of the user first.
 * - 'click': the key activates a control, and that is a submission; the caller runs it as one.
 */
export function checkKey(mode: Mode, intent: Intent, target: KeyTarget, strict = false): 'press' | 'ask' | 'click' {
  // A key that activates a control is a click on it, and no way around the rules for clicks.
  if (target.click) return checkClick(mode, intent, target.click, strict) === 'submit' ? 'click' : 'press';
  if (!target.submit) return 'press';
  if (mode !== 'write') throw needs('write');
  if (intent === 'submit') return 'ask';
  if (target.submit === 'form') {
    throw new CommandError('SUBMIT_INTENT_REQUIRED',
      'Pressing Enter here submits a form. If the user explicitly asked for this submission, repeat with intent="submit" (or use browser_submit on the submit button to have the outcome verified).');
  }
  throw new CommandError('SUBMIT_INTENT_REQUIRED',
    'Pressing Enter in a text box can send what is written there (a message, a comment), so it counts as a submission. '
    + 'For a line break, put it into the text of browser_fill. If the user explicitly asked you to send or submit, repeat with intent="submit".');
}

/**
 * When the user is asked about a submission.
 * - `always`: about every one.
 * - `auto`: the first time for each control; what they allowed passes for a while.
 * - `never`: only about high-impact ones.
 */
export type AskMode = 'always' | 'auto' | 'never';

export function askModeOf(value: unknown): AskMode {
  return value === 'auto' || value === 'never' ? value : 'always';
}

/** In the automatic mode: how long an Allow lets the same control pass. */
export const ALLOW_LASTS_MS = 15 * 60_000;
/** In the automatic mode: how many submissions may pass unasked within a minute. One more is asked about. */
export const UNASKED_PER_MINUTE = 5;

/** What the user allowed in a session lately, and what passed without a question since. Never stored. */
/** How a submission is made: by a click, by Enter in a field of a form, or by Enter in a text box. */
export type SubmitHow = 'click' | 'form' | 'enter';

export interface AllowMemory {
  /** The key is how the submission is made and what the control is called; the origin is the website it is on. */
  allowed: { key: string; how: SubmitHow; label: string; origin: string; at: number }[];
  /** When submissions passed unasked. */
  passed: number[];
}

/**
 * Decides whether a submission is put to the user. `word` is what makes it high-impact, if
 * anything: such a submission is asked about whatever the mode and whatever was allowed before.
 *
 * In the automatic mode an Allow stands for the same control: the same kind of request, the same
 * name, on the same website. It ends after a while, and it does not cover a burst: beyond a few
 * a minute the user is asked again.
 */
export function needsAsking(
  mode: AskMode, word: string | null, memory: AllowMemory | undefined, key: string, origin: string | null, now: number,
): boolean {
  if (word !== null || mode === 'always') return true;
  if (mode === 'never') return false;
  if (!memory || origin === null) return true;
  const allowed = memory.allowed.some((a) => a.key === key && a.origin === origin && now - a.at < ALLOW_LASTS_MS);
  const lately = memory.passed.filter((at) => now - at < 60_000).length;
  return !allowed || lately >= UNASKED_PER_MINUTE;
}

/** The user allowed a control: in the automatic mode it passes from now on, for a while. */
/**
 * Whether an Allow would stand for a while, so that the same control passes without a question:
 * in the automatic mode only, never for a high-impact action, and never for a control without a
 * name, which could not be told from another one without a name, nor be shown to the user.
 * The prompt says so before the user answers.
 */
export function remembersAllow(mode: AskMode, word: string | null, label: string, origin: string | null): boolean {
  return mode === 'auto' && word === null && origin !== null && label.trim() !== '';
}

export function rememberAllow(
  memory: AllowMemory | undefined, key: string, how: SubmitHow, label: string, origin: string, now: number,
): AllowMemory {
  const allowed = (memory?.allowed ?? []).filter((a) => now - a.at < ALLOW_LASTS_MS && !(a.key === key && a.origin === origin));
  return { allowed: [...allowed, { key, how, label, origin, at: now }], passed: memory?.passed ?? [] };
}

/** A submission passed without a question. */
export function notePassed(memory: AllowMemory, now: number): AllowMemory {
  return { allowed: memory.allowed, passed: [...memory.passed.filter((at) => now - at < 60_000), now] };
}

/**
 * What passes unasked in a session right now, for the user to see: the kind of request, the name
 * of the control, and the minutes it has left.
 */
export function standingAllows(memory: AllowMemory | undefined, now: number): { how: SubmitHow; label: string; minutes: number }[] {
  return (memory?.allowed ?? []).filter((a) => now - a.at < ALLOW_LASTS_MS)
    .map((a) => ({ how: a.how, label: a.label, minutes: Math.max(1, Math.ceil((ALLOW_LASTS_MS - (now - a.at)) / 60_000)) }));
}

/** How long a no stands: the same request is not put to the user again, and a session that was refused three times running is not heard. */
export const NO_STANDS_MS = 5 * 60_000;
/** After this many requests in a row that were declined or left unanswered, a session may not ask for a while. */
export const UNWELCOME_AFTER = 3;

/** What is remembered of the user's answers in one session, to decide whether they are asked again. */
export interface AskMemory {
  /**
   * What the user declined, and when. The key is how the submission would be made and what the
   * control is called. An entry kept from before the kind was noted has none.
   */
  declined: { key: string; how?: SubmitHow; label: string; at: number }[];
  /** Requests in a row that were declined or left unanswered, and when the last of them was. */
  refusedInARow: number;
  refusedAt: number;
}

/**
 * The requests of a session that would not be put to the user right now: those they declined, by
 * kind and by the name of the control, or all of them.
 */
export function standingRefusals(
  memory: AskMemory | undefined, now: number,
): { requests: { how: SubmitHow | null; label: string }[]; all: boolean } {
  if (!memory) return { requests: [], all: false };
  return {
    requests: memory.declined.filter((d) => now - d.at < NO_STANDS_MS).map((d) => ({ how: d.how ?? null, label: d.label })),
    all: memory.refusedInARow >= UNWELCOME_AFTER && now - memory.refusedAt < NO_STANDS_MS,
  };
}

/**
 * Decides whether the user may be asked about a submission. Asking has a cost of its own: a
 * prompt that keeps coming back wears consent down, and one the user cannot see is no question.
 * So a no stands for a while, a session whose requests are refused again and again is not heard
 * for a while, and only one request waits at a time.
 */
export function checkAsk(memory: AskMemory | undefined, key: string, anotherWaits: boolean, now: number): void {
  if (anotherWaits) {
    throw new CommandError('CONFIRMATION_PENDING',
      'The user is being asked about another submission. Nothing was done. Try again once that one is answered.');
  }
  if (!memory) return;
  if (memory.declined.some((d) => d.key === key && now - d.at < NO_STANDS_MS)) {
    throw new CommandError('SUBMIT_DENIED',
      'The user declined this a few minutes ago and is not asked again so soon. Nothing was done. Do not retry: tell the user, '
      + 'who can allow being asked again in the TabGoblin popup.');
  }
  if (memory.refusedInARow >= UNWELCOME_AFTER && now - memory.refusedAt < NO_STANDS_MS) {
    throw new CommandError('SUBMIT_DENIED',
      'The user declined or did not answer the last requests of this session, so no further one is put to them for a few minutes. '
      + 'Nothing was done. Do not retry: tell the user, who can allow being asked again in the TabGoblin popup.');
  }
}

/** Takes note of how a request ended. An allow ends a run of refusals, and lifts an earlier no to the same request. */
export function noteAnswer(
  memory: AskMemory | undefined, key: string, how: SubmitHow, label: string, answer: 'allow' | 'deny' | 'timeout', now: number,
): AskMemory {
  const declined = (memory?.declined ?? []).filter((d) => now - d.at < NO_STANDS_MS && d.key !== key);
  if (answer === 'allow') return { declined, refusedInARow: 0, refusedAt: 0 };
  if (answer === 'deny') declined.push({ key, how, label, at: now });
  const running = memory && now - memory.refusedAt < NO_STANDS_MS ? memory.refusedInARow : 0;
  return { declined, refusedInARow: running + 1, refusedAt: now };
}

const HIGH_IMPACT_WORDS = /\b(delete|remove|destroy|erase|wipe|pay|purchase|buy|order|checkout|transfer|donate|withdraw|refund|cancel subscription|close account|deactivate|terminate|revoke|merge|publish|deploy|release|send money)\b/i;

/** The word in a control's name that makes it a destructive, financial or publishing action, if there is one. */
export function highImpactWord(label: string): string | null {
  return HIGH_IMPACT_WORDS.exec(label)?.[1].toLowerCase() ?? null;
}

/** Destructive, financial or publishing actions: the user is always asked, whatever their setting. */
export function isHighImpact(label: string): boolean {
  return highImpactWord(label) !== null;
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

/**
 * What the notice in the page says of a command that ended, and how it ended: the words of the
 * activity list, with the short note of `failureNote` when it did not run through. It is made
 * from the action and the error's code alone, never from an error's own text, which can carry
 * something of the page. `began` is false for a command that was turned away before it started.
 */
export function endedLine(action: string, intent: string | undefined, code: string, began = true): { text: string; mark: 'ok' | 'error' } {
  const labels = activityLabel(action, intent);
  if (code === 'ok') return { text: labels.done, mark: 'ok' };
  return { text: `${labels.running}${began ? '' : ' blocked'} (${failureNote(code)})`, mark: 'error' };
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
    case 'CONFIRMATION_PENDING': return 'another request was waiting for you';
    case 'DUPLICATE_SUBMISSION': return 'duplicate submission blocked';
    case 'NAVIGATION_BLOCKED': return 'outside authorized site';
    case 'SITE_BLOCKED': return 'site blocked';
    case 'SETTINGS_UNREADABLE': return 'settings unreadable';
    case 'SITE_NOT_ALLOWED': return 'site not allowed by your policy';
    case 'ACCESS_RESTRICTED': return 'above the access your policy allows';
    case 'SCREENSHOTS_DISABLED': return 'screenshots are off in your policy';
    case 'SCREENSHOT_BLOCKED': return 'a frame of another site is in view';
    case 'APPROVAL_STALE': return 'changed after you were asked';
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
