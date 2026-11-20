// Bundles the extension into dist/ (load that folder as an unpacked extension).
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/background.ts', 'src/content.ts', 'src/popup.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  logLevel: 'info',
});

for (const file of ['manifest.json', 'src/popup.html', 'src/popup.css']) {
  await cp(file, `dist/${file.split('/').pop()}`);
}
await cp('icons', 'dist/icons', { recursive: true });
