// Popup: connected agents, sessions (one per authorized tab) with their controls, the activity
// feed and submission confirmations. All decisions are made in the background worker; this page
// only shows state and sends requests.

import { agentsSummary, disconnectCost, sessionsSummary, settingsSummary } from './panels.ts';
import { blockedBy, hostOf } from './policy.ts';

type Mode = 'read' | 'explore' | 'write';

interface ActivityEntry {
  id: number;
  session: string | null;
  label: string;
  status: 'running' | 'ok' | 'error' | 'info';
  note?: string;
}

type AskMode = 'always' | 'auto' | 'never';

/** The settings for asking, as a session's own control names them. */
const ASKS: [AskMode, string][] = [['always', 'Ask every time'], ['auto', 'Ask the first time'], ['never', 'Do not ask']];

/** What each setting means, under the general control. */
const ASK_HINTS: Record<AskMode, string> = {
  always: 'You are asked about every submission.',
  auto: 'You are asked the first time for each button or text box. What you allow then passes for 15 minutes. '
    + 'Deleting, paying and publishing always ask.',
  never: 'You are asked only about deleting, paying, publishing and the like.',
};

interface SessionView {
  id: string;
  tabId: number;
  origin: string;
  origins: string[];
  suspended: boolean;
  /** One of its sites is on the list of blocked sites: nothing an agent does in it goes through. */
  blocked: boolean;
  mode: Mode;
  paused: boolean;
  expiresAt: number | null;
  clientId: string | null;
  clientName: string | null;
  ownerConnected: boolean;
  lastSubmission: string | null;
  /** Requests of this session that are not put to the user for now: those they declined, or all. */
  notAsked: { requests: { how: 'click' | 'form' | 'enter' | null; label: string }[]; all: boolean };
  /** When the user is asked in this session, and what passes without a question right now. */
  ask: AskMode;
  passes: { how: 'click' | 'form' | 'enter'; label: string; minutes: number }[];
}

interface ClientView {
  id: string;
  name: string;
  port: number;
  /** The tabs a Disconnect would take from this agent. */
  tabs: number;
}

