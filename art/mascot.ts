// Writes every picture of the goblin from what art/goblin.ts draws: the icons of the extension
// (which are also the server's window icon), the panel's animated sprite sheet and its index, the
// README's logo, and the picture of them all for the documentation. Run `node art/mascot.ts` from the repository's
// root after a change. `chrome-extension/test/mascot.test.ts` fails when a file in the tree no
// longer shows what is drawn.
//
// Everything is pixels on whole coordinates: a part is a grid of letters, one letter a pixel, and
// a picture is parts put down at whole offsets. Nothing is smoothed, scaled by a fraction or
// blended; a larger icon is the same pixels, each made a square of 2, 3, 4 or 8.

import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANIMATIONS, CELL, FACE_16, FACE_24, FACE_32, PALETTE, type Grid } from './goblin.ts';

export { ANIMATIONS, CELL, PALETTE };

// ---------------------------------------------------------------- pictures

/** A picture as pixels: RGBA, four bytes each, row after row. */
export interface Picture { width: number; height: number; rgba: Uint8Array }

function blank(width: number, height: number, ground?: string): Picture {
  const rgba = new Uint8Array(width * height * 4);
  if (ground) for (let i = 0; i < width * height; i++) rgba.set(colour(ground), i * 4);
  return { width, height, rgba };
}

function colour(letter: string): [number, number, number, number] {
  const hex = PALETTE[letter];
  if (!hex) throw new Error(`no colour for "${letter}"`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}

/** Puts a grid into a picture, each pixel a square of `scale`. */
function paint(picture: Picture, grid: Grid, x: number, y: number, scale = 1): void {
  grid.forEach((line, row) => [...line].forEach((letter, col) => {
    if (letter === '.') return;
    const rgba = colour(letter);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const at = ((y + row * scale + dy) * picture.width + x + col * scale + dx) * 4;
      picture.rgba.set(rgba, at);
    }
  }));
}

/** An icon: 16 and 24 are their own drawings, 32 the owner's; a larger one is one of them in whole squares. */
export function icon(size: number): Picture {
  const [grid, scale]: [Grid, number] = size % 32 === 0 ? [FACE_32, size / 32] : size % 24 === 0 ? [FACE_24, size / 24] : [FACE_16, size / 16];
  const picture = blank(size, size);
  paint(picture, grid, 0, 0, scale);
  return picture;
}

/**
 * The README's logo: the 32-pixel face trimmed to its edges, at three times, with clear room on
 * its right, where the text beside it begins (a README keeps no margin of its own). It is shown at
 * its own size there, so no one scales it.
 */
function logo(): Picture {
  const rows = FACE_32.filter((row) => row.replace(/\./g, ''));
  const first = Math.min(...rows.map((row) => row.search(/[^.]/)));
  const last = Math.max(...rows.map((row) => row.length - [...row].reverse().join('').search(/[^.]/) - 1));
  const face = rows.map((row) => row.slice(first, last + 1));
  const picture = blank(face[0].length * 3 + 14, face.length * 3);
  paint(picture, face, 0, 0, 3);
  return picture;
}

/** The sprite sheet: a row for each animation, a 32-pixel cell for each frame. */
function sheet(): Picture {
  const picture = blank(CELL * Math.max(...ANIMATIONS.map((a) => a.frames.length)), CELL * ANIMATIONS.length);
  ANIMATIONS.forEach((animation, row) => animation.frames.forEach((grid, col) => paint(picture, grid, col * CELL, row * CELL)));
  return picture;
}

/** What the panel needs to know of the sheet: for each animation its row, its frames and their time. */
function sheetIndex(): string {
  return '# Written by art/mascot.ts: the rows of mascot.png, a 32-pixel cell for each frame.\n'
    + '# name=row frames milliseconds, and "hold" where the first frame is held and the others come now and then.\n'
    + ANIMATIONS.map((a, row) => `${a.name}=${row} ${a.frames.length} ${a.ms}${a.hold ? ' hold' : ''}\n`).join('');
}

/**
 * The picture for the documentation: the icons as they are, then each animation's frames at
 * their own size and below that three times as large, on the panel's ground.
 */
function preview(): Picture {
  const gap = 8;
  const icons = [16, 32, 48, 128];
  const widest = Math.max(...ANIMATIONS.map((a) => a.frames.length));
  const width = gap + widest * (CELL * 3 + gap);
  const height = gap + 128 + gap * 3 + ANIMATIONS.length * (CELL + gap + CELL * 3 + gap * 3);
  const picture = blank(width, height, 'O');
  let x = gap;
  for (const size of icons) {
    const shown = icon(size);
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
      const from = (row * size + col) * 4;
      if (shown.rgba[from + 3]) picture.rgba.set(shown.rgba.subarray(from, from + 4), ((gap + 128 - size + row) * width + x + col) * 4);
    }
    x += size + gap * 2;
  }
  let y = gap + 128 + gap * 3;
  for (const animation of ANIMATIONS) {
    animation.frames.forEach((grid, col) => {
      paint(picture, grid, gap + col * (CELL + gap), y);
      paint(picture, grid, gap + col * (CELL * 3 + gap), y + CELL + gap, 3);
    });
    y += CELL + gap + CELL * 3 + gap * 3;
  }
  return picture;
}

