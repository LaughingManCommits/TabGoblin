// HMAC challenge-response for the localhost WebSocket. The pairing token itself is never sent:
// each side signs the other's nonce. Mirrors java-server Pairing.java.

const encoder = new TextEncoder();

export async function hmacHex(token: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function clientProof(token: string, serverNonce: string, clientNonce: string): Promise<string> {
  return hmacHex(token, `client:${serverNonce}:${clientNonce}`);
}

export function serverProof(token: string, serverNonce: string, clientNonce: string): Promise<string> {
  return hmacHex(token, `server:${serverNonce}:${clientNonce}`);
}

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-independent comparison; avoids leaking how many leading characters matched. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
