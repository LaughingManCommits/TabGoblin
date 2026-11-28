// Typed messages of the WebSocket protocol between the Java server and this extension, and the
// validation applied to everything that arrives. Mirrors java-server Protocol.java.

import type { Limits } from './policy.ts';

/**
 * The version this extension speaks: said in the handshake, and a server that speaks another is
 * refused, with the popup's word to update both parts to one release. It is 1: counted from the
 * first release that has one connection for every agent of the server. The server names its
 * agents, a command names its agent, and the extension says back which agents the user
 * disconnected. The releases before it (0.2.0 said 3) had a connection and a port for each agent.
 */
export const PROTOCOL_VERSION = 1;

export const CLOSE_UNAUTHORIZED = 4401;
/** Not a close code any more: the user's disconnecting of one agent is said as `agents_refused`. Kept for the popup's words. */
export const CLOSE_USER_DISCONNECTED = 4403;
export const CLOSE_VERSION = 4406;
/** The extension closes with this when a server has left its heartbeats unanswered. */
export const CLOSE_UNRESPONSIVE = 4408;

/** One agent of the server, as the server names it: its id, which its tabs are bound to, and the name the user is shown. */
export interface AgentInfo {
  id: string;
  name: string;
}

export interface CommandMessage {
  id: string;
  /** The agent the command is from: one the server named. */
  agent: string;
  action: string;
  /** Session the command is bound to; absent means "this agent's only session". */
  session?: string;
  params: Record<string, unknown>;
  /** Epoch milliseconds after which the server no longer waits for the result. */
  deadline: number;
}

export type ServerMessage =
  | { type: 'challenge'; nonce: string; version: number }
  | { type: 'auth_ok'; proof: string; version: number; agents: AgentInfo[] }
  /** Who the server's agents are now: one came, went, or was named. */
  | { type: 'agents'; agents: AgentInfo[] }
  | { type: 'pong' }
  | { type: 'cancel'; id: string }
  /** The sites no agent may work on, as the server's settings have them; `unreadable` when they cannot be read and everything is refused. */
  | { type: 'policy'; blocked: string[]; unreadable: boolean; limits: Limits }
  | { type: 'command'; command: CommandMessage };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

/** The agents of a server as it names them, or null when the list is not one: an agent without an id is no agent. */
function parseAgents(raw: unknown): AgentInfo[] | null {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const agents: AgentInfo[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const id = str(entry.id, 64);
    if (!id) return null;
    agents.push({ id, name: typeof entry.name === 'string' ? entry.name.slice(0, 60) : '' });
  }
  return agents;
}

/** Turns a parsed JSON message into a typed one, or null when it is not a valid protocol message. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw)) return null;

  switch (raw.type) {
    case 'challenge': {
      const nonce = str(raw.nonce, 128);
      // A server that names no version is of a release before there was one: that is version 0, and refused.
      return nonce ? { type: 'challenge', nonce, version: Number.isInteger(raw.version) ? raw.version as number : 0 } : null;
    }
    case 'auth_ok': {
      const proof = str(raw.proof, 128);
      const agents = parseAgents(raw.agents ?? []);
      if (!proof || !agents || !Number.isInteger(raw.version)) return null;
      return { type: 'auth_ok', proof, version: raw.version as number, agents };
    }
    case 'agents': {
      const agents = parseAgents(raw.agents);
      return agents ? { type: 'agents', agents } : null;
    }
    case 'pong':
      return { type: 'pong' };
    case 'cancel': {
      const id = str(raw.id, 64);
      return id ? { type: 'cancel', id } : null;
    }
    case 'policy': {
      if (!Array.isArray(raw.blocked) || raw.blocked.length > 5000) return null;
      // A list with an entry that is no host is not taken in part: it is not a list.
      const blocked = raw.blocked.map((v) => str(v, 253));
      if (blocked.some((v) => v === null || !/^[a-z0-9.\-:[\]]+$/.test(v))) return null;
      // What else the user's settings restrict. A restriction that is not said is not there; one
      // that is said and cannot be read makes the message no message, as with the list.
      const allowedRaw = raw.allowed === undefined ? [] : raw.allowed;
      if (!Array.isArray(allowedRaw) || allowedRaw.length > 5000) return null;
      const allowed = allowedRaw.map((v) => str(v, 253));
      if (allowed.some((v) => v === null || !/^[a-z0-9.\-:[\]]+$/.test(v))) return null;
      const maxAccess = raw.maxAccess === undefined ? 'write' : raw.maxAccess;
      if (maxAccess !== 'read' && maxAccess !== 'explore' && maxAccess !== 'write') return null;
      const minutes = (v: unknown): number | null =>
        (v === undefined ? 0 : typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10080 ? v : null);
      const sessionMaxMinutes = minutes(raw.sessionMaxMinutes);
      const sessionIdleMinutes = minutes(raw.sessionIdleMinutes);
      if (sessionMaxMinutes === null || sessionIdleMinutes === null) return null;
      return {
        type: 'policy', blocked: blocked as string[], unreadable: raw.unreadable === true,
        limits: {
          strict: raw.strict === true, allowed: allowed as string[], screenshots: raw.screenshots !== false,
          maxAccess, sessionMaxMinutes, sessionIdleMinutes,
        },
      };
    }
    case undefined: {
      const id = str(raw.id, 64);
      const agent = str(raw.agent, 64);
      const action = str(raw.action, 40);
      if (!id || !agent || !action) return null;
      if (raw.session !== undefined && (typeof raw.session !== 'string' || !/^s\d{1,9}$/.test(raw.session))) return null;
      if (raw.params !== undefined && !isRecord(raw.params)) return null;
      if (typeof raw.deadline !== 'number' || !Number.isFinite(raw.deadline)) return null;
      return {
        type: 'command',
        command: {
          id, agent, action,
          ...(typeof raw.session === 'string' ? { session: raw.session } : {}),
          params: isRecord(raw.params) ? raw.params : {},
          deadline: raw.deadline,
        },
      };
    }
    default:
      return null;
  }
}

/** What the extension says about its part of a round trip, in milliseconds. */
export interface CommandTiming {
  ran: number;
  queued: number;
  asked: number;
}

/**
 * How long a command ran here, how long it waited before that for its turn in the tab's queue, and
 * how much of the running was waiting for the user's answer. The server cannot see inside the
 * round trip, so it is told with each answer. Whole milliseconds, never negative, and the user's
 * part never more than the running.
 */
export function commandTiming(receivedAt: number, startedAt: number, endedAt: number, askedMs: number): CommandTiming {
  const whole = (ms: number): number => (Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0);
  const ran = whole(endedAt - startedAt);
  return { ran, queued: whole(startedAt - receivedAt), asked: Math.min(ran, whole(askedMs)) };
}
