// The goblin: the one source of every picture of it. The icons of the extension, the server's
// window icon and the panel's animated sprite sheet are all written from what is drawn here, and
// nothing else draws it. Run `node art/mascot.ts` from the repository's root after a change; it
// rewrites the files listed in OUTPUTS. `chrome-extension/test/mascot.test.ts` fails when a file
// in the tree no longer shows what this draws.
//
// Everything is pixels on whole coordinates: a part is a grid of letters, one letter a pixel, and
// a picture is parts put down at whole offsets. Nothing is smoothed, scaled by a fraction or
// blended; a larger icon is the same pixels, each made a square of 2, 3, 4 or 8.

import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The colours, as the popup and the panel have them, and the few the clothes and tools add. */
export const PALETTE: Readonly<Record<string, string>> = {
  O: '#09140e', // the outer edge, darker than the cave
  o: '#12201a', // outline, eyes, mouth
  g: '#63d68f', // skin
  s: '#4fc27b', // skin in shadow
  e: '#298b53', // inside the ears
  w: '#f4fff8', // highlights, fangs
  y: '#f3c25c', // gold
  h: '#3e6b4b', // tunic: muted forest green
  H: '#2c4f37', // tunic in shadow
  b: '#7a5434', // leather
  B: '#553923', // leather in shadow, boots
  m: '#b4c2ba', // iron
  M: '#73847a', // iron in shadow, stone
  p: '#eadfb8', // parchment
  P: '#c4ad78', // parchment's rolled edge
};

type Grid = readonly string[];

// ---------------------------------------------------------------- the icon

/** The face at 32 pixels: the icon as the owner drew it. 48, 64, 128 and 256 are this, in whole squares. */
const FACE_32: Grid = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............ssssssss............',
  '..........sssssssssssss.........',
  '.OOOOO....ssggggggggsss...OOOOO.',
  '.OsssssOssssgggggggggggsssssssO.',
  '.OssssssssgggggggggggggsssssssO.',
  '.Osseeeessgggggggggggggsseeess..',
  '...OeeeessggggggggggggggseeeO...',
  '...Ossssggggggggggggggggssss....',
  '.....OssggoooogggggoooogssO.....',
  '.....Ossgooowwogggooowwoss......',
  '......ssgooowwogggooowwoss......',
  '......ssgoooooogggooooooss......',
  '......ssggoooogggggoooogss......',
  '......ssggggggggggggggssss......',
  '......sssgoogggggggggoosO.......',
  '.......OsgoowwoooooowwosO.......',
  '.......OsgggwwoooooowwssO.......',
  '.......OsssswggggggswO..........',
  '..........OssssssssssO..........',
  '..........OOOOOOOOOOOO..........',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

/**
 * The face at 16 pixels, drawn again rather than shrunk: ears, two eyes with their light, and the
 * fangs, each still there in a toolbar. It is also the head of the goblin in the sprites.
 */
const FACE_16: Grid = [
  '................',
  '................',
  '................',
  '.....ssssss.....',
  'OOO.ssggggss.OOO',
  'OsssssggggggsssO',
  'OseesggggggseesO',
  '.OeesggggggseeO.',
  '..OsoowggoowsO..',
  '...soooggooos...',
  '...soooggooos...',
  '...OsowoowosO...',
  '....OswggwsO....',
  '....OOOOOOOO....',
  '................',
  '................',
];

// ---------------------------------------------------------------- the goblin in full

/** The head: the 16-pixel face from the top of its brow to its chin, 16 wide and 11 high. */
const HEAD: Grid = FACE_16.slice(3, 14);

/** An eye as it can be: three rows of three, written over each eye of the head (rows 5 to 7 of HEAD). */
const EYES: Readonly<Record<string, Grid>> = {
  open: ['oow', 'ooo', 'ooo'],
  left: ['woo', 'ooo', 'ooo'],
  down: ['ooo', 'ooo', 'oow'],
  shut: ['ggg', 'ooo', 'ggg'],
};

const TORSO: Grid = [
  '.OhhyyhhO.',
  'OhhhhhhbhO',
  'OHhhhhbhHO',
  'ObbbyybbbO',
  'OhhhhhhhhO',
  'OHhhhhhhHO',
  '.OOOOOOOO.',
];

const LEGS: Grid = [
  'ObbOObbO',
  'ObbOObbO',
  'OBBOOBBO',
  'OOOOOOOO',
];

/** A leg lifted while walking: the boot is up by one, and under it is nothing. */
const LEG_UP: Grid = ['ObbO', 'OBBO', 'OOOO', '....'];

const ARM: Grid = ['Oh', 'Oh', 'Oh', 'Og', 'OO'];
const SATCHEL: Grid = ['.bb.', 'ObbO', 'OByO', 'OBBO', 'OOOO'];