interface State {
  connection: 'unpaired' | 'connected' | 'disconnected' | 'pairing_failed' | 'version_mismatch';
  port: number;
  hasToken: boolean;
  /** When the user is asked about a submission: the general setting. */
  ask: AskMode;
  indicator: boolean;
  /** The panels the user has folded to one line. */
  folded: string[];
  clients: ClientView[];
  blockedClients: string[];
  /** The sites no agent may work on, from the server's settings; `everything` when those cannot be read. */
  blocked: { sites: string[]; everything: boolean };
  sessions: SessionView[];
  activity: ActivityEntry[];
  pendingConfirm: {
    id: string; session: string; label: string; highImpact: boolean; word: string | null; how: 'click' | 'form' | 'enter';
    origin: string | null; preview: { field: string; text: string }[]; lasts: number | null;
  } | null;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const MARKS: Record<ActivityEntry['status'], string> = { running: '→', ok: '✓', error: '✗', info: '·' };
const MODES: [Mode, string][] = [['read', 'Read'], ['explore', 'Explore'], ['write', 'Read / Write']];

let state: State | null = null;
let currentTab: { id: number; origin: string | null } | null = null;
let showSettings = false;
/** What the dynamic lists were last built from, so open dropdowns are not rebuilt under the user. */
const rendered: Record<string, string> = {};

function originOf(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** https://example.com -> example.com; the scheme is shown only when it is not https. */
function displayOrigin(origin: string): string {
  return origin.startsWith('https://') ? origin.slice('https://'.length) : origin;
}

function agentName(client: { name: string | null; id: string | null }): string {
  return client.name || (client.id ? `Agent ${client.id}` : 'Any agent');
}

/**
 * The name to show for an agent. Two agents of the same kind (two windows of one IDE) report the
 * same name, so the id is added whenever another connected agent would read the same; it is the
 * id browser_status reports to that agent as "This agent".
 */
function agentLabel(client: { name: string | null; id: string | null }, connected: readonly ClientView[]): string {
  const name = agentName(client);
  const shared = connected.some((other) => other.id !== client.id && agentName(other) === name);
  return shared && client.id && client.name ? `${name} (${client.id})` : name;
}

/**
 * A request as the user was asked about it: the kind, Enter in a text box or a click, and the name
 * of the control. The name comes from the page and is shown as a quotation; what has none is
 * described in our own words. Without a kind, only the control is named.
 */
function requestName(how: 'click' | 'form' | 'enter' | null, label: string): string {
  const enter = how === 'form' || how === 'enter';
  const name = label ? `“${label}”` : enter ? 'a text box without a name' : 'a control without a name';
  return how === null ? name : `${enter ? 'Enter in' : 'clicking'} ${name}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function findCurrentTab(): Promise<void> {
  try {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    currentTab = tab?.id === undefined ? null : { id: tab.id, origin: originOf(tab.url) };
  } catch {
    currentTab = null;
  }
}

async function request(message: object): Promise<void> {
  const error = $('error');
  try {
    const reply = await chrome.runtime.sendMessage(message) as { ok: boolean; error?: string; state: State };
    state = reply.state;
    error.hidden = reply.ok;
    if (!reply.ok) error.textContent = reply.error ?? 'Something went wrong.';
  } catch {
    error.hidden = false;
    error.textContent = 'The extension is restarting. Close and reopen this popup.';
  }
  render();
}

/** Rebuilds a list only when its data changed. */
function rebuild(key: string, data: unknown, build: () => void): void {
  const fingerprint = JSON.stringify(data);
  if (rendered[key] === fingerprint) return;
  rendered[key] = fingerprint;
  build();
}

function connectionText(s: State): string {
  switch (s.connection) {
    case 'unpaired': return 'Not paired';
    case 'connected': return s.clients.length === 1 ? '1 agent connected' : `${s.clients.length} agents connected`;
    // A server is there and did not take the token this extension holds: after every start of a
    // server that is so, and the same after a token that was mistyped.
    case 'pairing_failed': return "Paste the server's current token to connect";
    case 'version_mismatch': return 'Server and extension versions differ: update both';
    default: return 'Disconnected: is the MCP server running?';
  }
}

function renderAgents(s: State): void {
  $('agentsSection').hidden = !s.clients.length && !s.blockedClients.length;
  rebuild('agents', [s.clients, s.blockedClients], () => {
    const list = $('agents');
    list.replaceChildren();
    for (const client of s.clients) {
      const li = el('li');
      li.dataset.client = client.id;
      const cost = disconnectCost(client.tabs);
      const button = el('button', 'disconnect', 'Disconnect');
      button.title = cost.hint;
      button.addEventListener('click', () => void request({ type: 'disconnectClient', clientId: client.id }));
      const name = el('span', 'name', agentLabel(client, s.clients));
      name.title = name.textContent ?? '';
      li.append(name, el('span', 'tabs', cost.beside), el('span', 'muted', `:${client.port}`), button);
      list.append(li);
    }
    for (const id of s.blockedClients) {
      const li = el('li');
      const button = el('button', 'allow-agent', 'Allow again');
      button.addEventListener('click', () => void request({ type: 'allowClient', clientId: id }));
      li.append(el('span', 'name muted', `Agent ${id} (disconnected by you)`), button);
      list.append(li);
    }
  });
}

function renderSessions(s: State): void {
  rebuild('sessions', [s.sessions, currentTab?.id, s.clients], () => {
    const box = $('sessions');
    box.replaceChildren();
    if (!s.sessions.length) box.append(el('div', 'empty', 'No tab is authorized'));
    for (const session of s.sessions) {
      const row = el('div', 'session');
      row.dataset.session = session.id;

      const line = el('div', 'line');
      const more = session.origins.length > 1 ? ` +${session.origins.length - 1} site${session.origins.length > 2 ? 's' : ''}` : '';
      const origin = el('span', 'origin', displayOrigin(session.origin) + more);
      origin.title = session.origins.join('\n');
      line.append(el('span', 'sid', session.id), origin);
      // The chips stay together. Where they do not fit beside the address they go below it: the
      // address is what tells one session from another.
      const chips = el('span', 'chips');
      if (session.tabId === currentTab?.id) chips.append(el('span', 'chip', 'this tab'));
      if (session.blocked) {
        const blocked = el('span', 'chip state', 'blocked');
        blocked.title = 'On your list of blocked sites, in the TabGoblin server\'s settings file. Nothing an agent does in this tab goes through.';
        chips.append(blocked);
      }
      if (session.suspended) chips.append(el('span', 'chip state', 'suspended'));
      else if (session.paused) chips.append(el('span', 'chip state', 'paused'));
      if (chips.childElementCount) line.append(chips);

      const owner = session.clientId
        ? `${agentLabel({ name: session.clientName, id: session.clientId }, s.clients)}${session.ownerConnected ? '' : ' (not connected)'}`
        : 'Waiting for an agent';
      const parts = [owner];
      if (session.expiresAt) parts.push(`until ${new Date(session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      if (session.lastSubmission) parts.push(`last submission ${session.lastSubmission.toLowerCase()}`);

      const controls = el('div', 'row');
      const mode = el('select', 'mode');
      mode.setAttribute('aria-label', `Access for ${session.id}`);
      for (const [value, label] of MODES) {
        const option = el('option', '', label);
        option.value = value;
        mode.append(option);
      }
      mode.value = session.mode;
      mode.addEventListener('change', () => void request({ type: 'setMode', session: session.id, mode: mode.value }));
      const pause = el('button', 'pause', session.paused ? 'Resume' : 'Pause');
      pause.addEventListener('click', () => void request({ type: session.paused ? 'resume' : 'pause', session: session.id }));
      const revoke = el('button', 'revoke', 'Revoke');
      revoke.addEventListener('click', () => void request({ type: 'revoke', session: session.id }));
      controls.append(mode, pause, revoke);

      row.append(line, el('div', 'meta', parts.join(' · ')));
      // Said in the row, not only in a mark: why nothing the agent does here goes through.
      // Where every site is refused, that is said once above the rows, and the row has its mark.
      if (session.blocked && !s.blocked.everything) {
        row.append(el('div', 'meta blocked-note', 'Blocked: this site is on your list of blocked sites.'));
      }
      row.append(controls);
      // Asking is a matter of submitting, which only a session with write access can do.
      if (session.mode === 'write') {
        const asking = el('div', 'row asking');
        const ask = el('select', 'ask');
        ask.setAttribute('aria-label', `When to ask before ${session.id} submits`);
        for (const [value, label] of ASKS) {
          const option = el('option', '', label);
          option.value = value;
          ask.append(option);
        }
        ask.value = session.ask;
        ask.addEventListener('change', () => void request({ type: 'setAsk', session: session.id, value: ask.value }));
        asking.append(el('span', 'caption', 'Submissions'), ask);
        row.append(asking);
      }
      // What follows from asking stands under it, in one place: a no that still stands, and what passes.
      // A no stands for a while. The user sees that it does, and can take it back.
      if (session.notAsked.all || session.notAsked.requests.length) {
        // A no is to a kind of request on a control of that name: Enter in it, or a click on it.
        const names = session.notAsked.requests.map((request) => requestName(request.how, request.label));
        const held = el('div', 'held');
        held.append(el('span', '', session.notAsked.all
          ? 'Its requests were declined or not answered. It will not ask for a few minutes.'
          : `You declined ${names.join(', ')}. It will not ask again for a few minutes.`));
        const again = el('button', 'link askagain', 'Let it ask again');
        again.addEventListener('click', () => void request({ type: 'askAgain', session: session.id }));
        held.append(again);
        row.append(held);
      }
      // What the user allowed and now passes without a question: there to see, and to end.
      if (session.passes.length) {
        const passing = el('div', 'passing');
        // An Allow is for a kind of request on a control of that name: Enter in it, or a click on it.
        // The time it has left stays in one piece when the line breaks.
        const names = session.passes.map((pass) => `${requestName(pass.how, pass.label)} (${pass.minutes}\u00a0min)`);
        passing.append(el('span', '', `Passes without asking: ${names.join(', ')}.`));
        // One button ends all of them, and says so.
        const forget = el('button', 'link forget', session.passes.length > 1 ? 'Ask about them again' : 'Ask about it again');
        forget.addEventListener('click', () => void request({ type: 'forgetAllowed', session: session.id }));
        passing.append(forget);
        row.append(passing);
      }
      box.append(row);
    }
  });

  const here = currentTab?.origin ?? null;
  // A site on the user's list of blocked sites is not offered: the server would refuse everything on it.
  const hostHere = hostOf(here);
  const entryHere = blockedBy(hostHere, s.blocked.sites);
  const blockedHere = s.blocked.everything || entryHere !== null;
  // A settings file that cannot be read is said once, above the sessions: nothing is offered below.
  $('blockedAll').hidden = !s.blocked.everything;
  // The host as the list has it, and the entry that blocks it where that is a domain above it.
  const whyBlocked = entryHere === null ? ''
      : `${entryHere === hostHere ? hostHere : `${hostHere} is blocked: ${entryHere}`} is on your list of blocked sites. No agent can work in this tab. `
        + "To change the list, press Edit in the TabGoblin server's window.";
  const sessionHere = s.sessions.find((x) => x.tabId === currentTab?.id);
  const authorizedHere = !!sessionHere && !sessionHere.suspended && !!here && sessionHere.origins.includes(here);
  $('authorizeBox').hidden = authorizedHere || s.blocked.everything;

  // A suspended session on this tab can be taken up again here, with this site added if it is new.
  const resumable = !!sessionHere && sessionHere.suspended && !!here;
  $('resumeBox').hidden = !resumable || s.blocked.everything;
  if (resumable && sessionHere && here) {
    const known = sessionHere.origins.includes(here);
    // On a blocked site there is nothing to press: the box says why.
    $('resume').hidden = !known || blockedHere;
    $('addOrigin').hidden = known || blockedHere;
    $('resumeBox').classList.toggle('blocked', blockedHere);
    $('resume').textContent = `Resume ${sessionHere.id} on this tab`;
    $('addOrigin').textContent = `Add ${displayOrigin(here)} to ${sessionHere.id}`;
    $('resumeHint').textContent = blockedHere ? whyBlocked : known
      ? `Session ${sessionHere.id} was suspended when this tab left its site. It is back now.`
      : `Session ${sessionHere.id} is suspended: this tab is on a site that is not part of it.`;
  }
  if (authorizedHere || s.blocked.everything) return;
  const button = $<HTMLButtonElement>('authorize');
  button.disabled = !here;
  // On a blocked site the choices and the button are not shown: none of them could do anything.
  button.hidden = blockedHere;
  $('authorizeChoices').hidden = blockedHere;
  $('authorizeBox').classList.toggle('blocked', blockedHere);
  $('authorizeHint').textContent = !here
    ? 'This tab cannot be authorized (only http and https websites).'
    : blockedHere ? whyBlocked : 'Let an agent work in this tab, on this site only.';
  button.textContent = here ? `Authorize ${displayOrigin(here)}` : 'Authorize';

  // With one agent connected it gets the tab; with several the user chooses.
  const agent = $<HTMLSelectElement>('newAgent');
  agent.hidden = s.clients.length < 2 || blockedHere;
  rebuild('newAgent', s.clients, () => {
    agent.replaceChildren();
    const any = el('option', '', 'Any agent');
    any.value = '';
    agent.append(any);
    for (const client of s.clients) {
      const option = el('option', '', agentLabel(client, s.clients));
      option.value = client.id;
      agent.append(option);
    }
    agent.value = s.clients.length === 1 ? s.clients[0].id : '';
  });
}

function renderActivity(s: State): void {
  rebuild('activity', s.activity, () => {
    const list = $('activity');
    list.replaceChildren();
    // Current operations first, then the most recent finished ones.
    const entries = [...s.activity].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.id - a.id);
    if (!entries.length) list.append(el('li', 'info', 'No activity yet'));
    for (const entry of entries) {
      const li = el('li', entry.status);
      li.append(el('span', 'mark', MARKS[entry.status]));
      if (entry.session) li.append(el('span', 'sid', entry.session));
      li.append(el('span', '', entry.label));
      if (entry.note) li.append(el('span', 'note', `(${entry.note})`));
      list.append(li);
    }
  });
}

