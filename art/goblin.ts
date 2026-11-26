// The goblin, as data: the palette, every part as a grid of letters (one letter a pixel), and the
// frames of each animation put together from the parts at whole offsets. Nothing here reads or
// writes a file, so the extension's code can draw from it as well (the notice in the page draws
// the 16-pixel face). `art/mascot.ts` writes the pictures.

/** The colours, as the popup and the panel have them, and the few that clothes, tools and marks add. */
export const PALETTE: Readonly<Record<string, string>> = {
  O: '#09140e', // the outer edge, darker than the cave
  o: '#12201a', // outline, eyes, mouth
  g: '#63d68f', // skin
  s: '#4fc27b', // skin in shadow
  e: '#298b53', // inside the ears
  w: '#f4fff8', // highlights, fangs
  y: '#f3c25c', // gold
  r: '#78b28a', // light on the tunic's edge, so the body stands out on the dark ground
  h: '#4e8560', // tunic: muted forest green
  H: '#3a6849', // tunic in shadow
  b: '#7a5434', // leather, wood
  B: '#553923', // leather in shadow, boots
  m: '#b4c2ba', // iron
  M: '#73847a', // iron in shadow, stone
  p: '#eadfb8', // parchment
  P: '#c4ad78', // parchment's rolled edge
  z: '#8fa497', // the z of sleep: quiet
};

export type Grid = readonly string[];

// ---------------------------------------------------------------- the face

/** The face at 32 pixels: the icon as the owner drew it. 64, 128 and 256 are this in whole squares. */
export const FACE_32: Grid = [
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

/** The face at 24 pixels, drawn from the 32 one: the 48-pixel icon is this, each pixel a square of two. */
export const FACE_24: Grid = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........ssssssss........',
  '......ssssssssssss......',
  '.OOO..ssggggggggss..OOO.',
  '.OsssssggggggggggsssssO.',
  '.OseeesggggggggggseeesO.',
  '..OeeesggggggggggseeeO..',
  '....OsgooooggoooogsO....',
  '....OsgoowwggoowwgsO....',
  '....OsgoowwggoowwgsO....',
  '....OsggooggggooggsO....',
  '....OsggggggggggggsO....',
  '....OsgoggggggggogsO....',
  '....OsgoowoooowoogsO....',
  '....OssggwggggwggssO....',
  '.....OssssssssssssO.....',
  '......OOOOOOOOOOOO......',
  '........................',
  '........................',
  '........................',
  '........................',
];

/**
 * The face at 16 pixels, drawn again rather than shrunk: ears, two eyes each with a light of two by two,
 * and the fangs, each still there in a toolbar. It is also the head of the goblin in the sprites,
 * and the goblin of the notice in the page.
 */
export const FACE_16: Grid = [
  '................',
  '................',
  '................',
  '.....ssssss.....',
  'OOO.ssggggss.OOO',
  'OssssggggggssssO',
  'OseesggggggseesO',
  '.OeesggggggseeO.',
  '..OsowwggowwsO..',
  '...sowwggowws...',
  '...soooggooos...',
  '...OsowoowosO...',
  '....OswggwsO....',
  '....OOOOOOOO....',
  '................',
  '................',
];

/** The rows and columns of the 16-pixel face's eyes: three by three, the left one from column 4, the right from 9. */
export const EYE_ROWS = [8, 9, 10] as const;
export const EYE_COLUMNS = [4, 9] as const;

// ---------------------------------------------------------------- the goblin in full

/** The head: the 16-pixel face from the top of its brow to its chin, 16 wide and 11 high. */
const HEAD: Grid = FACE_16.slice(3, 14);

/** An eye as it can be, three rows of three. Where its light is, is where it looks. */
const EYES: Readonly<Record<string, Grid>> = {
  open: ['oww', 'oww', 'ooo'],
  left: ['wwo', 'wwo', 'ooo'],
  downLeft: ['ooo', 'wwo', 'wwo'],
  downRight: ['ooo', 'oww', 'oww'],
  shut: ['ggg', 'ooo', 'ggg'],
};
type Eyes = keyof typeof EYES;

const TORSO: Grid = [
  '.OrryyrrO.',
  'OrhhhhhhHO',
  'OrhhhhhhHO',
  'ObbbyybbbO',
  'OrhhhhhhHO',
  'OHhhhhhhHO',
  '.OOOOOOOO.',
];

