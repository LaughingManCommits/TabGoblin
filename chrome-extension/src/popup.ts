// Popup: connected agents, sessions (one per authorized tab) with their controls, the activity
// feed and submission confirmations. All decisions are made in the background worker; this page
// only shows state and sends requests.

type Mode = 'read' | 'explore' | 'write';

interface ActivityEntry {
  id: number;
  session: string | null;
  label: string;
  status: 'running' | 'ok' | 'error' | 'info';
  note?: string;
}

interface SessionView {
  id: string;
  tabId: number;
  origin: string;
  origins: string[];
  suspended: boolean;
  mode: Mode;
  paused: boolean;
  expiresAt: number | null;
  clientId: string | null;
  clientName: string | null;
  ownerConnected: boolean;
  lastSubmission: string | null;
}

interface ClientView {
  id: string;
  name: string;
  port: number;
}

interface State {
  connection: 'unpaired' | 'connected' | 'disconnected' | 'pairing_failed' | 'version_mismatch';
  port: number;
  hasToken: boolean;
  confirmSubmissions: boolean;
  indicator: boolean;
  clients: ClientView[];
  blockedClients: string[];
  sessions: SessionView[];
  activity: ActivityEntry[];
  pendingConfirm: { id: string; session: string; label: string; highImpact: boolean } | null;
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
    case 'pairing_failed': return 'Pairing failed: check the token';
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
      const button = el('button', 'disconnect', 'Disconnect');
      button.addEventListener('click', () => void request({ type: 'disconnectClient', clientId: client.id }));
      li.append(el('span', 'name', agentName(client)), el('span', 'muted', `:${client.port}`), button);
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
  rebuild('sessions', [s.sessions, currentTab?.id], () => {
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
      if (session.tabId === currentTab?.id) line.append(el('span', 'chip', 'this tab'));
      if (session.suspended) line.append(el('span', 'chip state', 'suspended'));
      else if (session.paused) line.append(el('span', 'chip state', 'paused'));

      const owner = session.clientId
        ? `${agentName({ name: session.clientName, id: session.clientId })}${session.ownerConnected ? '' : ' (not connected)'}`
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

      row.append(line, el('div', 'meta', parts.join(' · ')), controls);
      box.append(row);
    }
  });

  const here = currentTab?.origin ?? null;
  const sessionHere = s.sessions.find((x) => x.tabId === currentTab?.id);
  const authorizedHere = !!sessionHere && !sessionHere.suspended && !!here && sessionHere.origins.includes(here);
  $('authorizeBox').hidden = authorizedHere;

  // A suspended session on this tab can be taken up again here, with this site added if it is new.
  const resumable = !!sessionHere && sessionHere.suspended && !!here;
  $('resumeBox').hidden = !resumable;
  if (resumable && sessionHere && here) {
    const known = sessionHere.origins.includes(here);
    $('resume').hidden = !known;
    $('addOrigin').hidden = known;
    $('resume').textContent = `Resume ${sessionHere.id} on this tab`;
    $('addOrigin').textContent = `Add ${displayOrigin(here)} to ${sessionHere.id}`;
    $('resumeHint').textContent = known
      ? `Session ${sessionHere.id} was suspended when this tab left its site. It is back now.`
      : `Session ${sessionHere.id} is suspended: this tab is on a site that is not part of it.`;
  }
  if (authorizedHere) return;
  const button = $<HTMLButtonElement>('authorize');
  button.disabled = !here;
  $('authorizeHint').textContent = here
    ? 'Let an agent work in this tab, on this site only.'
    : 'This tab cannot be authorized (only http and https websites).';
  button.textContent = here ? `Authorize ${displayOrigin(here)}` : 'Authorize';

  // With one agent connected it gets the tab; with several the user chooses.
  const agent = $<HTMLSelectElement>('newAgent');
  agent.hidden = s.clients.length < 2;
  rebuild('newAgent', s.clients, () => {
    agent.replaceChildren();
    const any = el('option', '', 'Any agent');
    any.value = '';
    agent.append(any);
    for (const client of s.clients) {
      const option = el('option', '', agentName(client));
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

function render(): void {
  if (!state) return;
  const s = state;
  $('dot').className = `dot ${s.connection === 'connected' ? 'connected' : s.connection === 'pairing_failed' || s.connection === 'version_mismatch' ? 'failed' : ''}`;
  $('connection').textContent = connectionText(s);

  const pairing = $('pairing');
  const wasHidden = pairing.hidden;
  pairing.hidden = !(showSettings || !s.hasToken || s.connection === 'pairing_failed');
  if (wasHidden && !pairing.hidden) $<HTMLInputElement>('port').value = String(s.port);
  $<HTMLButtonElement>('forget').hidden = !s.hasToken;

  $('confirm').hidden = !s.pendingConfirm;
  if (s.pendingConfirm) {
    $('confirmTitle').textContent = s.pendingConfirm.highImpact ? 'Allow this high-impact action?' : 'Allow this submission?';
    $('confirmLabel').textContent = `“${s.pendingConfirm.label || 'an unnamed control'}”`;
    $('confirmSession').textContent = s.pendingConfirm.session;
  }

  renderAgents(s);
  renderSessions(s);
  renderActivity(s);
  $<HTMLInputElement>('confirmSubmissions').checked = s.confirmSubmissions;
  $<HTMLInputElement>('indicator').checked = s.indicator;
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
$('confirmSubmissions').addEventListener('change', () => void request({ type: 'setConfirm', value: $<HTMLInputElement>('confirmSubmissions').checked }));
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