/** What a folded panel says in its one line. Text and marks only, built from what the panel shows unfolded. */
function summaryOf(panel: string, s: State): Node[] {
  const text = (value: string): HTMLElement => el('span', 'text', value);
  if (panel === 'sessions') {
    const summary = sessionsSummary(s.sessions, currentTab?.id, !$('authorizeBox').hidden);
    return summary.state ? [text(summary.text), el('span', 'chip state', summary.state)] : [text(summary.text)];
  }
  if (panel === 'activity') {
    // The entry the list shows first: what runs now, or else what happened last.
    const [first] = [...s.activity].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.id - a.id);
    if (!first) return [text('No activity yet')];
    const parts: Node[] = [el('span', `mark ${first.status}`, MARKS[first.status])];
    if (first.session) parts.push(el('span', 'sid', first.session));
    parts.push(text(first.note ? `${first.label} (${first.note})` : first.label));
    return parts;
  }
  if (panel === 'agents') return [text(agentsSummary(s.clients.map((client) => agentLabel(client, s.clients)), s.blockedClients.length))];
  if (panel === 'settings') return [text(settingsSummary(ASKS.find(([mode]) => mode === s.ask)?.[1] ?? '', s.indicator))];
  return [];
}

/** Folds the panels the user folded, and gives each of those its one line. */
function renderPanels(s: State): void {
  for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
    const name = panel.dataset.panel ?? '';
    const folded = s.folded.includes(name);
    panel.classList.toggle('folded', folded);
    panel.querySelector('.fold')?.setAttribute('aria-expanded', String(!folded));
    const summary = panel.querySelector<HTMLElement>('.summary');
    if (!summary) continue;
    summary.hidden = !folded;
    const parts = folded ? summaryOf(name, s) : [];
    // Written anew only when it says something else, like the lists.
    rebuild(`summary:${name}`, parts.map((part) => (part as HTMLElement).outerHTML), () => summary.replaceChildren(...parts));
  }
}

