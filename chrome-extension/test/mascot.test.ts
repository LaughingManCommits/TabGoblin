// The goblin's pictures are written by art/mascot.ts, and by nothing else: each file in the tree
// must show what it draws. Pixels are compared, not bytes, since the compression may differ
// between versions of zlib.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANIMATIONS, CELL, PALETTE, outputs, repositoryPath, unpng } from '../../art/mascot.ts';

test('every picture of the goblin in the tree is what art/mascot.ts draws', () => {
  for (const [path, drawn] of outputs()) {
    const file = readFileSync(repositoryPath(path));
    if (typeof drawn === 'string') {
      assert.equal(file.toString('utf8'), drawn, `${path}: run node art/mascot.ts`);
      continue;
    }
    const kept = unpng(file);
    assert.deepEqual([kept.width, kept.height], [drawn.width, drawn.height], path);
    assert.ok(Buffer.from(kept.rgba).equals(Buffer.from(drawn.rgba)), `${path} differs from its drawing: run node art/mascot.ts`);
  }
});

test('the icons have the sizes the manifest names, and are pixels of the palette or clear', () => {
  const manifest = JSON.parse(readFileSync(repositoryPath('chrome-extension/manifest.json'), 'utf8'));
  const named = new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]);
  const colours = new Set(Object.values(PALETTE).map((hex) => hex.slice(1)));
  for (const file of named) {
    const size = Number(/icon(\d+)\.png$/.exec(String(file))?.[1]);
    const icon = unpng(readFileSync(repositoryPath(`chrome-extension/${file}`)));
    assert.deepEqual([icon.width, icon.height], [size, size], String(file));
    for (let at = 0; at < icon.rgba.length; at += 4) {
      const alpha = icon.rgba[at + 3];
      if (alpha === 0) continue;
      assert.equal(alpha, 255, `${file}: a pixel half clear is a smoothed edge`);
      const hex = [...icon.rgba.subarray(at, at + 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
      assert.ok(colours.has(hex), `${file}: #${hex} is not a colour of the palette`);
    }
  }
});

test('each animation has four to eight frames of one size, and the goblin stands 22 pixels high', () => {
  assert.deepEqual(ANIMATIONS.map((a) => a.name), ['idle', 'working', 'reading', 'walking', 'sleeping', 'confused']);
  for (const animation of ANIMATIONS) {
    assert.ok(animation.frames.length >= 4 && animation.frames.length <= 8, `${animation.name}: ${animation.frames.length}`);
    for (const frame of animation.frames) {
      assert.equal(frame.length, CELL);
      for (const row of frame) assert.equal(row.length, CELL);
    }
  }
  // Standing at rest: from the brow's first pixel to the soles.
  const rest = ANIMATIONS[0].frames[0];
  const filled = rest.map((row, y) => (row.replace(/\./g, '') ? y : -1)).filter((y) => y >= 0);
  assert.equal(filled.at(-1)! - filled[0] + 1, 22);
});
