// Typed messages of the WebSocket protocol between the Java server and this extension, and the
// validation applied to everything that arrives. Mirrors java-server Protocol.java.

export const PROTOCOL_VERSION = 2;

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
  | { type: 'challenge'; nonce: string; versions: number[] }
  | { type: 'auth_ok'; proof: string; version: number; clientId: string; clientName: string }
  | { type: 'pong' }
  | { type: 'cancel'; id: string }
  | { type: 'client'; name: string }
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
      return nonce ? { type: 'challenge', nonce, versions } : null;
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