/**
 * A prompt that has only just appeared takes no answer. It comes up by itself and takes the
 * keyboard from the page: a key or a click that was on its way elsewhere must not become consent.
 */
const ANSWER_DELAY_MS = 700;
/** The request the prompt is showing, so that the pause is taken once for each. */
let promptShown: string | null = null;

function holdAnswers(id: string): void {
  promptShown = id;
  const answers = [$<HTMLButtonElement>('deny'), $<HTMLButtonElement>('allow')];
  for (const button of answers) button.disabled = true;
  // For that moment nothing else in the popup takes a key or a click either. With the answers
  // held, Tab would go on to the next control, and Enter there would fold a panel or press a button.
  const rest = [...document.querySelectorAll<HTMLElement>('main > :not(#confirm), footer')];
  for (const part of rest) part.inert = true;
  // The keyboard goes to the prompt as a whole, which announces it. No key does anything there,
  // and the first stop for Tab from it is Deny.
  $('confirm').focus();
  setTimeout(() => {
    if (promptShown === id) for (const button of answers) button.disabled = false;
    // Unless another prompt has come up meanwhile and is holding the popup for its own moment.
    if (promptShown === id || promptShown === null) for (const part of rest) part.inert = false;
  }, ANSWER_DELAY_MS);
}

function render(): void {
  if (!state) return;
  const s = state;
  // Green when connected, red for a fault. A token that a server did not take is neither: it is the
  // user's step after every start of a server, and amber as what waits for the user is.
  $('dot').className = `dot ${s.connection === 'connected' ? 'connected' : s.connection === 'pairing_failed' ? 'wanted' : s.connection === 'version_mismatch' ? 'failed' : ''}`;
  $('connection').textContent = connectionText(s);

  const pairing = $('pairing');
  const wasHidden = pairing.hidden;
  pairing.hidden = !(showSettings || !s.hasToken || s.connection === 'pairing_failed');
  if (wasHidden && !pairing.hidden) $<HTMLInputElement>('port').value = String(s.port);
  $<HTMLButtonElement>('forget').hidden = !s.hasToken;

  $('confirm').hidden = !s.pendingConfirm;
  if (s.pendingConfirm) {
    const how = s.pendingConfirm.how;
    const enter = how !== 'click';
    $('confirmTitle').textContent = s.pendingConfirm.highImpact ? 'Allow this high-impact action?'
      : enter ? 'Allow pressing Enter?' : 'Allow this submission?';
    // What deletes, pays or publishes does not look like a routine question.
    $('confirm').classList.toggle('high', s.pendingConfirm.highImpact);
    $('confirmClick').hidden = enter;
    $('confirmEnter').hidden = !enter;
    $('confirmWhy').hidden = !enter;
    $('confirmWhy').textContent = how === 'form' ? 'This submits the form the field belongs to.'
      : how === 'enter' ? 'In a message or comment box, Enter sends what is written.' : '';
    // The name comes from the page: shown as a quotation. What has no name is described in our own words.
    const label = s.pendingConfirm.label;
    $('confirmLabel').textContent = label ? `“${label}”` : enter ? 'a text box without a name' : 'a control without a name';
    $('confirmLabel').classList.toggle('unnamed', !label);
    // Where: the session, and the website it is on, so that the list below need not be searched.
    const where = s.sessions.find((x) => x.id === s.pendingConfirm?.session);
    $('confirmSession').textContent = s.pendingConfirm.session;
    // The site the tab is on now. A session can span several.
    const origin = s.pendingConfirm.origin ?? where?.origin ?? '';
    $('confirmOrigin').textContent = origin ? displayOrigin(origin) : '';
    // Who asks: the agent the session belongs to, told apart from another of the same name.
    $('confirmWho').textContent = where?.clientId ? agentLabel({ name: where.clientName, id: where.clientId }, s.clients) : 'The agent';
    // What it would send, as far as it is known: the beginning of each text. Page text, shown as a quotation.
    const sent = $('confirmSent');
    sent.hidden = s.pendingConfirm.preview.length === 0;
    sent.replaceChildren(...s.pendingConfirm.preview.map((part) => {
      const line = el('div', 'part');
      // For Enter the one field is the text box the question names already.
      if (part.field && !(enter && s.pendingConfirm?.preview.length === 1)) line.append(el('span', 'field', part.field));
      line.append(el('span', 'text', `“${part.text}”`));
      return line;
    }));
    // What an Allow would reach. Empty when it is for this once: the prompt is described by this line too.
    const lasts = s.pendingConfirm.lasts;
    $('confirmLasts').hidden = lasts === null;
    $('confirmLasts').textContent = lasts === null ? '' : `Automatic is on: after Allow, this passes without asking for ${lasts} minutes.`;
    // Why this one always asks.
    $('confirmImpact').hidden = !s.pendingConfirm.word;
    $('confirmImpact').textContent = s.pendingConfirm.word ? `Always asked about: its name says “${s.pendingConfirm.word}”.` : '';
    if (promptShown !== s.pendingConfirm.id) holdAnswers(s.pendingConfirm.id);
  } else {
    promptShown = null;
  }

  renderAgents(s);
  renderSessions(s);
  renderActivity(s);
  $<HTMLSelectElement>('askMode').value = s.ask;
  const own = s.sessions.some((x) => x.ask !== s.ask);
  $('askHint').textContent = `${ASK_HINTS[s.ask]}${own ? ' Some sessions are set differently; choosing here sets them all.' : ''}`;
  $<HTMLInputElement>('indicator').checked = s.indicator;
  renderPanels(s);
}

