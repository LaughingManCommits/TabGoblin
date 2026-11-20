// Authorization rules. Pure functions: no chrome.* and no DOM, so every rule is unit-tested.

export type Access = 'read' | 'write';
export type Intent = 'interact' | 'submit';

export interface Authorization {
  tabId: number;
  /** scheme + hostname + port, exactly as URL.origin reports it. Subdomains are different origins. */
  origin: string;
  access: Access;
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
  'status', 'snapshot', 'extract', 'click', 'fill', 'scroll', 'navigate', 'screenshot', 'wait_for',
] as const;
export type Action = (typeof ACTIONS)[number];

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

/**
 * Runs before every command. `tabUrl` is the authorized tab's current URL as the browser reports
 * it; an unknown URL fails closed.
 */
export function checkGate(
  state: { auth: Authorization | null; paused: boolean },
  action: string,
  tabUrl: string | undefined,
): void {
  if (!(ACTIONS as readonly string[]).includes(action)) {
    throw new CommandError('UNSUPPORTED_ACTION', `Unsupported action "${action}".`);
  }
  if (action === 'status') return;
  if (!state.auth) {
    throw new CommandError('NOT_AUTHORIZED',
      'No website is authorized. Ask the user to open the site, click the Browser Context MCP icon and authorize it.');
  }
  if (state.paused) {
    throw new CommandError('PAUSED', 'The user paused agent access. Ask them to resume it in the extension popup.');
  }
  if (originOf(tabUrl) !== state.auth.origin) {
    throw new CommandError('ORIGIN_MISMATCH',
      `The tab is no longer on the authorized origin ${state.auth.origin}. Access has been revoked; the user must authorize again.`);
  }
  if (action === 'fill' && state.auth.access !== 'write') {
    throw new CommandError('WRITE_NOT_AUTHORIZED',
      'Entering text needs Write access. Ask the user to switch access to Read / Write in the extension popup.');
  }
}

/**
 * Resolves an absolute or relative URL against the current page and insists the result stays on
 * the authorized origin.
 */
export function resolveNavigation(input: string, currentUrl: string, authorizedOrigin: string): string {
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
  if (target.origin !== authorizedOrigin) {
    throw new CommandError('NAVIGATION_BLOCKED',
      `${target.origin} is outside the authorized origin ${authorizedOrigin}. Only the user can authorize another site.`);
  }
  return target.href;
}

/** What the content script reports about an element before it is clicked. */
export interface ClickTarget {
  /** Same-origin link or disclosure toggle: equivalent to reading/navigating, allowed with read access. */
  readSafe: boolean;
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
export function checkClick(access: Access, intent: Intent, target: ClickTarget): 'interact' | 'submit' {
  if (target.externalLink) {
    throw new CommandError('NAVIGATION_BLOCKED', 'That link leads outside the authorized origin, so it was not clicked.');
  }
  if (access !== 'write') {
    if (target.readSafe && intent !== 'submit') return 'interact';
    throw new CommandError('WRITE_NOT_AUTHORIZED',
      'With read access only links and disclosure toggles can be clicked. Ask the user to switch access to Read / Write in the extension popup.');
  }
  if (intent === 'submit') return 'submit';
  if (target.submit === 'form') {
    throw new CommandError('SUBMIT_INTENT_REQUIRED',
      'This control submits a form. If the user explicitly asked for this submission, repeat the click with intent="submit".');
  }
  if (target.submit === 'likely') {
    throw new CommandError('SUBMIT_INTENT_REQUIRED',
      'This control looks like it submits or changes data. If the user explicitly asked for that, repeat the click with intent="submit"; otherwise leave it.');
  }
  return 'interact';
}

const SUBMIT_WORDS = /\b(submit|save|send|post|publish|delete|remove|confirm|pay|purchase|buy|order|checkout|approve|reject|merge|create|comment|reply|update|apply|transfer|donate|subscribe|unsubscribe|register|sign ?up|log ?out|sign ?out|accept|agree|upload|share|invite|archive|close issue|cancel subscription)\b/i;

/** Heuristic for controls outside a form: does the label read like a submission? */
export function looksLikeSubmission(label: string): boolean {
  return SUBMIT_WORDS.test(label);
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
    case 'scroll': return { running: 'Scrolling', done: 'Scrolled' };
    case 'navigate': return { running: 'Navigating', done: 'Navigated' };
    case 'screenshot': return { running: 'Capturing screenshot', done: 'Captured screenshot' };
    case 'wait_for': return { running: 'Waiting for content', done: 'Waited for content' };
    default: return { running: 'Working', done: 'Done' };
  }
}

/** Short, generic reason shown in the activity feed when a command fails. */
export function failureNote(code: string): string {
  switch (code) {
    case 'NOT_AUTHORIZED': return 'no site authorized';
    case 'PAUSED': return 'paused';
    case 'ORIGIN_MISMATCH': return 'left authorized site';
    case 'WRITE_NOT_AUTHORIZED': return 'needs Write access';
    case 'SUBMIT_INTENT_REQUIRED': return 'submission not requested';
    case 'SUBMIT_DENIED': return 'you declined';
    case 'SUBMIT_NOT_CONFIRMED': return 'not confirmed';
    case 'NAVIGATION_BLOCKED': return 'outside authorized site';
    case 'STALE_REF': return 'page changed';
    case 'SENSITIVE_FIELD': return 'sensitive field';
    case 'WAIT_TIMEOUT': return 'timed out';
    default: return 'failed';
  }
}
