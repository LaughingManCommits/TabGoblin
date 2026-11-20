// Renders the extension's icon PNGs from chrome-extension/icons/goblin.svg, using the installed
// Chrome. Run after changing the SVG:  node make-icons.mjs

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ICONS = resolve(dirname(fileURLToPath(import.meta.url)), '../chrome-extension/icons');
const svg = readFileSync(resolve(ICONS, 'goblin.svg'), 'utf8');

const browser = await puppeteer.launch({
  ...(process.env.BCMCP_CHROME ? { executablePath: process.env.BCMCP_CHROME } : { channel: 'chrome' }),
  headless: true,
});
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: resolve(ICONS, `icon${size}.png`), omitBackground: true });
    console.log(`icon${size}.png`);
  }
} finally {
  await browser.close();
}