// The heading of a panel folds it to one line and unfolds it again. The worker keeps the choice.
for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
  panel.querySelector('.fold')?.addEventListener('click', () => {
    void request({ type: 'setFolded', panel: panel.dataset.panel, value: !panel.classList.contains('folded') });
  });
}

$('pair').addEventListener('click', () => {
  showSettings = false;
  void request({
    type: 'pair',
    token: $<HTMLInputElement>('token').value,
    port: Number($<HTMLInputElement>('port').value),
  }).then(() => { $<HTMLInputElement>('token').value = ''; });
});
$('forget').addEventListener('click', () => void request({ type: 'forget' }));
$('authorize').addEventListener('click', () => {
  if (!currentTab) return;
  void request({
    type: 'authorize',
    tabId: currentTab.id,
    mode: $<HTMLSelectElement>('newAccess').value,
    clientId: $<HTMLSelectElement>('newAgent').value || null,
    minutes: Number($<HTMLSelectElement>('newExpiry').value) || null,
  });
});
const sessionOfThisTab = (): string | undefined => state?.sessions.find((x) => x.tabId === currentTab?.id)?.id;
$('resume').addEventListener('click', () => void request({ type: 'resumeSession', session: sessionOfThisTab(), tabId: currentTab?.id }));
$('addOrigin').addEventListener('click', () => void request({ type: 'addOrigin', session: sessionOfThisTab(), tabId: currentTab?.id }));
$('askMode').addEventListener('change', () => void request({ type: 'setAsk', value: $<HTMLSelectElement>('askMode').value }));
$('indicator').addEventListener('change', () => void request({ type: 'setIndicator', value: $<HTMLInputElement>('indicator').checked }));
$('clearActivity').addEventListener('click', () => void request({ type: 'clearActivity' }));
$('allow').addEventListener('click', () => void request({ type: 'confirm', id: state?.pendingConfirm?.id, allow: true }));
$('deny').addEventListener('click', () => void request({ type: 'confirm', id: state?.pendingConfirm?.id, allow: false }));
$('settings').addEventListener('click', () => {
  showSettings = !showSettings;
  render();
});

void findCurrentTab().then(() => request({ type: 'getState' }));
setInterval(() => void findCurrentTab().then(() => request({ type: 'getState' })), 700);
