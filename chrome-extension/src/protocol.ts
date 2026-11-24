// Typed messages of the WebSocket protocol between the Java server and this extension, and the
// validation applied to everything that arrives. Mirrors java-server Protocol.java.

import type { Limits } from './policy.ts';

/**
 * Version 3: an agent is known by the id of its key, and no session passes to an agent by its
 * name; a server tells its security policy. A peer of version 2 is refused: it would bring the
 * older, weaker rule with it.
 */
export const PROTOCOL_VERSION = 3;

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_USER_DISCONNECTED = 4403;
export const CLOSE_VERSION = 4406;
/** The extension closes with this when a server has left its heartbeats unanswered. */
export const CLOSE_UNRESPONSIVE = 4408;

export interface CommandMessage {
  id: string;
  action: string;
  /** Session the command is bound to; absent means "this agent's only session". */
  session?: string;
  params: Record<string, unknown>;
  /** Epoch milliseconds after which the server no longer waits for the result. */
  deadline: number;
}

export type ServerMessage =
  /** `clientId` is who the server says it is before anything is proven; empty from a server that does not say. */
  | { type: 'challenge'; nonce: string; versions: number[]; clientId: string }
  | { type: 'auth_ok'; proof: string; version: number; clientId: string; clientName: string }
  | { type: 'pong' }
  | { type: 'cancel'; id: string }
  | { type: 'client'; name: string }
  /** The sites no agent may work on, as the server's settings have them; `unreadable` when they cannot be read and everything is refused. */
  | { type: 'policy'; blocked: string[]; unreadable: boolean; limits: Limits }
  | { type: 'command'; command: CommandMessage };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Turns a parsed JSON message into a typed one, or null when it is not a valid protocol message. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw)) return null;
  const str = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

  switch (raw.type) {
    case 'challenge': {
      const nonce = str(raw.nonce, 128);
      const versions = Array.isArray(raw.versions) ? raw.versions.filter((v): v is number => Number.isInteger(v)) : [];
      return nonce ? { type: 'challenge', nonce, versions, clientId: str(raw.clientId, 64) ?? '' } : null;
    }
    case 'auth_ok': {
      const proof = str(raw.proof, 128);
      const clientId = str(raw.clientId, 64);
      if (!proof || !clientId || !Number.isInteger(raw.version)) return null;
      return {
        type: 'auth_ok', proof, clientId, version: raw.version as number,
        clientName: typeof raw.clientName === 'string' ? raw.clientName.slice(0, 60) : '',
      };
    }
    case 'pong':
      return { type: 'pong' };
    case 'cancel': {
      const id = str(raw.id, 64);
      return id ? { type: 'cancel', id } : null;
    }
    case 'client':
      return typeof raw.name === 'string' ? { type: 'client', name: raw.name.slice(0, 60) } : null;
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
      const action = str(raw.action, 40);
      if (!id || !action) return null;
      if (raw.session !== undefined && (typeof raw.session !== 'string' || !/^s\d{1,9}$/.test(raw.session))) return null;
      if (raw.params !== undefined && !isRecord(raw.params)) return null;
      if (typeof raw.deadline !== 'number' || !Number.isFinite(raw.deadline)) return null;
      return {
        type: 'command',
        command: {
          id, action,
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
