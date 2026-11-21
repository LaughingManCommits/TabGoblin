// The editor lab: one local page per real editor library, each exposing the editor's own model as
// window.__lab.get() so a test can tell what the editor really holds.
//
//   node lab.mjs          serves the pages for looking at them by hand
//
// Nothing here is used by the extension or the server; the pages are test fixtures.

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, 'build');
const MODULES = join(HERE, 'node_modules');

/**
 * `usedBy` names well-known products built on the library, to say why it is worth testing.
 * `kind`: bundle (fixtures/<id>.js, bundled with esbuild) or inline (scripts and styles below).
 */
export const FIXTURES = [
  { id: 'textarea', name: 'Plain textarea', usedBy: 'control: most comment boxes', kind: 'inline',
    body: '<textarea id="plain" rows="8" cols="80" aria-label="Lab editor">Initial content</textarea>',
    init: 'const el = document.getElementById("plain"); window.__lab = { get: () => el.value };' },
  { id: 'contenteditable', name: 'Plain contenteditable', usedBy: 'control: simple rich-text boxes', kind: 'inline',
    body: '<div id="plain" contenteditable="true" role="textbox" aria-label="Lab editor" style="min-height:160px;border:1px solid #999;padding:8px">Initial content</div>',
    init: 'const el = document.getElementById("plain"); window.__lab = { get: () => el.innerText };' },
  { id: 'monaco', name: 'Monaco', usedBy: 'VS Code for the Web, GitHub Codespaces, many code playgrounds', kind: 'bundle', extra: ['monaco-worker'] },
  { id: 'codemirror6', name: 'CodeMirror 6', usedBy: 'GitHub file editor, Replit, Obsidian, Chrome DevTools', kind: 'bundle' },
  { id: 'codemirror5', name: 'CodeMirror 5', usedBy: 'older code and Markdown editors, Jupyter classic', kind: 'bundle' },
  { id: 'ace', name: 'Ace', usedBy: 'AWS Cloud9 and console editors, Wikipedia source editor, Overleaf (legacy)', kind: 'bundle' },
  { id: 'tiptap', name: 'TipTap (ProseMirror)', usedBy: 'Atlassian Jira and Confluence, GitLab, many AI chat inputs', kind: 'bundle' },
  { id: 'lexical', name: 'Lexical', usedBy: 'Facebook, WhatsApp Web, Reddit', kind: 'bundle' },
  { id: 'slate', name: 'Slate', usedBy: 'Discord, GitBook, Sanity', kind: 'bundle' },
  { id: 'quill', name: 'Quill', usedBy: 'Slack, LinkedIn, Salesforce', kind: 'bundle' },
  { id: 'draft', name: 'Draft.js', usedBy: 'older Facebook and React apps', kind: 'bundle' },
  { id: 'tinymce', name: 'TinyMCE', usedBy: 'WordPress classic editor, many CMS back ends', kind: 'inline',
    body: '<textarea id="tiny">Initial content</textarea>',
    scripts: ['/lib/tinymce/tinymce.min.js'],
    init: 'tinymce.init({ target: document.getElementById("tiny"), license_key: "gpl", promotion: false, branding: false, height: 260,'
      + ' setup: (ed) => ed.on("init", () => { window.__lab = { get: () => ed.getContent({ format: "text" }) }; }) });' },
  { id: 'ckeditor5', name: 'CKEditor 5', usedBy: 'Drupal, many enterprise CMS and help desks', kind: 'inline',
    scripts: ['/lib/ckeditor5/dist/browser/ckeditor5.umd.js'], styles: ['/lib/ckeditor5/dist/browser/ckeditor5.css'],
    init: 'const { ClassicEditor, Essentials, Paragraph, Bold, Italic, List, Heading } = CKEDITOR;'
      + ' ClassicEditor.create(document.getElementById("host"), { licenseKey: "GPL", plugins: [Essentials, Paragraph, Bold, Italic, List, Heading],'
      + ' toolbar: ["heading", "bold", "italic", "bulletedList"], initialData: "<p>Initial content</p>" }).then((ed) => {'
      + ' const text = () => [...Object.assign(document.createElement("div"), { innerHTML: ed.getData().replace(/<br[^>]*>/g, "\\n") }).children].map((b) => b.textContent).join("\\n");'
      + ' window.__lab = { get: text }; });' },
  { id: 'trix', name: 'Trix', usedBy: 'Basecamp, HEY, Rails Action Text apps', kind: 'bundle' },
  { id: 'editorjs', name: 'Editor.js', usedBy: 'block editors in the style of Notion', kind: 'bundle' },
];

const TYPES = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.png': 'image/png', '.map': 'application/json',
};

/** Bundles every fixture that needs it into build/. */
export async function buildFixtures() {
  mkdirSync(BUILD, { recursive: true });
  const entries = FIXTURES.filter((f) => f.kind === 'bundle').flatMap((f) => [f.id, ...(f.extra ?? [])]);
  await build({
    entryPoints: entries.map((id) => join(HERE, 'fixtures', `${id}.js`)),
    outdir: BUILD,
    bundle: true,
    format: 'esm',
    target: 'chrome120',
    loader: { '.ttf': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
    define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
  });
}

function pageFor(fixture) {
  const styles = [...(fixture.styles ?? [])];
  const scripts = [...(fixture.scripts ?? [])];
  let boot = fixture.init ? `<script>${fixture.init}</script>` : '';
  if (fixture.kind === 'bundle') {
    if (existsSync(join(BUILD, `${fixture.id}.css`))) styles.push(`/build/${fixture.id}.css`);
    boot = `<script type="module" src="/build/${fixture.id}.js"></script>`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Editor lab: ${fixture.name}</title>
${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
<style>body { font: 15px system-ui, sans-serif; margin: 24px; } #host { width: 760px; min-height: 260px; }</style>
</head>
<body>
<h1>${fixture.name}</h1>
<p>Editor under test. Used by: ${fixture.usedBy}.</p>
${fixture.body ?? ''}
<div id="host"${fixture.id === 'monaco' || fixture.id === 'ace' ? ' style="height:260px"' : ''}></div>
<p>End of the page.</p>
${scripts.map((src) => `<script src="${src}"></script>`).join('\n')}
${boot}
</body>
</html>`;
}

function fileUnder(root, relative) {
  const path = normalize(join(root, relative));
  if (!path.startsWith(root + sep)) return null;
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

/** Builds the fixtures and serves them on 127.0.0.1. */
export async function startLab(port = 0) {
  await buildFixtures();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://lab');
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    if (url.pathname === '/') {
      return send(200, TYPES['.html'], `<!doctype html><title>Editor lab</title><h1>Editor lab</h1><ul>${
        FIXTURES.map((f) => `<li><a href="/e/${f.id}">${f.name}</a></li>`).join('')}</ul>`);
    }
    const page = /^\/e\/([\w-]+)$/.exec(url.pathname);
    const fixture = page && FIXTURES.find((f) => f.id === page[1]);
    if (fixture) return send(200, TYPES['.html'], pageFor(fixture));
    const file = url.pathname.startsWith('/build/') ? fileUnder(BUILD, url.pathname.slice(7))
      : url.pathname.startsWith('/lib/') ? fileUnder(MODULES, url.pathname.slice(5)) : null;
    if (file) return send(200, TYPES[extname(file)] ?? 'application/octet-stream', readFileSync(file));
    return send(404, 'text/plain', 'not found');
  });
  await new Promise((done) => server.listen(port, '127.0.0.1', done));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lab = await startLab(Number(process.env.PORT ?? 8940));
  console.log(`Editor lab: ${lab.origin}/`);
}
