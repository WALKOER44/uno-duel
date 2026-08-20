export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const LOBBY_PEER_ID = 'uno-duel-lobby';
export const ACTION_VALUES = ['skip', 'reverse', 'draw2', 'wild', 'wild4'];

export const PEER_BROKERS = [
  { host: '0.peerjs.com', port: 443 },
  { host: '1.peerjs.com', port: 443 },
  { host: '2.peerjs.com', port: 443 }
];

export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  {
    urls: ['turn:us-0.turn.peerjs.com:3478', 'turn:eu-0.turn.peerjs.com:3478'],
    username: 'peerjs',
    credential: 'peerjsp'
  },
  {
    urls: ['turn:us-0.turn.peerjs.com:3478?transport=tcp', 'turn:eu-0.turn.peerjs.com:3478?transport=tcp'],
    username: 'peerjs',
    credential: 'peerjsp'
  },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
];

export const COLOR_HEX = {
  red: '#ff4d4d',
  yellow: '#ffd400',
  green: '#22c55e',
  blue: '#2563eb'
};

export const EMOTES = [
  { e: '😄', s: 'cheer' },
  { e: '😂', s: 'laugh' },
  { e: '😎', s: 'cool' },
  { e: '🎉', s: 'party' },
  { e: '🥳', s: 'party' },
  { e: '😱', s: 'shock' },
  { e: '🤯', s: 'shock' },
  { e: '😤', s: 'angry' },
  { e: '😭', s: 'sad' },
  { e: '💀', s: 'sad' },
  { e: '🔥', s: 'fire' },
  { e: '👏', s: 'applause' },
  { e: '👍', s: 'cheer' },
  { e: '👎', s: 'sad' },
  { e: '❤️', s: 'love' },
  { e: '🃏', s: 'fanfare' },
  { e: '🎯', s: 'cool' },
  { e: '💪', s: 'power' },
  { e: '🎺', s: 'fanfare' },
  { e: '🤔', s: 'thinking' },
  { e: '🙌', s: 'applause' },
  { e: '😇', s: 'cheer' },
  { e: '🤗', s: 'love' },
  { e: '😴', s: 'sad' }
];

export const EMOTION_DEFS = {
  rage:  { face: '😡', sound: 'angry' },
  cry:   { face: '😭', sound: 'sad' },
  pout:  { face: '😤', sound: 'angry' },
  shock: { face: '😱', sound: 'shock' },
  laugh: { face: '😂', sound: 'laugh' },
  joy:   { face: '🤩', sound: 'cheer' },
  cool:  { face: '😎', sound: 'cool' },
  devil: { face: '😈', sound: 'power' },
  think: { face: '🤔', sound: 'thinking' }
};

export const BOT_PERSONAS = [
  { name: 'Rendra', avatar: '🧑' },
  { name: 'Salsa', avatar: '👩' },
  { name: 'Bima', avatar: '🧔' },
  { name: 'Citra', avatar: '👧' },
  { name: 'Bagas', avatar: '👦' },
  { name: 'Nadia', avatar: '👱‍♀️' },
  { name: 'Farhan', avatar: '🧑‍🦱' },
  { name: 'Dewi', avatar: '👩‍🦰' },
  { name: 'Andi', avatar: '🧑‍💻' },
  { name: 'Rara', avatar: '👧' }
];

export const BOT_LINES = {
  draw2: [
    'Waduh curang nih! 😭🔥',
    'Anjir +2, sabar sabar...',
    'Cih, nunggu aja balasannya! 😤',
    'Sialan, jangan-jangan kalian kompak! 😩'
  ],
  draw4: [
    'Anjir malah +4, sabar sabar...',
    'Sialan lu! 🤬🃏',
    '+4?? Ini mah teror! 💀',
    'Gila sih, +4 terus wkwk 😭'
  ],
  draw2rage: [
    'NGAMUK! +2 TERUS?! 🤬🔥',
    'SABAR SABAR... GILIRAN GUE! 😤🔥',
    'UDH GITU AJA?! MAINNYA KOK NGASIH +2 MELULU! 🤬',
    'Awas ya, gue balas nanti, DUA KALI LIPAT! 😡'
  ],
  draw4rage: [
    'NGAMUK BANGET INI! +4?! 🤯🔥',
    'INI PERANG, BUKAN MAIN-MAIN! 🤬',
    'GILA, +4 TERUS?! GUE BALAS PAKE WILD4! 😤',
    'SABAR, SABAR... SERIUS AMAT LU! 😡💢'
  ],
  uno: [
    'UNO! Dikit lagi menang nih cuy 😎✨',
    'Jangan dablek ya, tinggal sisa satu!',
    'Sisa satu, siap-siap kalah! 😜',
    'Udah ditebak bakal menang gue 😏'
  ],
  skip: [
    'Mampus skip! Giliran gua nih wkwk 😜',
    'Skip dulu deh, makan tuh! 🚫',
    'Kasihan deh kena skip 😂',
    'Skip! Jangan marah ya, gue emang jago 😎'
  ],
  win: [
    'GILA GILA GILA MENANG! 🏆🔥',
    'EZZZZ menang cuy 😎',
    'Noob! Gampang banget wkwk 🤣',
    'Juara! Makan tuh kartu kalian! 🏆'
  ],
  lose: [
    'Yaah kalah... rematch! 😭',
    'Kamu beruntung kali ini! 🙄',
    'Sebentar lagi aja gue menang 😤',
    'Wah gila, pantau terus! 👀'
  ],
  greeting: [
    'Awas ya, gue mainnya ganas 😈',
    'Siap-siap kalah, gue pro! 🏆',
    'Jangan nangis ya kalau kalah 🤭',
    'Semangat perang! 🔥'
  ],
  play: [
    'Gas pol! 🔥',
    'Nih kartu gue 🃏',
    'Ini baru namanya main! 💪',
    'Saksikan skill gue 😎'
  ]
};

export const MUSIC_TRACKS = {
  lobby: {
    tempo: 92,
    chords: [
      [60, [4, 7]],
      [57, [3, 7]],
      [53, [4, 7]],
      [55, [4, 7]]
    ],
    leadDeg: [0, 2, 4, 7, 9, 12, 14]
  },
  gameplay: {
    tempo: 118,
    chords: [
      [57, [3, 7]],
      [53, [4, 7]],
      [48, [3, 7]],
      [55, [4, 7]]
    ],
    leadDeg: [0, 2, 3, 5, 7, 10, 12, 15]
  }
};

export const BGM_TRACKS = {
  lobby: 'goodlife',
  gameplay: 'goodlife'
};

export const GOOD_LIFE_URL = '/audio/good-life.mp3';