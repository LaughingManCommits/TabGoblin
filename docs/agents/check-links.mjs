// Checks that relative links in the Markdown files resolve to files, and their #anchors to headings.
//   node docs/agents/check-links.mjs        from the repository root
// Prints each broken link and exits 1, or prints the number of links checked.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.idea']);

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

// Text outside fenced code blocks, where links and headings count. Links in `code` are examples.
const prose = (file) => readFileSync(file, 'utf8').split(/^```.*$/m).filter((_, i) => i % 2 === 0).join('\n');

// GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens.
const anchors = (file) => new Set([...prose(file).matchAll(/^#{1,6}\s+(.+)$/gm)]
  .map((m) => m[1].trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-')));

let checked = 0;
const broken = [];
for (const file of markdownFiles(ROOT)) {
  for (const [, target] of prose(file).replace(/`[^`\n]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:, ...
    checked += 1;
    const [path, anchor] = target.split('#');
    const to = path ? resolve(dirname(file), path) : file;
    if (!existsSync(to)) broken.push(`${file}: ${target} (no such file)`);
    else if (anchor && to.endsWith('.md') && !anchors(to).has(anchor)) broken.push(`${file}: ${target} (no such heading)`);
  }
}

for (const line of broken) console.log(line);
console.log(broken.length ? `${broken.length} broken of ${checked} links` : `${checked} links, all resolve`);
process.exit(broken.length ? 1 : 0);
