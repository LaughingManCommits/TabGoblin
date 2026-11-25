// Minimal MCP stdio client (newline-delimited JSON-RPC), enough to act like an IDE agent.

import { spawn } from 'node:child_process';

/**
 * A step may start a call and look at the popup before it waits for the answer. A server that
 * ends meanwhile then fails that step where it awaits the call, and not the whole run as a
 * rejection nobody was waiting for.
 */
function handled(promise) {
  promise.catch(() => {});
  return promise;
}

export class McpClient {
  /** @param name how this client introduces itself to the server (shown as the agent's name) */
  constructor(command, args, name = 'bcmcp-e2e') {
    this.name = name;
    this.proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.stderr = '';
    this.stdoutNoise = [];
    this.pending = new Map();
    /** Ids of answers that arrived for requests this client was no longer waiting for. */
    this.strays = [];
    this.nextId = 1;
    this.transportError = null;
    this.stdinError = null;
    this.exited = new Promise((resolve) => {
      this.proc.once('exit', (code, signal) => {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        this.transportError = new Error(`MCP process ${this.name} exited with ${reason}`);
        resolve(code);
      });
      // Only now is everything the process wrote read: an answer written just before the exit
      // has been delivered, and what is still waiting gets none.
      this.proc.once('close', () => this.rejectPending(this.transportError ?? new Error(`MCP process ${this.name} closed its output`)));
      this.proc.once('error', (error) => {
        this.rejectPending(error);
        if (!this.proc.pid) resolve(null); // A spawn failure has no exit event.
      });
    });
    // A write that fails says nothing of the answers still on their way: the end of the process
    // settles what waits, with its reason.
    this.proc.stdin.on('error', (error) => { this.stdinError ??= error; });
    this.proc.stderr.on('data', (chunk) => { this.stderr += chunk; });
    let buffer = '';
    this.proc.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          this.stdoutNoise.push(line); // anything that is not JSON-RPC would corrupt the channel
          continue;
        }
        const waiter = this.pending.get(msg.id);
        if (waiter) {
          this.pending.delete(msg.id);
          if (msg.error) waiter.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
          else waiter.resolve(msg.result);
        } else if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
          this.strays.push(msg.id); // an answer nobody is waiting for, such as one to a cancelled request
        }
      }
    });
  }

  rejectPending(error) {
    this.transportError ??= error;
    for (const waiter of this.pending.values()) waiter.reject(this.transportError);
    this.pending.clear();
  }

  request(method, params = {}, timeoutMs = 120000) {
    if (this.transportError) return handled(Promise.reject(this.transportError));
    if (this.proc.stdin.writableEnded) return handled(Promise.reject(new Error(`MCP input for ${this.name} is closed`)));
    const id = this.nextId++;
    return handled(new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    }));
  }

  notify(method, params = {}) {
    if (this.transportError) throw this.transportError;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  /**
   * Gives a request up, as a client does: it tells the server and stops waiting. The protocol
   * asks the server to send no answer, so the request's promise is settled here.
   */
  cancel(id, reason) {
    this.notify('notifications/cancelled', { requestId: id, reason });
    const waiter = this.pending.get(id);
    this.pending.delete(id);
    waiter?.resolve({ cancelled: true });
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: this.name, version: '0.2.1' },
    });
    this.notify('notifications/initialized');
    return result;
  }

  /** Calls a tool and flattens the result to { text, image, isError }. */
  tool(name, args = {}) {
    return handled(this.request('tools/call', { name, arguments: args }).then((result) => {
      const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const image = result.content.find((c) => c.type === 'image') ?? null;
      return { text, image, isError: result.isError === true };
    }));
  }

  /** Closes stdin, as an IDE does when it stops the server; resolves with the exit code. */
  async close(timeoutMs = 8000) {
    this.proc.stdin.end();
    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve('still-running'), timeoutMs); });
    const code = await Promise.race([this.exited, deadline]);
    clearTimeout(timer);
    if (code === 'still-running') this.proc.kill();
    return code;
  }
}
