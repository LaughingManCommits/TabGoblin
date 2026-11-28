// Renders every Mermaid block of the pages with Mermaid in a headless Chrome, and reports the
// blocks that do not parse: a semicolon that ends a message early, a participant that is not
// declared, a block that is not closed. Looking at the pictures is still the reader's part.
//   MERMAID=<folder>/node_modules/mermaid/dist/mermaid.min.js node docs/agents/check-diagrams.mjs
// Mermaid is not a dependency of the repository (its own dependencies carry advisories that the
// Dependencies job would fail on): install it outside the tree, pinned to the version the pages
// were last rendered with, and name the file in MERMAID. The browser driver is the end-to-end
// suite's (npm install in e2e); TABGOBLIN_CHROME names another Chrome, as for the suite.
// With OUT=<folder>, each block is also written there as an SVG, to open.

import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mermaidFile = process.env.MERMAID;
if (!mermaidFile) {
  console.log('MERMAID is not set: name the path of mermaid.min.js, installed outside the tree (see docs/agents/runbook.md, "Check the diagrams").');
  process.exit(2);
}
const puppeteer = createRequire(join(ROOT, 'e2e', 'package.json'))('puppeteer-core');

/** Every Mermaid block of the pages, with where it is. */
export function blocks(root = ROOT) {
  const pages = ['README.md', ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
  const found = [];
  for (const page of pages) {
    const text = readFileSync(join(root, page), 'utf8');
    for (const m of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
      found.push({ where: `${page}:${text.slice(0, m.index).split('\n').length}`, code: m[1] });
    }
  }
  return found;
}

const all = blocks();
const browser = await puppeteer.launch({
  ...(process.env.TABGOBLIN_CHROME ? { executablePath: process.env.TABGOBLIN_CHROME } : { channel: 'chrome' }),
  headless: true, args: ['--no-sandbox'],
});
let bad = 0;
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: resolve(mermaidFile) });
  let version = 'of an unknown version';
  try {
    version = JSON.parse(readFileSync(resolve(mermaidFile, '..', '..', 'package.json'), 'utf8')).version;
  } catch {
    // The file is not inside the package: the version is not known, which is said.
  }
  await page.evaluate(() => mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }));
  if (process.env.OUT) mkdirSync(process.env.OUT, { recursive: true });
  for (const [i, block] of all.entries()) {
    const result = await page.evaluate(async ([code, id]) => {
      try {
        const { svg } = await mermaid.render(id, code);
        return { svg };
      } catch (e) {
        return { error: String(e?.message ?? e).split('\n').slice(0, 2).join(' ') };
      }
    }, [block.code, `d${i}`]);
    if (result.error) {
      bad += 1;
      console.log(`${block.where}: ${result.error}`);
    } else if (process.env.OUT) {
      writeFileSync(join(process.env.OUT, `${block.where.replace(/[/:.]/g, '-')}.svg`), result.svg);
    }
  }
  console.log(`${all.length} Mermaid blocks, ${bad} do not parse (Mermaid ${version})`);
} finally {
  await browser.close();
}
process.exit(bad ? 1 : 0);