/** The pickaxe in three places of a swing, each with the hand that holds it. */
const PICK_UP: Grid = [
  '.MmmmmM.',
  'M..b...M',
  '...b....',
  '..b.....',
  '..b.....',
  '.b......',
  'Og......',
];
const PICK_LEVEL: Grid = [
  '.......M',
  '.......m',
  'Ogbbbbbm',
  '.......m',
  '.......M',
];
const PICK_DOWN: Grid = [
  'Og.....',
  '..b....',
  '...b...',
  '....b..',
  '...Mmm.',
  '.....mM',
];
const STONE: Grid = ['.MMM.', 'MMMMM'];
const SPARK: Grid = ['y.y', '.w.', 'y.y'];

const SCROLL: Grid = [
  'PPPPPPPPPP',
  'OpppppppPO',
  'gpoooopp.g',
  'Opppppppp.',
  'gpooopppPg',
  'PPPPPPPPPP',
];

const QUESTION: Grid = ['yyy', '..y', '.yy', '...', '.y.'];
const Z_SMALL: Grid = ['www', '..w', '.w.', 'www'];
const Z_LARGE: Grid = ['wwww', '...w', '..w.', '.w..', 'wwww'];

// ---------------------------------------------------------------- frames

/** A picture of letters, transparent where a part leaves a '.'. */
class Canvas {
  readonly width: number;
  readonly height: number;
  readonly rows: string[][];
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  }
  put(grid: Grid, x: number, y: number): this {
    grid.forEach((line, dy) => [...line].forEach((pixel, dx) => {
      const [px, py] = [x + dx, y + dy];
      if (pixel !== '.' && px >= 0 && py >= 0 && px < this.width && py < this.height) this.rows[py][px] = pixel;
    }));
    return this;
  }
  grid(): Grid {
    return this.rows.map((row) => row.join(''));
  }
}

/** The head with these eyes, on the goblin's right (our left) and on its left. */
function head(right: keyof typeof EYES, left = right): Grid {
  return HEAD.map((line, row) => row < 5 || row > 7 ? line
    : line.slice(0, 4) + EYES[right][row - 5] + line.slice(7, 9) + EYES[left][row - 5] + line.slice(12));
}

interface Pose {
  eyes?: keyof typeof EYES;
  /** The other eye, where it is not as the first. */
  other?: keyof typeof EYES;
  /** The head and the body lower by this much: breathing, a step, sleep. */
  sink?: number;
  /** The head to the side by this much. */
  tilt?: number;
  leg?: 'left' | 'right';
  /** The arm on the goblin's left, our right, raised by this much while walking. */
  swing?: number;
  /** What the hands hold, in place of the arms that hang. */
  holds?: 'pick-up' | 'pick-level' | 'pick-down' | 'scroll';
  extra?: readonly (readonly [Grid, number, number])[];
}

/** The cell all frames are drawn in, and where the goblin stands in it: the soles on row 28. */
export const CELL = 32;

/** One frame of the goblin, 32 by 32, standing 22 pixels high. */
function frame(pose: Pose): Grid {
  const canvas = new Canvas(CELL, CELL);
  const sink = pose.sink ?? 0;
  const tilt = pose.tilt ?? 0;
  // Legs first; the body comes down over their tops.
  if (pose.leg === 'left') canvas.put(LEGS.slice(0, 1), 12, 25).put(['ObbO', 'OBBO', 'OOOO'], 16, 26).put(LEG_UP, 12, 25);
  else if (pose.leg === 'right') canvas.put(LEGS.slice(0, 1), 12, 25).put(['ObbO', 'OBBO', 'OOOO'], 12, 26).put(LEG_UP, 16, 25);
  else canvas.put(LEGS, 12, 25);
  canvas.put(SATCHEL, 7, 21 + sink);
  canvas.put(TORSO, 11, 18 + sink);
  const swing = pose.swing ?? 0;
  if (pose.holds !== 'scroll') canvas.put(ARM, 9, 19 + sink + Math.max(0, -swing));
  if (!pose.holds) canvas.put(ARM.map((line) => [...line].reverse().join('')), 21, 19 + sink - Math.max(0, swing));
  canvas.put(head(pose.eyes ?? 'open', pose.other), 8 + tilt, 7 + sink);
  switch (pose.holds) {
    case 'pick-up': canvas.put(PICK_UP, 21, 13 + sink); break;
    case 'pick-level': canvas.put(PICK_LEVEL, 21, 17 + sink); break;
    case 'pick-down': canvas.put(PICK_DOWN, 21, 20 + sink); break;
    case 'scroll': canvas.put(SCROLL, 11, 19 + sink); break;
  }
  for (const [grid, x, y] of pose.extra ?? []) canvas.put(grid, x, y);
  return canvas.grid();
}