const LEG: Grid = ['ObbO', 'ObbO', 'OBBO', 'OOOO'];
const ARM_LEFT: Grid = ['Or', 'Or', 'Oh', 'Og', 'OO'];
const ARM_RIGHT: Grid = ['HO', 'HO', 'hO', 'gO', 'OO'];

/** The pickaxe in three places of a swing, each with the hand and arm that hold it. */
const PICK_UP: Grid = [
  '..MmmmmM..',
  '.M...b..M.',
  'M....b...M',
  '....b.....',
  '....b.....',
  '...b......',
  '..Og......',
  '.Oh.......',
  'Oh........',
];
const PICK_LEVEL: Grid = [
  '.........M',
  '........mM',
  'Ogbbbbbbm.',
  '........mM',
  '.........M',
];
const PICK_DOWN: Grid = [
  'Og......',
  '.Ob.....',
  '...b....',
  '....b...',
  '....Mmm.',
  '.....mM.',
  '......M.',
];
const STONE: Grid = ['.MMM.', 'MMmMM'];
const SPARK: Grid = ['y.y', '.y.'];

const SCROLL: Grid = [
  '.PPPPPPPPPP.',
  'OppoooopoopO',
  'gpppppppppPg',
  'OppooopoooPO',
  '.PPPPPPPPPP.',
];

const SHIELD: Grid = [
  '.yyyyyy.',
  'ybbbbbby',
  'gbbmmbbg',
  'ybbmmbby',
  'ybbbbbby',
  '.yyyyyy.',
];

const QUESTION: Grid = ['yyy', '..y', '.yy', '...', '.y.'];
const Z: Grid = ['zzz', '..z', '.z.', 'zzz'];

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
      if (pixel === '.') return;
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) throw new Error(`a part outside the cell at ${px},${py}`);
      this.rows[py][px] = pixel;
    }));
    return this;
  }
  grid(): Grid {
    return this.rows.map((row) => row.join(''));
  }
}

/** The head with these eyes, on the goblin's right (our left) and on its left. */
function head(right: Eyes, left: Eyes = right): Grid {
  const [first, second] = EYE_COLUMNS;
  return HEAD.map((line, row) => {
    const eye = row + 3 - EYE_ROWS[0];
    if (eye < 0 || eye > 2) return line;
    return line.slice(0, first) + EYES[right][eye] + line.slice(first + 3, second) + EYES[left][eye] + line.slice(second + 3);
  });
}

interface Pose {
  eyes?: Eyes;
  /** The other eye, where it is not as the first. */
  other?: Eyes;
  /** The head and the body lower by this much: a breath, a step, sleep. */
  sink?: number;
  /** The head to the side by this much. */
  tilt?: number;
  /** A leg lifted in a step: it is two pixels up, and the arm on the other side swings forward. */
  step?: 'left' | 'right';
  /** What the hands hold, in place of the arms that hang. */
  holds?: 'pick-up' | 'pick-level' | 'pick-down' | 'scroll' | 'shield';
  extra?: readonly (readonly [Grid, number, number])[];
}

/** The cell all frames are drawn in. The goblin stands in it 22 pixels high, the soles on row 28. */
export const CELL = 32;

/**
 * One frame of the goblin. Nothing reaches beyond column 30 or above row 2, so what it holds and
 * what rises over it stay in the room the panel gives the goblin.
 */
function frame(pose: Pose): Grid {
  const canvas = new Canvas(CELL, CELL);
  const sink = pose.sink ?? 0;
  canvas.put(LEG, 12, 25 - (pose.step === 'right' ? 2 : 0));
  canvas.put(LEG, 16, 25 - (pose.step === 'left' ? 2 : 0));
  canvas.put(TORSO, 11, 18 + sink);
  const hands = pose.holds === 'scroll' || pose.holds === 'shield';
  if (!hands) canvas.put(ARM_LEFT, 9, 19 + sink - (pose.step === 'left' ? 1 : 0));
  if (!pose.holds) canvas.put(ARM_RIGHT, 21, 19 + sink - (pose.step === 'right' ? 1 : 0));
  canvas.put(head(pose.eyes ?? 'open', pose.other), 8 + (pose.tilt ?? 0), 7 + sink);
  switch (pose.holds) {
    case 'pick-up': canvas.put(PICK_UP, 20, 11 + sink); break;
    case 'pick-level': canvas.put(PICK_LEVEL, 20, 17 + sink); break;
    case 'pick-down': canvas.put(PICK_DOWN, 20, 20 + sink); break;
    case 'scroll': canvas.put(SCROLL, 10, 18 + sink); break;
    case 'shield': canvas.put(SHIELD, 12, 18 + sink); break;
  }
  for (const [grid, x, y] of pose.extra ?? []) canvas.put(grid, x, y);
  return canvas.grid();
}