// ---------------------------------------------------------------- PNG

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A picture as a PNG: eight bits for each of red, green, blue and alpha, rows unfiltered. */
export function png(picture: Picture): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(picture.width, 0);
  header.writeUInt32BE(picture.height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((picture.width * 4 + 1) * picture.height);
  for (let row = 0; row < picture.height; row++) {
    raw.set(picture.rgba.subarray(row * picture.width * 4, (row + 1) * picture.width * 4), row * (picture.width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

/** The pixels of a PNG this file wrote: for the test, which compares pixels and not the compression. */
export function unpng(file: Uint8Array): Picture {
  const bytes = Buffer.from(file);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    if (raw[row * (width * 4 + 1)] !== 0) throw new Error('a filtered row: not a file of this script');
    rgba.set(raw.subarray(row * (width * 4 + 1) + 1, (row + 1) * (width * 4 + 1)), row * width * 4);
  }
  return { width, height, rgba };
}

// ---------------------------------------------------------------- the files

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file this draws, by its path from the repository's root, as pixels or as text. */
export function outputs(): Map<string, Picture | string> {
  const files = new Map<string, Picture | string>();
  for (const size of [16, 32, 48, 128]) files.set(`chrome-extension/icons/icon${size}.png`, icon(size));
  files.set('java-server/src/main/resources/browsercontext/mascot.png', sheet());
  files.set('java-server/src/main/resources/browsercontext/mascot.properties', sheetIndex());
  files.set('docs/images/mascot.png', preview());
  files.set('docs/images/logo.png', logo());
  return files;
}

/** The sizes of the icon of the program in the Windows download: what Windows asks for, from a list's row to a large tile. */
export const WINDOWS_ICON_SIZES = [16, 24, 32, 48, 64, 256];

/**
 * The goblin's face as a Windows icon file, for the program in the download. It is made when a
 * download is made (release/bundle.sh) and is not kept in the tree. The largest picture is a PNG,
 * as Windows wants it; the others are plain bitmaps, which every reader of such a file knows.
 */
export function windowsIcon(): Buffer {
  const entries = WINDOWS_ICON_SIZES.map((size) => ({ size, data: size >= 256 ? png(icon(size)) : bitmap(icon(size)) }));
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, index) => {
    const at = 6 + 16 * index;
    // A side of 256 is written as 0.
    head.writeUInt8(size % 256, at);
    head.writeUInt8(size % 256, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((entry) => entry.data)]);
}

/** A picture as an icon file holds a bitmap: rows from the bottom up, blue first, and a mask of the clear pixels after them. */
function bitmap(picture: Picture): Buffer {
  const { width, height, rgba } = picture;
  const maskRow = Math.ceil(width / 32) * 4;
  const out = Buffer.alloc(40 + width * height * 4 + maskRow * height);
  out.writeUInt32LE(40, 0);
  out.writeInt32LE(width, 4);
  // The height counts the picture and its mask.
  out.writeInt32LE(height * 2, 8);
  out.writeUInt16LE(1, 12);
  out.writeUInt16LE(32, 14);
  out.writeUInt32LE(width * height * 4 + maskRow * height, 20);
  for (let y = 0; y < height; y++) {
    const row = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = 40 + (row * width + x) * 4;
      out[to] = rgba[from + 2];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from];
      out[to + 3] = rgba[from + 3];
      if (rgba[from + 3] === 0) out[40 + width * height * 4 + row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

export function repositoryPath(path: string): string {
  return resolve(ROOT, path);
}

if (process.argv[1] && resolve(process.argv[1]) === repositoryPath('art/mascot.ts') && process.argv[2] === '--windows-icon') {
  // node art/mascot.ts --windows-icon <file>: only the icon file, to where the download is made.
  if (!process.argv[3]) throw new Error('--windows-icon needs the file to write');
  writeFileSync(resolve(process.argv[3]), windowsIcon());
  console.log(process.argv[3]);
} else if (process.argv[1] && resolve(process.argv[1]) === repositoryPath('art/mascot.ts')) {
  for (const [path, content] of outputs()) {
    mkdirSync(dirname(repositoryPath(path)), { recursive: true });
    writeFileSync(repositoryPath(path), typeof content === 'string' ? content : png(content));
    console.log(path);
  }
}
