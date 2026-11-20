// A bare agent server for tests: speaks the Java-to-extension protocol directly over a minimal
// WebSocket implementation, so the extension's protocol-level protections (one-time command ids,
// deadlines, rate limits, cancellation of queued commands, version negotiation) can be exercised
// in real Chrome with messages the real server would never send.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const hmac = (token, message) => createHmac('sha256', token).update(message).digest('hex');

export class RawAgent {
  constructor(token, { clientId = 'c-rawagent', name = 'raw-agent', versions = [2] } = {}) {
    this.token = token;
    this.clientId = clientId;
    this.name = name;
    this.versions = versions;
    this.paired = false;
    this.closeCodes = [];
    this.waiting = new Map();
    this.nextId = 1;
    this.server = createServer();
    this.server.on('upgrade', (req, socket) => this.accept(req, socket));
  }

  /** Listens on the first free port of the range the extension scans. */
  async listen(firstPort, range = 8) {
    for (let port = firstPort; port < firstPort + range; port++) {
      const ok = await new Promise((resolve) => {
        this.server.once('error', () => resolve(false));
        this.server.listen(port, '127.0.0.1', () => resolve(true));
      });
      if (ok) {
        this.port = port;
        return port;
      }
    }
    throw new Error('no free port in the range');
  }

  accept(req, socket) {
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    this.socket = socket;
    this.paired = false;
    this.nonce = randomBytes(16).toString('hex');
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const frame = this.readFrame(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.size);
        if (frame.opcode === 8) {
          this.closeCodes.push(frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005);
          this.paired = false;
          socket.end();
        } else if (frame.opcode === 1) {
          this.receive(JSON.parse(frame.payload.toString('utf8')));
        }
      }
    });
    socket.on('error', () => undefined);
    socket.on('close', () => { this.paired = false; });
    this.send({ type: 'challenge', nonce: this.nonce, versions: this.versions });
  }

  /** One client frame (always masked), or null when the buffer does not hold a whole one yet. */
  readFrame(buffer) {
    if (buffer.length < 2) return null;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) return null;
      length = buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buffer.length < 10) return null;
      length = Number(buffer.readBigUInt64BE(2));
      offset = 10;
    }
    if (buffer.length < offset + 4 + length) return null;
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    return { opcode: buffer[0] & 0x0f, payload, size: offset + 4 + length };
  }

  send(message) {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const header = payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
    this.socket?.write(Buffer.concat([header, payload]));
  }

  receive(msg) {
    if (msg.type === 'auth') {
      if (msg.proof !== hmac(this.token, `client:${this.nonce}:${msg.nonce}`)) return;
      this.send({
        type: 'auth_ok', proof: hmac(this.token, `server:${this.nonce}:${msg.nonce}`), version: 2,
        clientId: this.clientId, clientName: this.name,
      });
      this.paired = true;
    } else if (typeof msg.id === 'string') {
      this.waiting.get(msg.id)?.(msg);
      this.waiting.delete(msg.id);
    }
  }

  /** Sends a command (any id, any deadline) and resolves with the extension's response. */
  command(action, { session, params = {}, id = `raw-${this.nextId++}`, deadline = Date.now() + 30000 } = {}) {
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.send({ id, action, ...(session ? { session } : {}), params, deadline });
    });
  }

  close() {
    this.socket?.destroy();
    return new Promise((resolve) => this.server.close(resolve));
  }
}
