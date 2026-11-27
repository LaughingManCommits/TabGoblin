// The goblin's pictures are written by art/mascot.ts, and by nothing else: each file in the tree
// must show what it draws. Pixels are compared, not bytes, since the compression may differ
// between versions of zlib.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANIMATIONS, CELL, PALETTE, WINDOWS_ICON_SIZES, icon, outputs, repositoryPath, unpng, windowsIcon } from '../../art/mascot.ts';
import { FACE_16, FACE_24 } from '../../art/goblin.ts';

test('every picture of the goblin in the tree is what art/mascot.ts draws', () => {
  for (const [path, drawn] of outputs()) {
    const file = readFileSync(repositoryPath(path));
    if (typeof drawn === 'string') {
      // The words are compared, not the line ends: a checkout on Windows gives a text file the
      // system's own, and the repository holds the file as the script wrote it either way.
      assert.equal(file.toString('utf8').replaceAll('\r\n', '\n'), drawn, `${path}: run node art/mascot.ts`);
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

test('the Windows icon file holds the face of the goblin at each of its sizes, pixel for pixel', () => {
  const file = windowsIcon();
  assert.deepEqual([file.readUInt16LE(0), file.readUInt16LE(2), file.readUInt16LE(4)], [0, 1, WINDOWS_ICON_SIZES.length]);
  WINDOWS_ICON_SIZES.forEach((size, index) => {
    const at = 6 + 16 * index;
    assert.equal(file.readUInt8(at) || 256, size);
    const data = file.subarray(file.readUInt32LE(at + 12), file.readUInt32LE(at + 12) + file.readUInt32LE(at + 8));
    const drawn = icon(size);
    if (size >= 256) {
      assert.ok(Buffer.from(unpng(data).rgba).equals(Buffer.from(drawn.rgba)), `the picture of ${size}`);
      return;
    }
    assert.deepEqual([data.readUInt32LE(0), data.readInt32LE(4), data.readInt32LE(8), data.readUInt16LE(14)], [40, size, size * 2, 32]);
    const maskRow = Math.ceil(size / 32) * 4;
    assert.equal(data.length, 40 + size * size * 4 + maskRow * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = (y * size + x) * 4;
        const to = 40 + ((size - 1 - y) * size + x) * 4;
        assert.deepEqual([data[to + 2], data[to + 1], data[to], data[to + 3]], [...drawn.rgba.subarray(from, from + 4)], `${size}: ${x},${y}`);
        const masked = (data[40 + size * size * 4 + (size - 1 - y) * maskRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
        assert.equal(masked, drawn.rgba[from + 3] === 0, `${size}: the mask at ${x},${y}`);
      }
    }
  });
});

test('each animation has frames of one size, and the goblin stands 22 pixels high', () => {
  assert.deepEqual(ANIMATIONS.map((a) => a.name),
    ['idle', 'working', 'reading', 'walking', 'sleeping', 'confused', 'waiting', 'guarding']);
  for (const animation of ANIMATIONS) {
    // At rest it holds one frame and blinks; what goes round has four to eight.
    const frames = animation.frames.length;
    assert.ok(animation.hold ? animation.name === 'idle' && frames === 2 : frames >= 4 && frames <= 8, `${animation.name}: ${frames}`);
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

test('the faces the owner did not draw are the same on both sides, but for the light in the eyes', () => {
  for (const face of [FACE_16, FACE_24]) {
    for (const row of face) {
      const plain = row.replace(/w/g, 'o');
      assert.equal(plain, [...plain].reverse().join(''), row);
    }
  }
});
