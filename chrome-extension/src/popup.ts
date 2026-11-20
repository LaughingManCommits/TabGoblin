// Popup: connection status, origin authorization, access level, activity feed, pause / revoke.
// All decisions are made in the background worker; this page only shows state and sends requests.

interface ActivityEntry {
  id: number;
  label: string;
  status: 'running' | 'ok' | 'error' | 'info';
  note?: string;
}

interface State {
  connection: 'unpaired' | 'connecting' | 'connected' | 'disconnected' | 'pairing_failed';
  port: number;
  hasToken: boolean;
  confirmSubmissions: boolean;
  auth: { tabId: number; origin: string; access: 'read' | 'write' } | null;
  paused: boolean;
  activity: ActivityEntry[];
  pendingConfirm: { id: string; label: string } | null;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const CONNECTION_TEXT: Record<State['connection'], string> = {
  unpaired: 'Not paired',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected: is the MCP server running?',
  pairing_failed: 'Pairing failed: check the token',
};
const MARKS: Record<ActivityEntry['status'], string> = { running: '→', ok: '✓', error: '✗', info: '·' };

let state: State | null = null;
let currentTab: { id: number; origin: string | null } | null = null;
let showSettings = false;

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

function render(): void {
  if (!state) return;
  const s = state;

  $('dot').className = `dot ${s.connection === 'connected' ? 'connected' : s.connection === 'pairing_failed' ? 'failed' : ''}`;
  $('connection').textContent = CONNECTION_TEXT[s.connection];

  const pairing = $('pairing');
  const wasHidden = pairing.hidden;
  pairing.hidden = !(showSettings || !s.hasToken || s.connection === 'pairing_failed');
  if (wasHidden && !pairing.hidden) $<HTMLInputElement>('port').value = String(s.port);

  $('confirm').hidden = !s.pendingConfirm;
  $('confirmLabel').textContent = s.pendingConfirm ? `“${s.pendingConfirm.label || 'an unnamed control'}”` : '';

  const here = currentTab?.origin ?? null;
  const authorizedHere = !!s.auth && currentTab?.id === s.auth.tabId && here === s.auth.origin;
  $('origin').textContent = s.auth ? displayOrigin(s.auth.origin) : 'Not authorized';
  $('accessRow').hidden = !s.auth;
  if (s.auth) $<HTMLSelectElement>('access').value = s.auth.access;

  const authorizeBox = $('authorizeBox');
  authorizeBox.hidden = authorizedHere;
  if (!authorizedHere) {
    const hint = $('authorizeHint');
    const button = $<HTMLButtonElement>('authorize');
    button.disabled = !here;
    if (!here) {
      hint.textContent = 'This tab cannot be authorized (only http and https websites).';
      button.textContent = 'Authorize';
    } else {
      hint.textContent = s.auth
        ? 'This tab is not the authorized one. Authorizing it replaces the current authorization.'
        : 'Let the agent work in this tab, on this site only.';
      button.textContent = `Authorize ${displayOrigin(here)}`;
    }
  }
  $<HTMLInputElement>('confirmSubmissions').checked = s.confirmSubmissions;

  const list = $('activity');
  list.replaceChildren();
  // Current operation first, then the most recent finished ones.
  const entries = [...s.activity].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.id - a.id);
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No activity yet';
    list.append(li);
  }
  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = entry.status;
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = MARKS[entry.status];
    const label = document.createElement('span');
    label.textContent = entry.label;
    li.append(mark, label);
    if (entry.note) {
      const note = document.createElement('span');
      note.className = 'note';
      note.textContent = `(${entry.note})`;
      li.append(note);
    }
    list.append(li);
  }

  const pause = $<HTMLButtonElement>('pause');
  pause.textContent = s.paused ? 'Resume' : 'Pause';
  pause.disabled = !s.auth;
  $<HTMLButtonElement>('revoke').disabled = !s.auth;
}

$('pair').addEventListener('click', () => {
  showSettings = false;
  void request({
    type: 'pair',
    token: $<HTMLInputElement>('token').value,
    port: Number($<HTMLInputElement>('port').value),
  }).then(() => { $<HTMLInputElement>('token').value = ''; });
});
$('authorize').addEventListener('click', () => {
  if (currentTab) void request({ type: 'authorize', tabId: currentTab.id, access: $<HTMLSelectElement>('newAccess').value });
});
$('access').addEventListener('change', () => void request({ type: 'setAccess', access: $<HTMLSelectElement>('access').value }));
$('confirmSubmissions').addEventListener('change', () => void request({ type: 'setConfirm', value: $<HTMLInputElement>('confirmSubmissions').checked }));
$('pause').addEventListener('click', () => void request({ type: state?.paused ? 'resume' : 'pause' }));
$('revoke').addEventListener('click', () => void request({ type: 'revoke' }));
$('allow').addEventListener('click', () => void request({ type: 'confirm', id: state?.pendingConfirm?.id, allow: true }));
$('deny').addEventListener('click', () => void request({ type: 'confirm', id: state?.pendingConfirm?.id, allow: false }));
$('settings').addEventListener('click', () => {
  showSettings = !showSettings;
  render();
});

void findCurrentTab().then(() => request({ type: 'getState' }));
setInterval(() => void findCurrentTab().then(() => request({ type: 'getState' })), 700);
