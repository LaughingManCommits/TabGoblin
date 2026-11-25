// Three small demo "websites" on three localhost ports, i.e. three different origins:
//   site A: classic semantic HTML, forms, a server-side form post     http://127.0.0.1:8931
//   site B: div-based single-page app (ARIA roles, contenteditable)   http://127.0.0.1:8932
//   site C: documentation-style site with frames and a discussion     http://127.0.0.1:8933
// They are test fixtures: nothing in the extension or the server knows about them.
// Run: node demo-site/server.mjs [portA] [portB] [portC]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLogPage } from './build-log.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 100_000) req.destroy(); });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

function serve(dir, port, otherPort) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    // A same-origin URL that redirects to the other origin, to test redirects out of the origin.
    if (url.pathname === '/redirect-out') {
      res.writeHead(302, { Location: `http://127.0.0.1:${otherPort}/` });
      res.end();
      return;
    }
    // A classic form post: the server answers with a new page showing what it received.
    if (url.pathname === '/echo' && req.method === 'POST') {
      const fields = new URLSearchParams(await readBody(req));
      const rows = [...fields].map(([k, v]) => `<li>${escapeHtml(k)}: ${escapeHtml(v)}</li>`).join('');
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Profile saved</title></head>`
        + `<body><h1>Profile saved</h1><p role="status">Your changes were stored.</p><ul>${rows}</ul>`
        + `<a href="/form.html">Edit again</a></body></html>`);
      return;
    }
    // A site that takes its time: the page comes two and a half seconds after it was asked for.
    if (dir === 'site-a' && url.pathname === '/slow.html') {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Slow page</title></head>'
        + '<body><h1>Slow page</h1><p>This page took its time.</p><a href="/">Home</a></body></html>');
      return;
    }
    // A page far too long to read whole: a build log, made on request. No other page links to it.
    if (dir === 'site-a' && url.pathname === '/build-log.html') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      res.end(buildLogPage());
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

/** Starts the sites. Port 0 picks free ports. */
export async function startDemo(portA = 8931, portB = 8932, portC = 8933) {
  // Each site needs to know another's port, so settle the ports first when they are dynamic.
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
  const c = await probe(portC);
  // "Other origin": A points at B, B at A, C embeds a frame from A.
  const servers = [await serve('site-a', a, b), await serve('site-b', b, a), await serve('site-c', c, a)];
  return {
    originA: `http://127.0.0.1:${a}`,
    originB: `http://127.0.0.1:${b}`,
    originC: `http://127.0.0.1:${c}`,
    close: () => Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }))),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const demo = await startDemo(Number(process.argv[2]) || 8931, Number(process.argv[3]) || 8932, Number(process.argv[4]) || 8933);
  console.log(`Site A (classic HTML and forms): ${demo.originA}`);
  console.log(`Site B (single-page app):        ${demo.originB}`);
  console.log(`Site C (documentation):          ${demo.originC}`);
}
