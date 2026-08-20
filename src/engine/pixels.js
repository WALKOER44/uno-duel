const P = {
  transparent: 'transparent',
  black: '#111111',
  white: '#f4f4f4',
  skin: '#f2c79b',
  skinD: '#d99f6b',
  yellow: '#ffd400',
  red: '#ff4d4d',
  green: '#22c55e',
  blue: '#2563eb',
  purple: '#a855f7',
  pink: '#f472b6',
  orange: '#fb923c',
  teal: '#2dd4bf',
  grey: '#9ca3af',
  browD: '#6b4423'
};

export const PX = P;

export const PIXEL_CHARACTER = {
  width: 16,
  height: 18,
  rows: [
    // 0
    '................',
    // 1
    '.......@@@@......',
    '......@......@...',
    '.....@...S...@...',
    '.....@..s.s..@...',
    '......@....@.....',
    '.......@@@@......',
    '.....@@@@@@@@....',
    '....@@RRRRRR@@...',
    '...@R........R@..',
    '..@R...RRRR...R@.',
    '..@R..RRRRRR..R@.',
    '..@R..RRRRRR..R@.',
    '..@R...RRRR...R@.',
    '..@R.........R@..',
    '...@RRRRRRRRRR...',
    '....@.........@..',
    '....@...@...@....',
    '...@@...@@...@@..'
  ].map((r) => r.split(''))
};

export function parsePixel(rows, palette) {
  const map = {
    '.': palette.transparent,
    '@': palette.black,
    '#': palette.white,
    'S': palette.skin,
    's': palette.skinD,
    'R': palette.red,
    'Y': palette.yellow,
    'G': palette.green,
    'B': palette.blue,
    'P': palette.purple,
    'K': palette.pink,
    'O': palette.orange,
    'T': palette.teal,
    'D': palette.grey,
    'E': palette.browD
  };
  return rows.map((row) => row.map((ch) => map[ch] || palette.transparent));
}