export interface Animation {
  name: string;
  /** How long each frame stays. */
  ms: number;
  /**
   * The first frame is held, and the others play once now and then (8 to 15 seconds apart),
   * each for `ms`: a goblin at rest that only blinks. Otherwise the frames go round.
   */
  hold?: boolean;
  frames: readonly Grid[];
}

const AT_WORK = [[STONE, 25, 27]] as const;

/** What the panel can show, in the order of the sheet's rows. */
export const ANIMATIONS: readonly Animation[] = [
  // At rest: still, and a blink now and then.
  { name: 'idle', ms: 150, hold: true, frames: [frame({}), frame({ eyes: 'shut' })] },
  {
    // Mining: up, through and down on the stone, where it sparks, and up again.
    name: 'working', ms: 130, frames: [
      frame({ holds: 'pick-up', extra: AT_WORK }),
      frame({ holds: 'pick-up', extra: AT_WORK }),
      frame({ holds: 'pick-level', extra: AT_WORK }),
      frame({ holds: 'pick-down', sink: 1, extra: [...AT_WORK, [SPARK, 27, 24]] }),
      frame({ holds: 'pick-down', sink: 1, extra: AT_WORK }),
      frame({ holds: 'pick-level', extra: AT_WORK }),
    ],
  },
  {
    // Reading a parchment: the eyes go along a line, nod down to the next, and along that.
    name: 'reading', ms: 280, frames: [
      frame({ holds: 'scroll', eyes: 'downLeft' }), frame({ holds: 'scroll', eyes: 'downRight' }),
      frame({ holds: 'scroll', eyes: 'downRight' }), frame({ holds: 'scroll', eyes: 'downLeft', sink: 1 }),
      frame({ holds: 'scroll', eyes: 'downRight', sink: 1 }), frame({ holds: 'scroll', eyes: 'downRight', sink: 1 }),
    ],
  },
  {
    // Walking on the spot: a foot up, down, the other foot up, down.
    name: 'walking', ms: 160, frames: [
      frame({ step: 'left' }), frame({ sink: 1 }), frame({ step: 'right' }), frame({ sink: 1 }),
    ],
  },
  {
    // Asleep on its feet: eyes shut, a slow breath, and one quiet z rising.
    name: 'sleeping', ms: 600, frames: [
      frame({ eyes: 'shut', sink: 1, extra: [[Z, 23, 8]] }),
      frame({ eyes: 'shut', sink: 1, extra: [[Z, 24, 6]] }),
      frame({ eyes: 'shut', sink: 2, extra: [[Z, 25, 4]] }),
      frame({ eyes: 'shut', sink: 2 }),
    ],
  },
  {
    // Puzzled: one eye squeezed, the head from side to side, and a question over it.
    name: 'confused', ms: 300, frames: [
      frame({ other: 'shut', extra: [[QUESTION, 24, 2]] }),
      frame({ other: 'shut', tilt: 1, extra: [[QUESTION, 24, 3]] }),
      frame({ eyes: 'left', other: 'shut', extra: [[QUESTION, 24, 2]] }),
      frame({ eyes: 'left', other: 'shut', tilt: -1, extra: [[QUESTION, 24, 3]] }),
    ],
  },
  {
    // Waiting for the browser: standing still, looking one way and the other.
    name: 'waiting', ms: 700, frames: [frame({}), frame({}), frame({ eyes: 'left' }), frame({ eyes: 'left' })],
  },
  {
    // Guarding: a refusal is the rules working, not a mistake. The shield up, its rim catching the light.
    name: 'guarding', ms: 200, frames: [
      frame({ holds: 'shield' }),
      frame({ holds: 'shield', extra: [[['w'], 13, 18]] }),
      frame({ holds: 'shield', extra: [[['w'], 16, 18]] }),
      frame({ holds: 'shield', extra: [[['w'], 19, 20]] }),
    ],
  },
];