/** What the panel can show, in the order of the sheet's rows, and how long each frame stays. */
export const ANIMATIONS: readonly { name: string; ms: number; frames: readonly Grid[] }[] = [
  {
    // Breathing: down a pixel and up again, and one blink in each breath.
    name: 'idle', ms: 260, frames: [
      frame({}), frame({}), frame({ eyes: 'shut' }), frame({}),
      frame({ sink: 1 }), frame({ sink: 1 }), frame({ sink: 1 }), frame({ sink: 1 }),
    ],
  },
  {
    // Mining: up, through and down on the stone, where it sparks, and up again.
    name: 'working', ms: 130, frames: [
      frame({ holds: 'pick-up', extra: [[STONE, 26, 27]] }),
      frame({ holds: 'pick-up', extra: [[STONE, 26, 27]] }),
      frame({ holds: 'pick-level', extra: [[STONE, 26, 27]] }),
      frame({ holds: 'pick-down', sink: 1, extra: [[STONE, 26, 27], [SPARK, 27, 23]] }),
      frame({ holds: 'pick-down', sink: 1, extra: [[STONE, 26, 27]] }),
      frame({ holds: 'pick-level', extra: [[STONE, 26, 27]] }),
    ],
  },
  {
    // Reading a parchment: the eyes go along the lines, and down to the next.
    name: 'reading', ms: 360, frames: [
      frame({ holds: 'scroll', eyes: 'down' }), frame({ holds: 'scroll', eyes: 'down' }),
      frame({ holds: 'scroll', eyes: 'left' }), frame({ holds: 'scroll', eyes: 'left' }),
      frame({ holds: 'scroll', eyes: 'down', sink: 1 }), frame({ holds: 'scroll', eyes: 'shut', sink: 1 }),
    ],
  },
  {
    // Walking on the spot: a step, the body down, the other step.
    name: 'walking', ms: 150, frames: [
      frame({ leg: 'left', swing: 1 }), frame({ sink: 1 }), frame({ leg: 'right', swing: -1 }), frame({ sink: 1 }),
    ],
  },
  {
    // Asleep on its feet: eyes shut, a slow breath, and the z's rising.
    name: 'sleeping', ms: 520, frames: [
      frame({ eyes: 'shut', sink: 1, extra: [[Z_SMALL, 23, 5]] }),
      frame({ eyes: 'shut', sink: 1, extra: [[Z_SMALL, 24, 3]] }),
      frame({ eyes: 'shut', sink: 2, extra: [[Z_SMALL, 23, 5], [Z_LARGE, 26, 0]] }),
      frame({ eyes: 'shut', sink: 2, extra: [[Z_LARGE, 27, 0]] }),
    ],
  },
  {
    // Puzzled: one eye squeezed, the head from side to side, and a question over it.
    name: 'confused', ms: 300, frames: [
      frame({ other: 'shut', tilt: 0, extra: [[QUESTION, 24, 1]] }),
      frame({ other: 'shut', tilt: 1, extra: [[QUESTION, 24, 0]] }),
      frame({ eyes: 'left', other: 'shut', tilt: 0, extra: [[QUESTION, 24, 1]] }),
      frame({ eyes: 'left', other: 'shut', tilt: -1, extra: [[QUESTION, 24, 2]] }),
    ],
  },
];

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

function icon(size: number): Picture {
  const [grid, scale] = size % 32 === 0 ? [FACE_32, size / 32] : [FACE_16, size / 16];
  const picture = blank(size, size);
  paint(picture, grid, 0, 0, scale);
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
    + ANIMATIONS.map((a, row) => `${a.name}=${row} ${a.frames.length} ${a.ms}\n`).join('');
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

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

/** Every file this draws, by its path from the repository's root, as pixels or as text. */
export function outputs(): Map<string, Picture | string> {
  const files = new Map<string, Picture | string>();
  for (const size of [16, 32, 48, 128]) files.set(`chrome-extension/icons/icon${size}.png`, icon(size));
  files.set('java-server/src/main/resources/browsercontext/mascot.png', sheet());
  files.set('java-server/src/main/resources/browsercontext/mascot.properties', sheetIndex());
  files.set('docs/images/mascot.png', preview());
  return files;
}

export function repositoryPath(path: string): string {
  return resolve(ROOT, path);
}

if (process.argv[1] && resolve(process.argv[1]) === repositoryPath('art/mascot.ts')) {
  for (const [path, content] of outputs()) {
    mkdirSync(dirname(repositoryPath(path)), { recursive: true });
    writeFileSync(repositoryPath(path), typeof content === 'string' ? content : png(content));
    console.log(path);
  }
}