export const PIXEL_EMOTES = {
  rage: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@RRRRRRR@@....',
      '.@RRRRRRRRRRR@...',
      '.@RRRRRRRRRRR@...',
      '.@RwRRRRRRRwR@...',
      '.@RRRRRRRRRRR@...',
      '.@RRRRRRRRRRR@...',
      '..@RRRRRRRRR@....',
      '..@RRRRRRRRR@....',
      '.@RRRRRRRRRRR@...',
      '.@RRRRRRRRRRR@...',
      '.@RRRRRRRRRRR@...',
      '..@@@@@@@@@@@....',
      '...@@@@@@@@@.....',
      '....@R@...@R@....',
      '...@@..@.@..@@...'
    ]
  },
  cry: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@BBBBBBB@@....',
      '.@BBBBBBBBBBB@...',
      '.@BwBBBBBBBwB@...',
      '.@BBBBBBBBBBB@...',
      '.@BBBBBBBBBBB@...',
      '.@BBBBBBBBBBB@...',
      '.@BBBBBBBBBBB@...',
      '..@BBBBBBBBB@....',
      '..@BBBBBBBBB@....',
      '.@BBBBBBBBBBB@...',
      '.@BBBBBBBBBBB@...',
      '..@@@@@@@@@@@....',
      '..@DD...@...DD@..',
      '..@DD...@...DD@..',
      '..@DD.......DD@..'
    ]
  },
  shock: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@YYYYYYY@@....',
      '.@YYYYYYYYYYY@...',
      '.@YwwYYYYYwwY@...',
      '.@YYYYYYYYYYY@...',
      '.@YYYYYYYYYYY@...',
      '..@YYYYYYYYY@....',
      '..@YYYYYYYYY@....',
      '..@YYYYYYYYY@....',
      '..@YYYYYYYYY@....',
      '..@YYYYYYYYY@....',
      '..@YYYYYYYYY@....',
      '..@@@@@@@@@@@....',
      '..@DD@.....@DD@..',
      '..@DD@.....@DD@..',
      '..@@@.......@@@..'
    ]
  },
  pout: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@PPPPPPP@@....',
      '.@PPPPPPPPPPP@...',
      '.@PwwPPPPPwwP@...',
      '.@PPPPPPPPPPP@...',
      '.@PPPPPPPPPPP@...',
      '..@PPPPPPPPP@....',
      '..@PPPPPPPPP@....',
      '..@PPPPPPPPP@....',
      '..@PPPPPPPPP@....',
      '.@PPPPPPPPPPP@...',
      '.@PP........PP@..',
      '.@PPPPPPPPPPP@...',
      '..@@@@@@@@@@@....',
      '..@DD@.....@DD@..',
      '..@@@.......@@@..'
    ]
  },
  joy: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@GGGGGGG@@....',
      '.@GGGGGGGGGGG@...',
      '.@GwwGGGGGwwG@...',
      '.@GGGGGGGGGGG@...',
      '.@GGGGGGGGGGG@...',
      '.@GGGGGGGGGGG@...',
      '..@GGGGGGGGG@....',
      '..@GGGGGGGGG@....',
      '.@GGGGGGGGGGG@...',
      '.@GGGGGGGGGGG@...',
      '.@GGGGGGGGGGG@...',
      '..@@@@@@@@@@@....',
      '...@@@@@@@@@.....',
      '....@DD@.@DD@....',
      '....@@@...@@@....'
    ]
  },
  cool: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@BBBBBBB@@....',
      '.@BBBBBBBBBBB@...',
      '.@BwwBBBBBwwB@...',
      '.@BBBBBBBBBBB@...',
      '.@BBBBBBBBBBB@...',
      '..@BBBBBBBBB@....',
      '..@BBBBBBBBB@....',
      '..@BBBBBBBBB@....',
      '..@BBBBBBBBB@....',
      '.@BBBBBBBBBBB@...',
      '.@BBBBBBBBBBB@...',
      '..@@@@@@@@@@@....',
      '...@DD@...@DD@...',
      '..@@@.@...@.@@@..',
      '..@@@.......@@@..'
    ]
  },
  laugh: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@YYYYYYY@@....',
      '.@YYYYYYYYYYY@...',
      '.@YwwYYYYYwwY@...',
      '.@YYYYYYYYYYY@...',
      '.@YYYYYYYYYYY@...',
      '..@YYYYYYYYY@....',
      '..@YYYYYYYYY@....',
      '.@YYYYYYYYYYY@...',
      '.@YYYYYYYYYYY@...',
      '.@YY......YY@....',
      '.@YYYYYYYYYYY@...',
      '.@YYYYYYYYYYY@...',
      '..@@@@@@@@@@@....',
      '....@DD@.@DD@....',
      '....@@@...@@@....'
    ]
  },
  think: {
    width: 16,
    height: 16,
    rows: [
      '....@@@@@@@......',
      '..@@DDDDDDD@@....',
      '.@DDDDDDDDDDD@...',
      '.@DwwDDDDDwwD@...',
      '.@DDDDDDDDDDD@...',
      '.@DDDDDDDDDDD@...',
      '..@DDDDDDDDD@....',
      '..@DDDDDDDDD@....',
      '..@DDDDDDDDD@....',
      '..@DDDDDDDDD@....',
      '..@DDDDDDDDD@....',
      '..@DDDDDDDDD@....',
      '..@@@@@@@@@@@....',
      '.....@....@......',
      '....@@@..@@@.....',
      '....@.....@......'
    ]
  },
  devil: {
    width: 16,
    height: 16,
    rows: [
      '.@@@...@@@.......',
      '@WW@...@WW@......',
      '..@@@@@@@@@......',
      '..@RRRRRRR@......',
      '.@RwwRRRwwR@.....',
      '.@RRRRRRRRR@.....',
      '.@RRRRRRRRR@.....',
      '.@RRRRRRRRR@.....',
      '..@RRRRRRR@......',
      '..@RRRRRRR@......',
      '.@RRRRRRRRR@.....',
      '.@RRRRRRRRR@.....',
      '..@RRRRRRR@......',
      '..@RRRRRRR@......',
      '...@@@.@@@.......',
      '....@...@........'
    ]
  }
};

export function emotePalette(name) {
  return PIXEL_EMOTES[name] || PIXEL_EMOTES.joy;
}

export const EMOTE_PIXEL_MAP = {
  '😡': 'rage',
  '😤': 'pout',
  '😱': 'shock',
  '🤯': 'shock',
  '😭': 'cry',
  '💀': 'cry',
  '😄': 'joy',
  '😇': 'joy',
  '🤩': 'joy',
  '😂': 'laugh',
  '😎': 'cool',
  '🎯': 'cool',
  '🤔': 'think',
  '😈': 'devil',
  '🥳': 'joy',
  '🎉': 'joy',
  '🙌': 'joy',
  '👏': 'joy',
  '👍': 'joy',
  '❤️': 'joy',
  '🤗': 'joy'
};