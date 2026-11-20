// Two small demo "websites" on two localhost ports, i.e. two different origins:
//   site A: classic semantic HTML (forms, details, links)        http://127.0.0.1:8931
//   site B: div-based single-page app (ARIA roles, contenteditable) http://127.0.0.1:8932
// Run: node demo-site/server.mjs [portA] [portB]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function serve(dir, port, otherPort) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    // A same-origin URL that redirects to the other origin, to test redirects out of the origin.
    if (url.pathname === '/redirect-out') {
      res.writeHead(302, { Location: `http://127.0.0.1:${otherPort}/` });
      res.end();
      return;
    }
    const relative = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^([/\\])+/, '');
    if (relative.includes('..')) {
      res.writeHead(400).end('Bad request');
      return;
    }
    try {
      let body = await readFile(join(ROOT, dir, relative), 'utf8');
      body = body.replaceAll('__OTHER_ORIGIN__', `http://127.0.0.1:${otherPort}`);
      res.writeHead(200, { 'Content-Type': TYPES[extname(relative)] ?? 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Starts both sites. Port 0 picks free ports. */
export async function startDemo(portA = 8931, portB = 8932) {
  // Each site needs to know the other's port, so bind first when ports are dynamic.
  const probe = async (p) => {
    if (p !== 0) return p;
    const s = createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const { port } = s.address();
    await new Promise((r) => s.close(r));
    return port;
  };
  const a = await probe(portA);
  const b = await probe(portB);
  const servers = [await serve('site-a', a, b), await serve('site-b', b, a)];
  return {
    originA: `http://127.0.0.1:${a}`,
    originB: `http://127.0.0.1:${b}`,
    close: () => Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }))),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const demo = await startDemo(Number(process.argv[2]) || 8931, Number(process.argv[3]) || 8932);
  console.log(`Site A (classic HTML): ${demo.originA}`);
  console.log(`Site B (single-page app): ${demo.originB}`);
}
