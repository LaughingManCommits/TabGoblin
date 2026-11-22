// The panels of the popup that fold to one line, and what that line says. Pure: no chrome.*, no DOM.

/**
 * The panels the user can fold. The confirmation prompt and the pairing form are not among them:
 * a question that waits for the user, or a missing pairing, must not be folded away.
 */
export const PANELS = ['sessions', 'activity', 'agents', 'settings'] as const;
export type Panel = (typeof PANELS)[number];

const isPanel = (value: unknown): value is Panel =>
  typeof value === 'string' && (PANELS as readonly string[]).includes(value);

/** The folded panels as they were stored: known names only, each once, in the popup's order. */
export function foldedOf(stored: unknown): Panel[] {
  return Array.isArray(stored) ? PANELS.filter((panel) => stored.includes(panel)) : [];
}

/** Folds or unfolds one panel. A name that is not a panel changes nothing. */
export function withFolded(folded: readonly Panel[], panel: unknown, fold: boolean): Panel[] {
  if (!isPanel(panel)) return [...folded];
  return PANELS.filter((name) => (name === panel ? fold : folded.includes(name)));
}

/** A number of authorized tabs, in words: "no tabs", "1 tab", "3 tabs". */
export function tabCount(count: number): string {
  return count === 1 ? '1 tab' : `${count || 'no'} tabs`;
}

/**
 * What stands beside an agent's Disconnect button, and what the button says when the pointer is
 * on it: the tabs the agent would lose. Disconnect takes one click and asks nothing, so the user
 * has to be able to read beforehand what it ends.
 */
export function disconnectCost(tabs: number): { beside: string; hint: string } {
  const kept = 'It stays out until you allow it again.';
  if (!tabs) return { beside: tabCount(0), hint: `Disconnects this agent. ${kept}` };
  const lost = tabs === 1 ? 'ends its 1 tab, which then needs your click again' : `ends its ${tabs} tabs, which then need your click again`;
  return { beside: tabCount(tabs), hint: `Disconnects this agent and ${lost}. ${kept}` };
}

/**
 * The folded Sessions panel in one line: how many tabs are authorized, whether the tab the popup
 * was opened on is one of them, and what needs the user (`state`): a suspended or a paused session.
 */
export function sessionsSummary(
  sessions: readonly { id: string; tabId: number; suspended: boolean; paused: boolean }[],
  thisTab: number | undefined,
  canAuthorize: boolean,
): { text: string; state: string | null } {
  if (!sessions.length) return { text: 'No tab is authorized', state: null };
  const mine = sessions.find((session) => session.tabId === thisTab);
  const count = tabCount(sessions.length);
  const here = mine ? ` · this tab: ${mine.id}` : canAuthorize ? ' · not this tab' : '';
  const suspended = sessions.filter((session) => session.suspended).length;
  const paused = sessions.filter((session) => session.paused && !session.suspended).length;
  return { text: count + here, state: suspended ? `${suspended} suspended` : paused ? `${paused} paused` : null };
}

/** The folded Agents panel in one line: who is connected, and how many the user turned away. */
export function agentsSummary(names: readonly string[], disconnected: number): string {
  const turnedAway = disconnected ? `${disconnected} disconnected by you` : '';
  if (!names.length) return turnedAway || 'None connected';
  return names.join(', ') + (turnedAway ? ` · ${turnedAway}` : '');
}

/** The folded Settings panel in one line: when the user is asked, and whether the indicator is on. */
export function settingsSummary(asking: string, indicator: boolean): string {
  return `${asking} · indicator ${indicator ? 'on' : 'off'}`;
}
