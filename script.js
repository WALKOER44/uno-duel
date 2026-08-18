/* ============================================
   UNO DUEL — ARENA (P2P Multiplayer, PeerJS)
   Frontend untuk GitHub Pages (file terpisah).

   PROTOKOL JARINGAN:
   - Client -> Host : { type: 'JOIN_ROOM', player: { name, avatar } }
   - Client -> Host : { type: 'ACTION', action: 'PLAY_CARD'|'DRAW'|'PASS'|'UNO'|'NEW_ROUND', data: {...} }
   - Siapa pun      : { type: 'CHAT', sender, text, avatar, id, emote? }
   - Host  -> Semua : { type: 'ROOM_UPDATE' | 'SYNC_STATE', roomCode, started, players, gameState }
   - Host  -> Client: { type: 'PENDING_WILD', cardIndex } | { type: 'TOAST', message }

   LOBBY REGISTRY (Room Publik, best-effort via PeerJS):
   - { type: 'LOBBY_REGISTER', room } / { type: 'LOBBY_UNREGISTER', code }
   - { type: 'LOBBY_LIST_REQ' } -> { type: 'LOBBY_LIST', rooms }
   ============================================ */

/* ============================================
   KONSTANTA
   ============================================ */

const COLORS = ['red', 'yellow', 'green', 'blue'];
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const PEER_PREFIX = '';
const LOBBY_PEER_ID = 'uno-duel-lobby';
// Kartu aksi. +16 TIDAK dipakai lagi.
const ACTION_VALUES = ['skip', 'reverse', 'draw2', 'wild', 'wild4'];

// Broker PeerJS publik — kalau satu mati, otomatis coba broker lain (anti-stuck).
const PEER_BROKERS = [
  { host: '0.peerjs.com', port: 443 },
  { host: '1.peerjs.com', port: 443 },
  { host: '2.peerjs.com', port: 443 }
];

// ICE: STUN Google + TURN publik (openrelay) supaya koneksi tembus NAT ketat.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
];

// ===== Koneksi P2P (PeerJS) =====
// Multiplayer memakai WebRTC Peer-to-Peer via broker PeerJS publik (berbasis 0.peerjs.com
// dengan fallback 1/2.peerjs.com). Backend Vercel (/api/score) untuk Papan Peringkat.
let _brokerIdx = 0;
let _brokerDownCount = 0;

function peerConfig(brokerIdx) {
  const b = PEER_BROKERS[brokerIdx] || PEER_BROKERS[0];
  return {
    host: b.host,
    port: b.port,
    path: '/',
    secure: true,
    debug: 1,
    config: { iceServers: ICE_SERVERS }
  };
}

function nextBroker() {
  _brokerIdx = (_brokerIdx + 1) % PEER_BROKERS.length;
}

function currentBrokerName() {
  const b = PEER_BROKERS[_brokerIdx] || PEER_BROKERS[0];
  return b.host;
}

// true = boleh lanjut coba broker berikutnya; false = semua broker sudah dicoba.
function brokerDown() {
  _brokerDownCount += 1;
  nextBroker();
  return _brokerDownCount < PEER_BROKERS.length * 2;
}

// Buat Peer dengan watchdog: kalau broker mati (open tak kunjung tiba dalam X detik),
// hancurkan & panggil opts.onBrokerDown supaya caller mencoba broker berikutnya.
function makePeer(id, opts) {
  const o = opts || {};
  const peer = new Peer(id, peerConfig(_brokerIdx));
  peer._brokerName = currentBrokerName();
  let opened = false;
  peer.on('open', () => {
    opened = true;
    _brokerDownCount = 0;
    clearTimeout(peer._watchdog);
  });
  peer._watchdog = setTimeout(() => {
    if (!opened && !peer.destroyed) {
      try { peer.destroy(); } catch (e) { /* ignore */ }
      if (typeof o.onBrokerDown === 'function') o.onBrokerDown(peer);
    }
  }, o.openTimeout || 9000);
  return peer;
}

const EMOTES = [
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

/* ============================================
   LOGIKA DECK & KARTU
   ============================================ */

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createCard(color, value) {
  const id = makeId();
  return {
    id,
    card_id: id,
    color,
    value,
    displayColor: color,
    label: value === 'wild' ? 'WILD' : value === 'wild4' ? '+4' : value
  };
}

function createDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push(createCard(color, '0'));
    for (let value = 1; value <= 9; value += 1) {
      deck.push(createCard(color, String(value)));
      deck.push(createCard(color, String(value)));
    }
    ['skip', 'reverse', 'draw2'].forEach((value) => {
      deck.push(createCard(color, value));
      deck.push(createCard(color, value));
    });
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push(createCard('wild', 'wild'));
    deck.push(createCard('wild', 'wild4'));
  }
  return deck;
}

function shuffleDeck(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Stok kartu tengah menyesuaikan jumlah pemain (semakin banyak pemain, semakin banyak kartu).
function createDeckFor(playerCount) {
  const full = shuffleDeck(createDeck());
  const stock = Math.min(full.length, 20 + (playerCount - 1) * 10);
  return full.slice(0, stock);
}

// Hapus kartu duplikat (id sama) dari sebuah tangan — mencegah kartu ganda akibat bug sinkronisasi.
function dedupeCards(hand) {
  const seen = new Set();
  return (hand || []).filter((c) => {
    if (!c || !c.id) return true;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// Hapus pemain duplikat (id sama) dari daftar — mencegah nama muncul ganda di ruang tunggu.
function dedupePlayers(players) {
  const seen = new Set();
  return (players || []).filter((p) => {
    if (!p || !p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

// ATURAN: warna sama ATAU angka/simbol sama dengan kartu tumpukan atas.
// Wild: warna aktif (currentColor / chosenColor) menjadi acuan.
function isValidMove(card, topCard) {
  if (!card) return false;
  if (!topCard) return true;
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild4') {
    return true;
  }
  const activeColor = topCard.chosenColor || gameState.currentColor || topCard.color;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function getCardLabel(card) {
  if (card.value === 'skip') return '⏭';
  if (card.value === 'reverse') return '⟲';
  if (card.value === 'draw2') return '+2';
  if (card.value === 'wild') return 'W';
  if (card.value === 'wild4') return '+4';
  return String(card.value);
}

function getCardSymbol(card) {
  if (card.value === 'reverse') return '🔄';
  if (card.value === 'skip') return '🚫';
  if (card.value === 'draw2') return '➕';
  if (card.value === 'wild' || card.value === 'wild4') return '🃏';
  return String(card.value);
}

function cardColorClass(card) {
  if (!card) return 'wild';
  const dc = card.displayColor;
  if (dc && dc !== 'wild') return dc;
  return card.color;
}

function cardFace(card) {
  const small = getCardLabel(card);
  return `
    <span class="card-corner tl">${small}</span>
    <span class="card-center">${getCardSymbol(card)}</span>
    <span class="card-corner br">${small}</span>
  `;
}

function cardButtonHTML(card, idx, playable, selected = false) {
  const cls = `uno-card ${cardColorClass(card)}${playable ? ' playable' : ''}${selected ? ' selected' : ''}`;
  return `<button class="${cls}" data-index="${idx}" data-value="${card.value}">${cardFace(card)}</button>`;
}

/* ============================================
   ANIMASI — kartu terbang, burst teks, confetti
   (WAAPI, tanpa library eksternal)
   ============================================ */

const COLOR_HEX = {
  red: '#ff4d4d',
  yellow: '#ffd400',
  green: '#22c55e',
  blue: '#2563eb'
};

function cardRectFromHand(idx) {
  const el = DOM.myHand.querySelector(`.uno-card[data-index="${idx}"]`);
  return el ? el.getBoundingClientRect() : null;
}

function seatRect(idx) {
  const el = DOM.seats.querySelector(`.seat[data-pid="${idx}"]`);
  return el ? el.getBoundingClientRect() : null;
}

function centerOf(el) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Klon kartu terbang dari titik asal ke titik tujuan (discard / tangan / seat).
function animateCardTo(fromRect, toRect, card, opts) {
  if (!fromRect || !toRect) return;
  const o = opts || {};
  const w = Math.max(50, Math.min(88, fromRect.width || 72));
  const h = Math.round(w * 1.45);
  const el = document.createElement('div');
  if (o.back) {
    el.className = 'fly-card deck-back';
  } else {
    el.className = 'fly-card ' + cardColorClass(card);
    el.innerHTML = cardFace(card);
  }
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  document.body.appendChild(el);

  const sx = fromRect.left + fromRect.width / 2;
  const sy = fromRect.top + fromRect.height / 2;
  const ex = toRect.left + toRect.width / 2;
  const ey = toRect.top + toRect.height / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const rot = o.rot !== undefined ? o.rot : (Math.random() * 16 - 8);

  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
  if (typeof el.animate !== 'function') {
    el.remove();
    return;
  }
  const anim = el.animate([
    { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
    { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.35}px)) rotate(${rot}deg) scale(.97)`, opacity: 1 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(0deg) scale(.9)`, opacity: .95 }
  ], {
    duration: o.dur || 400,
    easing: 'cubic-bezier(.25,.6,.4,1)'
  });
  anim.onfinish = () => el.remove();
}

// Kartu "belakang" terbang dari deck ke dock tangan saya.
function animateDeckToHand() {
  const from = DOM.drawPile.getBoundingClientRect();
  const to = DOM.playerDock.getBoundingClientRect();
  animateCardTo(from, to, null, { dur: 340, back: true, rot: -8 });
}

// Pulse animasi saat deck diacak ulang dari buangan.
function animateDeckRefill() {
  const el = DOM.drawPile;
  if (!el) return;
  el.classList.remove('deck-refill');
  void el.offsetWidth;
  el.classList.add('deck-refill');
  setTimeout(() => el.classList.remove('deck-refill'), 900);
}

function animateCardPlayed(playerIdx, cardIdx, played) {
  const isMe = myIndex() === playerIdx;
  const from = isMe ? cardRectFromHand(cardIdx) : seatRect(playerIdx);
  const to = DOM.discardPile.getBoundingClientRect();
  if (from && to) {
    animateCardTo(from, to, played, { dur: 380 });
    playSound('play');
  }
}

function animateCardPlayedPair(playerIdx, idxA, idxB, cardA, cardB) {
  const isMe = myIndex() === playerIdx;
  const last = Math.max(idxA, idxB);
  const first = Math.min(idxA, idxB);
  const fromA = isMe ? cardRectFromHand(first) : seatRect(playerIdx);
  const fromB = isMe ? cardRectFromHand(last) : seatRect(playerIdx);
  const to = DOM.discardPile.getBoundingClientRect();
  if (fromA && to) animateCardTo(fromA, to, cardA, { dur: 380 });
  if (fromB && to) setTimeout(() => animateCardTo(fromB, to, cardB, { dur: 380 }), 90);
  playSound('play');
}

function animateCardDraw(playerIdx, card) {
  const isMe = myIndex() === playerIdx;
  const from = DOM.drawPile.getBoundingClientRect();
  const to = isMe ? DOM.playerDock.getBoundingClientRect() : seatRect(playerIdx);
  if (from && to) {
    animateCardTo(from, to, card, { dur: 340, back: true, rot: -7 });
    playSound('draw');
  }
}

// Teks melayang di atas seat (skip / reverse / +2 / +4 / wild).
function burstText(text, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'burst-text ' + (cls || '');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function spinReverse() {
  const el = DOM.discardPile;
  if (!el) return;
  el.classList.remove('reverse-spin');
  void el.offsetWidth;
  el.classList.add('reverse-spin');
  setTimeout(() => el.classList.remove('reverse-spin'), 650);
}

function triggerWildFlash(color) {
  const pile = DOM.discardPile;
  if (!pile) return;
  const hex = COLOR_HEX[color] || '#ffd400';
  pile.style.setProperty('--glow', hex);
  pile.classList.remove('wild-flash');
  void pile.offsetWidth;
  pile.classList.add('wild-flash');
  setTimeout(() => pile.classList.remove('wild-flash'), 750);
}

// Efek aksi kartu di atas seat target.
function triggerActionEffect(card, whoIdx) {
  if (!card) return;
  const seat = DOM.seats.querySelector(`.seat[data-pid="${whoIdx}"]`);
  const pos = centerOf(seat);
  if (card.value === 'skip') {
    burstText('⏭ SKIP!', pos.x, pos.y, 'burst-skip');
    playSound('skip');
  } else if (card.value === 'reverse') {
    burstText('🔄 REVERSE!', pos.x, pos.y, 'burst-reverse');
    spinReverse();
    playSound('reverse');
  } else if (card.value === 'draw2') {
    burstText('+2', pos.x, pos.y, 'burst-draw');
  } else if (card.value === 'wild4') {
    burstText('+4', pos.x, pos.y, 'burst-draw');
    playSound('draw');
  } else if (card.value === 'wild') {
    burstText('🃏 WILD', pos.x, pos.y, 'burst-wild');
    playSound('wild');
  }
}

// Partikel confetti saat menang.
function confettiBurst(x, y) {
  const colors = ['#ffd400', '#ff4d4d', '#22c55e', '#2563eb', '#ff7a00', '#a855f7'];
  for (let i = 0; i < 30; i += 1) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.background = colors[i % colors.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 180;
    p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * dist - 70 + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    p.style.animationDelay = (Math.random() * 0.15) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
}

// Optimistic play (online): kartu langsung hilang dari tangan & terbang ke meja
// SEBELUM balasan host — terasa instan tanpa delay.
function optimisticPlay(idx, color) {
  const me = myPlayer();
  if (!me || !me.hand) return;
  const card = me.hand[idx];
  if (!card) return;
  gameState._optTs = Date.now();
  const from = cardRectFromHand(idx);
  const to = DOM.discardPile.getBoundingClientRect();
  if (from && to) {
    animateCardTo(from, to, card, { dur: 380 });
    playSound('play');
  }
  me.hand.splice(idx, 1);
  renderPlayerDock();
  if (color && (card.value === 'wild' || card.value === 'wild4')) triggerWildFlash(color);
}

function optimisticPlayPair(idxA, idxB, color) {
  const me = myPlayer();
  if (!me || !me.hand) return;
  const cardA = me.hand[idxA];
  const cardB = me.hand[idxB];
  if (!cardA || !cardB) return;
  gameState._optTs = Date.now();
  const last = Math.max(idxA, idxB);
  const first = Math.min(idxA, idxB);
  const to = DOM.discardPile.getBoundingClientRect();
  const fromA = cardRectFromHand(first);
  const fromB = cardRectFromHand(last);
  if (fromA && to) animateCardTo(fromA, to, cardA, { dur: 380 });
  if (fromB && to) setTimeout(() => animateCardTo(fromB, to, cardB, { dur: 380 }), 90);
  playSound('play');
  me.hand.splice(last, 1);
  me.hand.splice(first, 1);
  renderPlayerDock();
}

/* ============================================
   STATE GAME TERPUSAT
   ============================================ */

const gameState = {
  screenState: 'auth', // 'auth' | 'lobby' | 'room' | 'gameplay'
  gameMode: 'solo',     // 'solo' | 'online'
  playerProfile: {
    name: 'Pemain',
    avatar: '👦'
  },
  auth: {
    token: '',
    username: '',
    avatar: '👦',
    serverOk: false,
    dbOk: false,
    failStreak: 0,
    isGuest: false
  },
  authMode: 'login',
  me: null,

  soundEnabled: true,

  // P2P STATE
  peer: null,
  conn: null,
  connections: [],
  roomCode: '',
  playerIndex: 0,
  isHost: false,
  isOnline: false,
  connected: false,
  roomCapacity: 4,
  isPublic: false,
  botTimer: null,
  resyncTimer: null,
  pollTimer: null,

  // ROOM / GAME STATE (host otoritatif)
  players: [],
  deck: [],
  deckCount: 0,
  discard: [],
  currentPlayer: 0,
  direction: 1,
  currentColor: null,
  winner: null,
  pendingWild: null,
  pairSelect: null,
  passPending: false,
  botChat: null,          // { index, text, until } bubble chat bot terakhir
  botChatTimer: null,
  lastShownBotChatTs: 0,  // dedupe bubble pada client (anti-muncul berulang tiap sync)
  log: [],
  chatHistory: [],
  seenChatIds: new Set(),
  gameStarted: false,

  // LOBBY / ROOM PUBLIK
  lobby: {
    keeper: false,
    peer: null,
    conn: null,
    conns: new Set(),
    rooms: []
  },
  onlineUsers: [],
  lastTopId: null
};

// Nama pemain aktif: username akun jika sudah login, selain itu nama lokal
function getPlayerName() {
  return (gameState.auth.username || gameState.playerProfile.name || 'Pemain');
}

/* ============================================
   CACHE DOM
   ============================================ */

const DOM = {
  authScreen: document.getElementById('auth-screen'),
  lobbyScreen: document.getElementById('lobby-screen'),
  roomScreen: document.getElementById('room-screen'),
  gameplayScreen: document.getElementById('gameplay-screen'),

  authUsername: document.getElementById('auth-username'),
  authPassword: document.getElementById('auth-password'),
  authTabLogin: document.getElementById('auth-tab-login'),
  authTabRegister: document.getElementById('auth-tab-register'),
  authSubmitBtn: document.getElementById('auth-submit-btn'),
  authGuestBtn: document.getElementById('auth-guest-btn'),
  authMsg: document.getElementById('auth-msg'),
  authLeaderboardList: document.getElementById('auth-leaderboard-list'),
  avatarBtns: [...document.querySelectorAll('.avatar-btn')],
  createRoomBtn: document.getElementById('create-room-btn'),
  createPrivateBtn: document.getElementById('create-private-btn'),
  authCreateRoomBtn: document.getElementById('auth-create-room-btn'),
  soloBtn: document.getElementById('solo-btn'),
  soloBots: document.getElementById('solo-bots'),
  joinPrivateBtn: document.getElementById('join-private-btn'),
  roomCodeInput: document.getElementById('room-code-input'),
  roomCapacity: document.getElementById('room-capacity'),
  refreshRoomsBtn: document.getElementById('refresh-rooms-btn'),
  publicRoomList: document.getElementById('public-room-list'),
  onlineUsersList: document.getElementById('online-users-list'),
  leaderboardList: document.getElementById('leaderboard-list'),
  connectionStatus: document.getElementById('connection-status'),
  connectionDot: document.getElementById('connection-dot'),

  dashName: document.getElementById('dash-name'),
  dashAvatar: document.getElementById('dash-avatar'),
  dashStats: document.getElementById('dash-stats'),
  dashLogoutBtn: document.getElementById('dash-logout-btn'),
  dashNavBtns: [...document.querySelectorAll('.dash-nav-btn')],

  waitingRoomCode: document.getElementById('waiting-room-code'),
  waitingCapacity: document.getElementById('waiting-capacity'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  waitingPlayersList: document.getElementById('waiting-players-list'),
  waitingStatus: document.getElementById('waiting-status'),
  startGameBtn: document.getElementById('start-game-btn'),
  leaveRoomBtn: document.getElementById('leave-room-btn'),

  roomInfoDisplay: document.getElementById('room-info-display'),
  seats: document.getElementById('seats'),
  discardPile: document.getElementById('discard-pile'),
  drawPile: document.getElementById('draw-pile'),
  deckCount: document.getElementById('deck-count'),
  turnIndicator: document.getElementById('turn-indicator'),
  activeColorIndicator: document.getElementById('active-color-indicator'),

  playerDock: document.getElementById('player-dock'),
  playerDockHeader: document.getElementById('player-dock-header'),
  myHand: document.getElementById('my-hand'),
  pairHint: document.getElementById('pair-hint'),
  passBtn: document.getElementById('pass-btn'),
  unoBtn: document.getElementById('uno-btn'),

  statusPill: document.getElementById('status-pill'),
  statusEvent: document.getElementById('status-event'),
  newRoundBtn: document.getElementById('new-round-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  soundToggleBtn: document.getElementById('sound-toggle-btn'),
  exitGameBtn: document.getElementById('exit-game-btn'),

  colorPicker: document.getElementById('color-picker'),
  colorButtons: [...document.querySelectorAll('.color-button')],

  chatPanel: document.getElementById('chat-panel'),
  chatToggleBtn: document.getElementById('chat-toggle-btn'),
  chatShowBtn: document.getElementById('chat-show-btn'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  chatSendBtn: document.getElementById('chat-send-btn'),
  emoteToggleBtn: document.getElementById('emote-toggle-btn'),
  emoteGrid: document.getElementById('emote-grid'),
  emojiPicker: document.getElementById('emoji-picker'),

  disconnectBanner: document.getElementById('disconnect-banner'),
  winnerOverlay: document.getElementById('winner-overlay'),
  winnerNameEl: document.getElementById('winner-name'),
  winnerAgainBtn: document.getElementById('winner-again-btn'),
  winnerMenuBtn: document.getElementById('winner-menu-btn'),

  toast: document.getElementById('toast')
};
/* ============================================
   UTILITAS
   ============================================ */

function showScreen(screenName) {
  if (DOM.authScreen) DOM.authScreen.classList.remove('screen-active');
  DOM.lobbyScreen.classList.remove('screen-active');
  DOM.roomScreen.classList.remove('screen-active');
  DOM.gameplayScreen.classList.remove('screen-active');

  if (screenName === 'auth') {
    if (DOM.authScreen) DOM.authScreen.classList.add('screen-active');
    gameState.screenState = 'auth';
  } else if (screenName === 'lobby') {
    DOM.lobbyScreen.classList.add('screen-active');
    gameState.screenState = 'lobby';
  } else if (screenName === 'room') {
    DOM.roomScreen.classList.add('screen-active');
    gameState.screenState = 'room';
  } else if (screenName === 'gameplay') {
    DOM.gameplayScreen.classList.add('screen-active');
    gameState.screenState = 'gameplay';
  }
}

function showToast(message) {
  DOM.toast.textContent = message;
  DOM.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    DOM.toast.classList.add('hidden');
  }, 2200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function randomCode(len) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const size = len || 6;
  let code = '';
  for (let i = 0; i < size; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function setConnectionState(state, text) {
  if (DOM.connectionDot) {
    DOM.connectionDot.className = 'status-dot status-' + state;
  }
  DOM.connectionStatus.textContent = text;
}

function showDisconnectBanner(text) {
  if (!DOM.disconnectBanner) return;
  DOM.disconnectBanner.textContent = text || 'Menghubungkan kembali...';
  DOM.disconnectBanner.classList.remove('hidden');
}

function hideDisconnectBanner() {
  if (!DOM.disconnectBanner) return;
  DOM.disconnectBanner.classList.add('hidden');
}

function showWinnerOverlay(name) {
  if (!DOM.winnerOverlay) return;
  const wasHidden = DOM.winnerOverlay.classList.contains('hidden');
  DOM.winnerNameEl.textContent = name || 'Pemain';
  DOM.winnerOverlay.classList.remove('hidden');
  if (wasHidden) {
    confettiBurst(window.innerWidth / 2, window.innerHeight / 2);
    setTimeout(() => confettiBurst(window.innerWidth * 0.28, window.innerHeight * 0.45), 220);
    setTimeout(() => confettiBurst(window.innerWidth * 0.72, window.innerHeight * 0.45), 460);
    setTimeout(() => confettiBurst(window.innerWidth / 2, window.innerHeight * 0.3), 700);
  }
}

function hideWinnerOverlay() {
  if (!DOM.winnerOverlay) return;
  DOM.winnerOverlay.classList.add('hidden');
}

/* ============================================
   AUDIO / SOUND ENGINE
   ============================================ */

let _audioCtx = null;

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!_audioCtx) _audioCtx = new Ctx();
  if (_audioCtx.state === 'suspended') {
    try {
      _audioCtx.resume();
    } catch (e) {
      // ignore
    }
  }
  return _audioCtx;
}

function tone(ctx, dest, freq, start, dur, type) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.9, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noiseBurst(ctx, dest, start, dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(dest);
  src.start(start);
}

function playSound(type = 'click') {
  if (!gameState.soundEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.08;
  master.connect(ctx.destination);

  const sounds = {
    click: { freq: 520, dur: 0.08, type: 'triangle' },
    draw: { freq: 300, dur: 0.12, type: 'sawtooth' },
    play: { freq: 700, dur: 0.07, type: 'square' },
    wild: { freq: 520, dur: 0.16, type: 'sine' },
    skip: { freq: 880, dur: 0.09, type: 'square' },
    reverse: { freq: 440, dur: 0.1, type: 'sine' },
    shuffle: { freq: 240, dur: 0.18, type: 'sawtooth' },
    win: { freq: 720, dur: 0.25, type: 'square' },
    action: { freq: 440, dur: 0.11, type: 'sine' }
  };
  const s = sounds[type] || sounds.click;
  tone(ctx, master, s.freq, now, s.dur, s.type);
}

function emoteSoundOf(emote) {
  const found = EMOTES.find((m) => m.e === emote);
  return found ? found.s : 'cheer';
}

function playEmoteSound(name) {
  if (!gameState.soundEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);

  switch (name) {
    case 'cheer':
      [523, 659, 784, 1046].forEach((f, i) => tone(ctx, master, f, now + i * 0.09, 0.15, 'triangle'));
      break;
    case 'laugh':
      tone(ctx, master, 440, now, 0.12, 'square');
      tone(ctx, master, 392, now + 0.12, 0.12, 'square');
      tone(ctx, master, 349, now + 0.24, 0.18, 'square');
      break;
    case 'cool':
      tone(ctx, master, 392, now, 0.1, 'sine');
      tone(ctx, master, 523, now + 0.1, 0.15, 'sine');
      break;
    case 'party':
      tone(ctx, master, 659, now, 0.1, 'triangle');
      tone(ctx, master, 523, now + 0.1, 0.1, 'triangle');
      tone(ctx, master, 784, now + 0.2, 0.1, 'triangle');
      tone(ctx, master, 1046, now + 0.3, 0.2, 'triangle');
      break;
    case 'shock':
      tone(ctx, master, 880, now, 0.15, 'sawtooth');
      tone(ctx, master, 660, now + 0.12, 0.15, 'sawtooth');
      tone(ctx, master, 440, now + 0.24, 0.25, 'sawtooth');
      break;
    case 'angry':
      tone(ctx, master, 220, now, 0.15, 'square');
      tone(ctx, master, 233, now + 0.15, 0.15, 'square');
      tone(ctx, master, 220, now + 0.3, 0.3, 'sawtooth');
      break;
    case 'sad':
      tone(ctx, master, 330, now, 0.3, 'sawtooth');
      tone(ctx, master, 311, now + 0.25, 0.3, 'sawtooth');
      tone(ctx, master, 293, now + 0.5, 0.5, 'sawtooth');
      break;
    case 'fire':
      tone(ctx, master, 180, now, 0.2, 'sawtooth');
      tone(ctx, master, 220, now + 0.1, 0.25, 'sawtooth');
      tone(ctx, master, 262, now + 0.25, 0.3, 'sawtooth');
      break;
    case 'applause':
      noiseBurst(ctx, master, now, 0.4);
      break;
    case 'love':
      tone(ctx, master, 523, now, 0.15, 'triangle');
      tone(ctx, master, 659, now + 0.12, 0.15, 'triangle');
      tone(ctx, master, 784, now + 0.24, 0.25, 'triangle');
      break;
    case 'fanfare':
      tone(ctx, master, 587, now, 0.12, 'square');
      tone(ctx, master, 587, now + 0.12, 0.12, 'square');
      tone(ctx, master, 587, now + 0.24, 0.3, 'square');
      tone(ctx, master, 880, now + 0.24, 0.35, 'triangle');
      break;
    case 'power':
      tone(ctx, master, 130, now, 0.25, 'sawtooth');
      tone(ctx, master, 164, now + 0.2, 0.25, 'sawtooth');
      tone(ctx, master, 196, now + 0.4, 0.35, 'sawtooth');
      break;
    case 'thinking':
      tone(ctx, master, 523, now, 0.1, 'sine');
      tone(ctx, master, 587, now + 0.12, 0.1, 'sine');
      tone(ctx, master, 659, now + 0.24, 0.12, 'sine');
      break;
    default:
      tone(ctx, master, 523, now, 0.12, 'triangle');
  }
}

/* ============================================
   CHAT & EMOTE (real-time, dua arah)
   Format: { type: 'CHAT', sender, text }
   ============================================ */

function appendChat(msg) {
  if (!msg) return;
  if (msg.id) {
    if (gameState.seenChatIds.has(msg.id)) return;
    gameState.seenChatIds.add(msg.id);
  }
  const entry = {
    id: msg.id || null,
    kind: msg.kind === 'emote' ? 'emote' : 'msg',
    avatar: msg.avatar || '👤',
    from: msg.sender || msg.from || '',
    text: msg.text !== undefined ? msg.text : msg.message || '',
    emote: msg.emote !== undefined ? msg.emote : ''
  };
  gameState.chatHistory.push(entry);
  if (gameState.chatHistory.length > 60) {
    gameState.chatHistory.splice(0, gameState.chatHistory.length - 60);
  }
  renderChatEntry(entry);
}

function renderChatEntry(msg) {
  const el = document.createElement('div');

  if (msg.kind === 'emote') {
    el.className = 'chat-msg chat-emote';
    el.innerHTML = `
      <span class="chat-avatar">${escapeHtml(msg.avatar || '👤')}</span>
      <span class="chat-name">${escapeHtml(msg.from)}</span>
      <span class="chat-emote-symbol">${escapeHtml(msg.emote)}</span>
    `;
  } else {
    el.className = 'chat-msg';
    el.innerHTML = `
      <span class="chat-avatar">${escapeHtml(msg.avatar || '👤')}</span>
      <span class="chat-name">${escapeHtml(msg.from)}</span>
      <span class="chat-text">${escapeHtml(msg.text)}</span>
    `;
  }

  DOM.chatMessages.appendChild(el);
  DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

function syncChatHistory(list) {
  const incoming = Array.isArray(list) ? list : [];
  if (incoming.length === gameState.chatHistory.length) return;
  gameState.chatHistory = [];
  gameState.seenChatIds.clear();
  DOM.chatMessages.innerHTML = '';
  incoming.forEach((m) => appendChat(m));
}

function sendChatMessage(text) {
  const msg = (text || '').trim();
  if (!msg) return;
  const me = myPlayer();

  if (gameState.isOnline) {
    const payload = { type: 'CHAT', id: makeId(), sender: me.name, avatar: me.avatar, text: msg };
    appendChat({ id: payload.id, kind: 'msg', sender: payload.sender, avatar: payload.avatar, text: payload.text });
    if (gameState.isHost) {
      forwardChat(payload, null);
    } else if (gameState.conn && gameState.conn.open) {
      gameState.conn.send(payload);
    }
  } else {
    appendChat({ kind: 'msg', avatar: me.avatar, sender: me.name, text: msg });
    botReactToChat();
  }
}

function sendEmote(emote, sound) {
  playEmoteSound(sound || emoteSoundOf(emote));
  const me = myPlayer();

  if (gameState.isOnline) {
    const payload = { type: 'CHAT', id: makeId(), sender: me.name, avatar: me.avatar, text: emote, emote };
    appendChat({ id: payload.id, kind: 'emote', sender: payload.sender, avatar: payload.avatar, emote: payload.emote });
    if (gameState.isHost) {
      forwardChat(payload, null);
    } else if (gameState.conn && gameState.conn.open) {
      gameState.conn.send(payload);
    }
  } else {
    appendChat({ kind: 'emote', avatar: me.avatar, sender: me.name, emote });
    botReactToChat();
  }
}

function forwardChat(msg, excludePeer) {
  gameState.players.forEach((p) => {
    if (p.isMe) return;
    if (excludePeer && p.id === excludePeer) return;
    if (p.conn && p.conn.open) {
      p.conn.send({ type: 'CHAT', id: msg.id, sender: msg.sender, avatar: msg.avatar, text: msg.text, emote: msg.emote });
    }
  });
}

function botReactToChat() {
  if (gameState.isOnline) return;
  const bot = gameState.players.find((p) => p.isBot);
  if (!bot) return;
  if (Math.random() > 0.6) return;

  const delay = 500 + Math.random() * 1200;
  setTimeout(() => {
    if (gameState.screenState !== 'gameplay' || gameState.winner) return;
    const emote = EMOTES[Math.floor(Math.random() * EMOTES.length)];
    appendChat({ kind: 'emote', avatar: '🤖', sender: bot.name, emote: emote.e });
    playEmoteSound(emote.s);
  }, delay);
}
/* ============================================
   ROOM GAME LOGIC (Host otoritatif, dipakai juga untuk solo bot)
   ============================================ */

function topCard() {
  return gameState.discard[gameState.discard.length - 1] || null;
}

function nextTurn(idx) {
  const len = gameState.players.length;
  const next = idx + gameState.direction;
  if (next >= len) return 0;
  if (next < 0) return len - 1;
  return next;
}

function replenishDeck() {
  if (gameState.deck.length > 0) return;

  // Refill otomatis: tumpukan buangan (kartu di tengah) diacak lagi jadi kartu draw
  if (gameState.discard.length >= 2) {
    const top = gameState.discard.pop();
    gameState.deck = shuffleDeck(gameState.discard);
    gameState.discard = [top];
    gameState.deckCount = gameState.deck.length;
    addLog('🔄 Tumpukan buangan diacak kembali menjadi kartu draw!');
    animateDeckRefill();
    showToast('🔄 Deck habis — kartu buangan diacak lagi');
    playSound('shuffle');
    return;
  }

  // Jika tumpukan draw di tengah habis, isi ulang dengan kartu baru dari awal
  // (refresh seperti awal angkanya) agar permainan tidak pernah macet tanpa kartu.
  gameState.deck = createDeckFor(gameState.players.length || 2);
  gameState.deckCount = gameState.deck.length;
  animateDeckRefill();
  addLog('🔄 Tumpukan kartu habis! Mengisi ulang dengan kartu baru dari awal.');
}

// Darurat: benar-benar tidak ada kartu tersisa -> pemenang pemain kartu tersedikit
function endRoundFewestCards(reason) {
  let best = gameState.players[0] || { name: 'Pemain', hand: [], isBot: false };
  for (const p of gameState.players) {
    if ((p.hand || []).length < (best.hand || []).length) best = p;
  }
  addLog(reason || '😵 Semua kartu habis');
  gameState.winner = best;
  addLog(`🏆 ${best.name} MENANG (kartu tersedikit)!`);
  showToast(`${best.name} Menang!`);
  playSound('win');
  if (!best.isBot) recordWin(best.name);
  return best;
}

function drawCardFor(playerIdx) {
  replenishDeck();
  const card = gameState.deck.pop();
  if (!card) return null;
  gameState.players[playerIdx].hand.push(card);
  animateCardDraw(playerIdx, card);
  return card;
}

function setActiveColor(playedCard, chosenColor) {
  gameState.currentColor = (chosenColor || playedCard.chosenColor) || playedCard.color || null;
}

function clampNum(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roomPlayCard(playerIdx, cardIdx, color = null) {
  const player = gameState.players[playerIdx];
  const card = player.hand[cardIdx];
  const top = topCard();

  if (!card || !isValidMove(card, top)) {
    addLog('❌ Kartu tidak cocok!');
    showToast('Kartu tidak cocok');
    return false;
  }

  player.hand.splice(cardIdx, 1);
  const played = { ...card, displayColor: color || card.color };
  if (card.color === 'wild') {
    played.chosenColor = color || 'red';
    played.displayColor = played.chosenColor;
  }
  setActiveColor(played, color);
  gameState.discard.push(played);
  animateCardPlayed(playerIdx, cardIdx, played);
  addLog(`${player.name} main ${getCardLabel(card)}`);

  if (player.hand.length === 0) {
    gameState.winner = player;
    addLog(`🎉 ${player.name} MENANG!`);
    showToast(`${player.name} Menang!`);
    playSound('win');
    if (!player.isBot) {
      recordWin(player.name);
      // Bot yang kalah protes
      const loser = gameState.players.find((p) => p.isBot);
      if (loser) botSpeak(gameState.players.indexOf(loser), 'lose');
    } else {
      botSpeak(playerIdx, 'win');
    }
    return true;
  }

  if (player.hand.length === 1) {
    player.hasUno = false;
    if (player.isBot) botSpeak(playerIdx, 'uno');
  }

  let nextIdx = playerIdx;

  if (card.value === 'skip') {
    nextIdx = nextTurn(nextIdx);
    nextIdx = nextTurn(nextIdx);
    triggerActionEffect(card, nextIdx);
    addLog('⏭ Skip!');
    if (player.isBot) botSpeak(playerIdx, 'skip');
  } else if (card.value === 'reverse') {
    gameState.direction *= -1;
    if (gameState.players.length === 2) {
      nextIdx = nextTurn(nextIdx);
    }
    triggerActionEffect(card, playerIdx);
    addLog('🔄 Reverse!');
  } else if (card.value === 'draw2') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    for (let i = 0; i < 2; i += 1) drawCardFor(nextIdx);
    triggerActionEffect(card, nextIdx);
    addLog(`${target.name} ambil +2`);
    playSound('action');
    if (target.isBot) botSpeak(nextIdx, 'draw2');
    nextIdx = nextTurn(nextIdx);
  } else if (card.value === 'wild4') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    for (let i = 0; i < 4; i += 1) drawCardFor(nextIdx);
    triggerActionEffect(card, nextIdx);
    addLog(`${target.name} ambil +4`);
    playSound('action');
    if (target.isBot) botSpeak(nextIdx, 'draw4');
    nextIdx = nextTurn(nextIdx);
  } else {
    nextIdx = nextTurn(nextIdx);
    triggerActionEffect(card, playerIdx);
    if (card.color === 'wild' || card.value === 'wild4') triggerWildFlash(played.chosenColor || gameState.currentColor);
    if (player.isBot && Math.random() < 0.4) botSpeak(playerIdx, 'play');
  }

  gameState.currentPlayer = nextIdx;
  return true;
}

// Apakah dua kartu bisa dimainkan dobel: angkanya sama (boleh beda warna) dan cocok dengan kartu teratas.
function canPair(cardA, cardB, top) {
  if (!cardA || !cardB || !top) return false;
  if (cardA.id === cardB.id) return false;
  if (ACTION_VALUES.includes(cardA.value) || ACTION_VALUES.includes(cardB.value)) return false;
  if (cardA.value !== cardB.value) return false;
  return cardA.value === top.value;
}

// Kartu bisa memulai pilihan dobel bila angkanya cocok dengan kartu atas dan masih ada >= 2 kartu angka itu.
function canStartPair(card, top, hand) {
  if (!card || !top) return false;
  if (ACTION_VALUES.includes(card.value)) return false;
  if (card.value !== top.value) return false;
  return (hand || []).filter((c) => c && c.value === card.value).length >= 2;
}

/* ============================================================
   BOT CHAT & EMOTE — dialog seru dengan bubble di atas seat
   ============================================================ */

const BOT_LINES = {
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

function randomLine(category) {
  const arr = BOT_LINES[category] || BOT_LINES.play;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Munculkan bubble di atas seat bot (host: langsung; online: ikut dibroadcast via state)
function botSpeak(playerIdx, category) {
  const p = gameState.players[playerIdx];
  if (!p || !p.isBot) return;
  const text = randomLine(category);
  gameState.botChat = { index: playerIdx, text, until: Date.now() + 3500, ts: Date.now() };
  renderSeats();
  clearTimeout(gameState.botChatTimer);
  gameState.botChatTimer = setTimeout(() => {
    if (gameState.botChat && gameState.botChat.until <= Date.now()) {
      gameState.botChat = null;
      renderSeats();
    }
  }, 3600);
}

// Terapkan bubble dari state host (client online)
function applyBotChat(chat) {
  if (!chat || !chat.index || !chat.text) return;
  if (chat.ts && chat.ts === gameState.lastShownBotChatTs) return;
  gameState.lastShownBotChatTs = chat.ts || 0;
  gameState.botChat = { index: chat.index, text: chat.text, until: Date.now() + 3500 };
  if (gameState.screenState === 'gameplay') {
    renderSeats();
  }
  clearTimeout(gameState.botChatTimer);
  gameState.botChatTimer = setTimeout(() => {
    if (gameState.botChat && gameState.botChat.until <= Date.now()) {
      gameState.botChat = null;
      renderSeats();
    }
  }, 3600);
}

function clearBotChat() {
  clearTimeout(gameState.botChatTimer);
  gameState.botChat = null;
  gameState.botChatTimer = null;
}

// Mainkan 2 kartu sekaligus (dobel). Warna aktif = warna kartu kedua.
function roomPlayPair(playerIdx, cardIdxA, cardIdxB, color = null) {
  const player = gameState.players[playerIdx];
  if (!player) return false;

  const cardA = player.hand[cardIdxA];
  const cardB = player.hand[cardIdxB];
  const top = topCard();

  if (!canPair(cardA, cardB, top)) {
    addLog('❌ Kartu dobel tidak cocok!');
    showToast('Angka harus sama dengan kartu atas');
    return false;
  }

  const lastIdx = Math.max(cardIdxA, cardIdxB);
  const firstIdx = Math.min(cardIdxA, cardIdxB);
  const second = player.hand.splice(lastIdx, 1)[0];
  const first = player.hand.splice(firstIdx, 1)[0];

  const playedFirst = { ...first, displayColor: color || first.color };
  const playedSecond = { ...second, displayColor: color || second.color };
  setActiveColor(playedSecond, color);
  gameState.discard.push(playedFirst);
  gameState.discard.push(playedSecond);
  animateCardPlayedPair(playerIdx, cardIdxA, cardIdxB, playedFirst, playedSecond);
  addLog(`${player.name} main dobel ${getCardLabel(first)}`);
  playSound('click');

  if (player.hand.length === 0) {
    gameState.winner = player;
    addLog(`🎉 ${player.name} MENANG!`);
    showToast(`${player.name} Menang!`);
    playSound('win');
    if (!player.isBot) recordWin(player.name);
    return true;
  }

  if (player.hand.length === 1) {
    player.hasUno = false;
  }

  gameState.currentPlayer = nextTurn(playerIdx);
  return true;
}

function afterRoomChange() {
  if (gameState.isOnline && gameState.isHost) {
    broadcastState();
    if (!gameState.winner) hostBotTurn();
  } else {
    renderGameplay();
    const nextPlayer = gameState.players[gameState.currentPlayer];
    if (nextPlayer && nextPlayer.isBot && gameState.currentPlayer !== myIndex()) {
      setTimeout(botTurn, 700);
    }
  }
}

function botTurn() {
  if (gameState.winner || gameState.isOnline) return;
  const botIdx = gameState.currentPlayer;
  const bot = gameState.players[botIdx];
  if (!bot || !bot.isBot) return;

  setTimeout(() => {
    if (gameState.winner || gameState.currentPlayer !== botIdx) return;
    const current = gameState.players[botIdx];
    if (!current || !current.isBot) return;

    const playable = current.hand.filter((c) => isValidMove(c, topCard()));

    if (!playable.length) {
      const drawn = drawCardFor(botIdx);
      if (drawn && isValidMove(drawn, topCard())) {
        const idx = current.hand.indexOf(drawn);
        const color = drawn.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
        if (roomPlayCard(botIdx, idx, color)) afterRoomChange();
        return;
      }
      addLog(`🤖 ${current.name} pass`);
      gameState.currentPlayer = nextTurn(botIdx);
      scheduleNextBotTurn();
      return;
    }

    const choice = playable[Math.floor(Math.random() * playable.length)];
    const idx = current.hand.indexOf(choice);
    const color = choice.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
    if (roomPlayCard(botIdx, idx, color)) afterRoomChange();
  }, 700);
}

// Setelah giliran berganti, lanjutkan otomatis ke bot berikutnya (mendukung banyak bot).
function scheduleNextBotTurn() {
  renderGameplay();
  const nextPlayer = gameState.players[gameState.currentPlayer];
  if (nextPlayer && nextPlayer.isBot && gameState.currentPlayer !== myIndex()) {
    setTimeout(botTurn, 700);
  }
}

// Giliran otomatis untuk Bot pengisi slot di room online (dijalankan di Host)
function hostBotTurn() {
  if (!gameState.isOnline || !gameState.isHost) return;
  if (gameState.winner) return;
  const cur = gameState.players[gameState.currentPlayer];
  if (!cur || !cur.isBot) return;

  clearTimeout(gameState.botTimer);
  gameState.botTimer = setTimeout(() => {
    if (gameState.winner) return;
    const idx = gameState.currentPlayer;
    const bot = gameState.players[idx];
    if (!bot || !bot.isBot) return;

    const playable = bot.hand.filter((c) => isValidMove(c, topCard()));
    if (playable.length) {
      const choice = playable[Math.floor(Math.random() * playable.length)];
      const color = choice.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
      if (roomPlayCard(idx, bot.hand.indexOf(choice), color)) afterRoomChange();
    } else {
      const drawn = drawCardFor(idx);
      if (drawn && isValidMove(drawn, topCard())) {
        const color = drawn.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
        if (roomPlayCard(idx, bot.hand.indexOf(drawn), color)) afterRoomChange();
      } else {
        gameState.currentPlayer = nextTurn(idx);
        broadcastState();
        hostBotTurn();
      }
    }
  }, 800);
}

/* ============================================
   PROTOKOL P2P - STATE PAYLOAD
   ============================================ */

function myIndex() {
  return gameState.isOnline ? gameState.playerIndex : 0;
}

function myPlayer() {
  return gameState.players[myIndex()] || null;
}

function isMyTurn() {
  if (gameState.winner) return false;
  return gameState.currentPlayer === myIndex();
}

function opponentHandCount(player) {
  if (gameState.isOnline && typeof player.handCount === 'number') {
    return player.handCount;
  }
  return (player.hand || []).length;
}

function makeStatePayload(type, recipientIdx) {
  const me = gameState.players[recipientIdx];
  const players = gameState.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isMe: !!me && p.id === me.id,
    isHost: !!p.isHost,
    isBot: !!p.isBot,
    hasUno: !!p.hasUno,
    handCount: (p.hand || []).length
  }));
  return {
    type,
    roomCode: gameState.roomCode,
    started: !!gameState.gameStarted,
    capacity: gameState.roomCapacity,
    isPublic: gameState.isPublic,
    players,
    botChat: gameState.botChat
      ? { index: gameState.botChat.index, text: gameState.botChat.text, ts: gameState.botChat.ts }
      : null,
    gameState: {
      playerIndex: recipientIdx,
      currentPlayer: gameState.currentPlayer,
      direction: gameState.direction,
      currentColor: gameState.currentColor,
      discardTop: topCard(),
      deckCount: gameState.deck.length,
      winner: gameState.winner ? { name: gameState.winner.name } : null,
      chatHistory: gameState.chatHistory,
      myHand: (gameState.players[recipientIdx] || {}).hand || []
    }
  };
}

function broadcastState() {
  gameState.players = dedupePlayers(gameState.players);
  const type = gameState.gameStarted ? 'SYNC_STATE' : 'ROOM_UPDATE';
  gameState.players.forEach((p, idx) => {
    const payload = makeStatePayload(type, idx);
    if (p.isMe) {
      applyStatePayload(payload);
    } else if (p.conn && p.conn.open) {
      p.conn.send(payload);
    }
  });
}

function applyStatePayload(data) {
  // Snapshot kondisi lama (untuk deteksi animasi di sisi client online)
  const isClient = !gameState.isHost;
  const oldIdx = gameState.playerIndex;
  const prevTopId = gameState.lastTopId;
  const prevCur = gameState.currentPlayer;
  const prevMyLen = (gameState.players[oldIdx] && gameState.players[oldIdx].hand)
    ? gameState.players[oldIdx].hand.length
    : 0;
  const prevCounts = new Map((gameState.players || []).map((p) => [p.id, opponentHandCount(p)]));
  const prevDeck = gameState.deckCount;
  const prevColor = gameState.currentColor;

  gameState.isOnline = true;
  gameState.roomCode = data.roomCode || data.code || gameState.roomCode;
  gameState.gameStarted = !!data.started;
  gameState.roomCapacity = data.capacity || gameState.roomCapacity;
  gameState.isPublic = !!data.isPublic;
  gameState.players = (data.players || []).map((sp, idx) => ({
    id: sp.id,
    name: sp.name,
    avatar: sp.avatar,
    isMe: idx === (data.gameState || {}).playerIndex,
    isHost: !!sp.isHost,
    isBot: !!sp.isBot,
    hasUno: !!sp.hasUno,
    handCount: sp.handCount,
    hand: idx === (data.gameState || {}).playerIndex
      ? dedupeCards((data.gameState || {}).myHand || [])
      : []
  }));

  const gs = data.gameState || {};
  gameState.playerIndex = gs.playerIndex || 0;
  gameState.currentPlayer = gs.currentPlayer;
  gameState.direction = gs.direction;
  gameState.currentColor = gs.currentColor || null;
  gameState.discard = gs.discardTop ? [gs.discardTop] : [];
  gameState.deckCount = gs.deckCount;
  gameState.winner = gs.winner ? { name: gs.winner.name } : null;

  applyBotChat(data.botChat);
  syncChatHistory(gs.chatHistory);

  if (!data.started) {
    hideWinnerOverlay();
    if (gameState.screenState !== 'room') {
      showScreen('room');
    }
    renderWaitingRoom(data);
    return;
  }

  if (gameState.screenState !== 'gameplay') {
    showScreen('gameplay');
    DOM.roomInfoDisplay.textContent = `Room: ${gameState.roomCode}`;
  }

  // ===== ANIMASI KLIENT (deteksi perubahan state dari host) =====
  if (isClient) {
    const newTop = gs.discardTop;
    // Giliran saya baru saja main secara optimis? (untuk menghindari animasi dobel)
    const ownPlay = gameState._optTs && (Date.now() - gameState._optTs) < 700;
    gameState._optTs = 0;
    // Deck diacak ulang dari buangan -> deckCount melonjak naik
    if (gs.deckCount > prevDeck) animateDeckRefill();
    // Kartu baru masuk tangan saya -> kartu terbang deck -> tangan
    const newMyLen = (gameState.players[gs.playerIndex] && gameState.players[gs.playerIndex].hand)
      ? gameState.players[gs.playerIndex].hand.length
      : 0;
    if (newMyLen > prevMyLen) {
      animateDeckToHand();
      playSound('draw');
    }
    // Lawan ambil kartu (+2/+4) -> kartu terbang deck -> seat mereka
    gameState.players.forEach((p, i) => {
      if (i === gs.playerIndex) return;
      const before = prevCounts.get(p.id);
      if (before !== undefined && opponentHandCount(p) > before) {
        const from = DOM.drawPile.getBoundingClientRect();
        const to = seatRect(i);
        if (from && to) animateCardTo(from, to, null, { dur: 340, back: true, rot: -7 });
      }
    });
    // Kartu atas berubah -> animasi main kartu (dari seat/giliran sebelumnya)
    if (newTop && prevTopId && prevTopId !== newTop.id) {
      const who = prevCur;
      const meNow = gs.playerIndex;
      if (!ownPlay) {
        const from = who === meNow ? DOM.playerDock.getBoundingClientRect() : seatRect(who);
        const to = DOM.discardPile.getBoundingClientRect();
        if (from && to) {
          animateCardTo(from, to, newTop, { dur: 380 });
          playSound('play');
        }
      }
      triggerActionEffect(newTop, who);
    }
    // Wild/+4 -> flash warna aktif (lewati bila sudah flash saat main optimis)
    if (newTop && (newTop.value === 'wild' || newTop.value === 'wild4') && gs.currentColor && gs.currentColor !== prevColor) {
      if (!ownPlay) triggerWildFlash(gs.currentColor);
    }
  }

  renderGameplay();

  if (gameState.winner) {
    pushStatusEvent(`🏆 ${gameState.winner.name} menang!`);
  } else {
    const cur = gameState.players[gameState.currentPlayer];
    if (cur) pushStatusEvent(`Giliran ${cur.name}`);
  }
}

/* ============================================
   AUTO-FILL BOT & RESYNC
   ============================================ */

function autoFillBots() {
  let botId = 1;
  while (gameState.players.length < gameState.roomCapacity) {
    gameState.players.push({
      id: 'bot-' + (botId++),
      name: 'Bot',
      avatar: '🤖',
      isMe: false,
      isHost: false,
      isBot: true,
      conn: null,
      hand: [],
      hasUno: false
    });
  }
}

// Resync berkala menjaga client tetap sinkron (mencegah "kartu tidak sinkron")
function startResync() {
  clearInterval(gameState.resyncTimer);
  if (!gameState.isHost || !gameState.isOnline) return;
  gameState.resyncTimer = setInterval(() => {
    if (gameState.gameStarted && gameState.players.length && !gameState.winner) {
      broadcastState();
    }
  }, 2000);
}

function stopResync() {
  clearInterval(gameState.resyncTimer);
  gameState.resyncTimer = null;
}

/* ============================================
   POLLING STATUS & SESSION (Client)
   ============================================ */

// Polling berkala: client terus meminta state terbaru dari host (SYNC_REQ).
// Ini mencegah client "stuck" di Ruang Tunggu saat host sudah memulai game,
// dan memastikan layar selalu berpindah ke arena begitu status berubah jadi 'playing'.
function startStatePolling() {
  stopStatePolling();
  if (gameState.isHost || !gameState.isOnline) return;
  const tick = () => {
    if (gameState.conn && gameState.conn.open) {
      gameState.conn.send({ type: 'SYNC_REQ' });
    }
    // Lebih cepat di ruang tunggu (cegah stuck), lebih longgar saat gameplay (resync host sudah jalan).
    const ms = gameState.screenState === 'gameplay' ? 2000 : 1500;
    gameState.pollTimer = setTimeout(tick, ms);
  };
  tick();
}

function stopStatePolling() {
  clearTimeout(gameState.pollTimer);
  gameState.pollTimer = null;
}

// Simpan sesi room (untuk recovery saat halaman di-refresh).
function saveSession() {
  try {
    sessionStorage.setItem('unoduel_session', JSON.stringify({
      code: gameState.roomCode,
      playerId: (gameState.peer && gameState.peer.id) || '',
      name: getPlayerName(),
      avatar: gameState.playerProfile.avatar || '👦',
      ts: Date.now()
    }));
  } catch (e) {
    /* ignore */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem('unoduel_session');
  } catch (e) {
    /* ignore */
  }
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem('unoduel_session') || 'null');
  } catch (e) {
    return null;
  }
}

/* ============================================
   P2P - LOGIKA HOST
   ============================================ */

function createRoom(isPublic, capacity) {
  resetOnlineState();
  gameState.gameMode = 'online';
  gameState.isOnline = true;
  gameState.isHost = true;
  gameState.isPublic = !!isPublic;
  gameState.roomCapacity = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, parseInt(capacity, 10) || gameState.roomCapacity || 4));
  spawnHostPeer();
}

function spawnHostPeer() {
  const code = randomCode(6);
  const peerId = PEER_PREFIX + code;

  let peer;
  peer = makePeer(peerId, {
    onBrokerDown: () => {
      if (gameState.peer !== peer) return;
      if (!brokerDown()) {
        updateServerStatus();
        showToast('Broker tidak tersedia. Coba lagi.');
        return;
      }
      gameState.peer = null;
      spawnHostPeer();
    }
  });
  gameState.peer = peer;

  peer.on('open', () => {
    gameState.roomCode = code;
    gameState.connected = true;
    hideDisconnectBanner();
    updateServerStatus();
    gameState.players = [{
      id: peer.id,
      name: getPlayerName(),
      avatar: gameState.playerProfile.avatar || '👦',
      isMe: true,
      isHost: true,
      isBot: false,
      conn: null,
      hand: [],
      hasUno: false
    }];
    enterWaitingRoom(code);
    if (gameState.isPublic) {
      lobbyEnsure();
      setTimeout(lobbyRegister, 1200);
    }
  });

  // Terima koneksi masuk dari client (multi-client)
  peer.on('connection', (conn) => {
    // Pasang listener data SEGERA (tidak menunggu conn.on('open'))
    conn.on('open', () => {
      gameState.connections.push(conn);
      conn.on('close', () => handleClientDisconnect(conn));
      conn.on('error', () => handleClientDisconnect(conn));
    });
    conn.on('data', (data) => handleHostData(conn, data));
  });

  peer.on('disconnected', () => {
    if (gameState.peer !== peer) return;
    showDisconnectBanner('Menghubungkan kembali...');
    if (!peer.destroyed) {
      setTimeout(() => {
        if (gameState.peer === peer && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch (e) {
            // ignore
          }
        }
      }, 1200);
    }
  });

  peer.on('error', (err) => {
    if (gameState.peer !== peer) return;
    if (err.type === 'unavailable-id') {
      try { peer.destroy(); } catch (e) { /* ignore */ }
      gameState.peer = null;
      spawnHostPeer();
      return;
    }
    if (err.type === 'peer-unavailable') return;
    updateServerStatus();
    showToast('Gagal membuat room: ' + err.type);
  });
}

function handleHostData(conn, data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'JOIN_ROOM': {
      const playerInfo = data.player || {};
      const resumeId = data.resumeId || null;

      // Sambung ulang / recovery setelah reload: cocokkan pemain lama via resumeId.
      let existing = gameState.players.find((p) => p.id === conn.peer);
      if (!existing && resumeId) {
        existing = gameState.players.find((p) => p.id === resumeId);
      }

      if (existing) {
        const wasBot = existing.isBot;
        existing.id = conn.peer;
        existing.conn = conn;
        existing.isBot = false;
        existing.name = playerInfo.name || existing.name.replace(/\s*🤖\s*$/, '');
        existing.avatar = playerInfo.avatar || (existing.avatar === '🤖' ? '👤' : existing.avatar);
        clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = null;
        if (wasBot) {
          addLog(`${existing.name} kembali — lanjut main 🤝`);
          showToast(`${existing.name} kembali!`);
        }
        if (gameState.gameStarted) {
          // Kalau pemain ini sedang pilih warna Wild saat putus, kirim ulang
          // PENDING_WILD supaya color picker muncul lagi (anti-stuck giliran).
          if (gameState.pendingWild !== null && existing === gameState.players[gameState.currentPlayer]) {
            conn.send({ type: 'PENDING_WILD', cardIndex: gameState.pendingWild });
          }
          // Kirim state penuh agar pemain langsung kembali ke arena game yang benar.
          conn.send(makeStatePayload('SYNC_STATE', gameState.players.indexOf(existing)));
          return;
        }
        broadcastState();
        return;
      }

      if (gameState.gameStarted) {
        conn.send({ type: 'TOAST', message: 'Game sudah dimulai' });
        return;
      }
      if (gameState.players.length >= gameState.roomCapacity) {
        conn.send({ type: 'TOAST', message: 'Ruangan penuh' });
        return;
      }
      gameState.players.push({
        id: conn.peer,
        name: playerInfo.name || 'Pemain',
        avatar: playerInfo.avatar || '👤',
        isMe: false,
        isHost: false,
        isBot: false,
        conn,
        hand: [],
        hasUno: false
      });
      gameState.players = dedupePlayers(gameState.players);
      broadcastState();
      if (gameState.isPublic) lobbyRegister();
      break;
    }

    // Polling status room dari client: balas dengan state terbaru (ruang tunggu / arena).
    case 'SYNC_REQ': {
      const idx = gameState.players.findIndex((p) => p.id === conn.peer);
      if (idx === -1) return;
      conn.send(makeStatePayload('SYNC_STATE', idx));
      break;
    }

    case 'CHAT': {
      if (data.id && gameState.seenChatIds.has(data.id)) break;
      const player = gameState.players.find((p) => p.id === conn.peer);
      if (!player) return;
      const msg = { type: 'CHAT', id: data.id, sender: player.name, avatar: player.avatar, text: data.text, emote: data.emote };
      appendChat({ id: msg.id, kind: msg.emote ? 'emote' : 'msg', sender: msg.sender, avatar: msg.avatar, text: msg.text, emote: msg.emote });
      if (data.emote) playEmoteSound(emoteSoundOf(data.emote));
      forwardChat(msg, conn.peer);
      break;
    }

    case 'ACTION': {
      const idx = gameState.players.findIndex((p) => p.id === conn.peer);
      if (idx === -1) return;
      handleGameAction(idx, conn, data, false);
      break;
    }

    default:
      break;
  }
}

function handleGameAction(idx, conn, msg, isLocal) {
  const action = msg.action;
  const d = msg.data || {};
  const player = gameState.players[idx];

  if (action === 'NEW_ROUND') {
    if (gameState.isHost) startOnlineGame();
    return;
  }

  if (gameState.winner) return;
  if (!player) return;

  if (action === 'PLAY_CARD') {
    if (idx !== gameState.currentPlayer) return;
    if (roomPlayCard(idx, d.cardIndex, d.chosenColor)) afterRoomChange();
    return;
  }

  // Dobel: mainkan 2 kartu angka sama sekaligus
  if (action === 'PLAY_PAIR') {
    if (idx !== gameState.currentPlayer) return;
    const inds = d.cardIndices || [];
    if (inds.length !== 2) return;
    if (roomPlayPair(idx, inds[0], inds[1], d.chosenColor)) afterRoomChange();
    return;
  }

  // PASS wajib ambil 1 kartu; kalau hasil draw bisa dimainkan -> tetap giliran
  if (action === 'PASS' || action === 'DRAW') {
    if (idx !== gameState.currentPlayer) return;
    const drawn = drawCardFor(idx);
    if (!drawn) {
      endRoundFewestCards('❌ Deck habis');
      broadcastState();
      return;
    }
    addLog(action === 'PASS' ? '🎴 Ambil 1 kartu (Pass)' : '🎴 Ambil 1 kartu');
    playSound('draw');
    if (isValidMove(drawn, topCard())) {
      addLog('✅ Bisa dimainkan!');
      if (drawn.color === 'wild' || drawn.value === 'wild4') {
        gameState.pendingWild = player.hand.length - 1;
        if (isLocal) {
          DOM.colorPicker.classList.remove('hidden');
        } else if (conn && conn.open) {
          conn.send({ type: 'PENDING_WILD', cardIndex: player.hand.length - 1 });
        }
        broadcastState();
        return;
      }
      if (roomPlayCard(idx, player.hand.length - 1)) afterRoomChange();
    } else {
      gameState.currentPlayer = nextTurn(idx);
      afterRoomChange();
    }
    return;
  }

  if (action === 'UNO') {
    player.hasUno = true;
    addLog('🎺 UNO!');
    playSound('win');
    broadcastState();
  }
}

function handleClientDisconnect(conn) {
  const idx = gameState.players.findIndex((p) => p.id === conn.peer);
  if (idx === -1) return;
  const player = gameState.players[idx];
  const name = player.name;

  // Grace period: beri kesempatan pemain sambung ulang (mis. reload halaman) sebelum diganti bot.
  if (gameState.gameStarted && !player.isBot && !player.disconnectTimer) {
    player.disconnectTimer = setTimeout(() => {
      finishClientDisconnect(conn, name);
    }, 8000);
    addLog(`${name} putus — menunggu sambung ulang...`);
    return;
  }

  // Timer sudah berjalan (error + close dipanggil dua kali) -> abaikan duplikat.
  if (player.disconnectTimer) return;

  finishClientDisconnect(conn, name);
}

function finishClientDisconnect(conn, name) {
  const idx = gameState.players.findIndex((p) => p.id === conn.peer);
  if (idx === -1) return;
  clearTimeout(gameState.players[idx].disconnectTimer);
  gameState.players[idx].disconnectTimer = null;

  const connIdx = gameState.connections.indexOf(conn);
  if (connIdx !== -1) gameState.connections.splice(connIdx, 1);

  // Game sudah berjalan: ganti pemain yang putus dengan BOT (tangan dipertahankan)
  // supaya game tidak berhenti & tidak ada yang "stuck" — anti-gangguan mabar.
  if (gameState.gameStarted) {
    const p = gameState.players[idx];

    // Pemain ini lagi memilih warna Wild tapi putus -> selesaikan otomatis
    // (kalau dibiarkan, gilirannya macet selamanya = stuck).
    if (idx === gameState.currentPlayer && gameState.pendingWild !== null && p.hand) {
      const pendingIdx = gameState.pendingWild;
      gameState.pendingWild = null;
      if (pendingIdx >= 0 && pendingIdx < p.hand.length) {
        roomPlayCard(idx, pendingIdx, COLORS[Math.floor(Math.random() * 4)]);
      } else {
        gameState.currentPlayer = nextTurn(idx);
      }
    }

    if (!gameState.winner) {
      p.isBot = true;
      p.isMe = false;
      p.isHost = false;
      p.conn = null;
      p.avatar = '🤖';
      p.hasUno = false;
      if (p.name !== 'Bot') p.name = (p.name || name || 'Pemain') + ' 🤖';
      addLog(`${name} putus — diganti bot 🤖`);
      showToast(`${name} putus — game lanjut dengan bot`);
      playSound('action');
      broadcastState();
      hostBotTurn();
      return;
    }
    broadcastState();
    return;
  }

  // Belum mulai game: hapus dari daftar saja.
  gameState.players.splice(idx, 1);
  addLog(`${name} keluar`);

  if (gameState.isPublic) lobbyRegister();
  broadcastState();
}

function startOnlineGame() {
  if (!gameState.isHost) return;
  if (gameState.players.length < MIN_PLAYERS) {
    showToast(`Butuh minimal ${MIN_PLAYERS} pemain`);
    return;
  }

  autoFillBots();
  const freshDeck = createDeckFor(gameState.players.length);
  gameState.deck = freshDeck;
  gameState.discard = [];
  gameState.deckCount = freshDeck.length;

  for (const p of gameState.players) {
    p.hand = [];
    p.hasUno = false;
  }

  for (let i = 0; i < 7; i += 1) {
    for (const p of gameState.players) {
      const card = gameState.deck.pop();
      if (card) p.hand.push(card);
    }
  }

  let first = gameState.deck.pop();
  while (first && ACTION_VALUES.includes(first.value)) {
    gameState.deck.unshift(first);
    first = gameState.deck.pop();
  }

  gameState.deckCount = gameState.deck.length;
  gameState.discard = [first || { color: 'red', value: '0' }];
  gameState.currentPlayer = 0;
  gameState.direction = 1;
  gameState.currentColor = (first || { color: 'red' }).color;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.pairSelect = null;
  gameState.gameStarted = true;
  gameState.log = [];

  hideWinnerOverlay();
  DOM.colorPicker.classList.add('hidden');
  DOM.chatMessages.innerHTML = '';
  gameState.chatHistory = [];
  gameState.seenChatIds.clear();
  addLog('🃏 Ronde dimulai!');
  broadcastState();
  hostBotTurn();
  startResync();

  // Bot sapa pembuka biar suasana hidup
  setTimeout(() => {
    const b = gameState.players.findIndex((p) => p.isBot);
    if (b > -1 && !gameState.winner) botSpeak(b, 'greeting');
  }, 1200);
}

/* ============================================
   LOBBY REGISTRY (Room Publik - best-effort PeerJS)
   ============================================ */

function makeLobbyRoomInfo() {
  return {
    code: gameState.roomCode,
    hostName: getPlayerName(),
    hostAvatar: gameState.playerProfile.avatar || '👤',
    players: gameState.players.length,
    capacity: gameState.roomCapacity,
    isPublic: gameState.isPublic,
    members: gameState.players.map((p) => p.name)
  };
}

// Coba jadi keeper lobby; jika ID sudah dipakai orang lain, jadi client.
function lobbyEnsure() {
  if (gameState.lobby.peer && !gameState.lobby.peer.destroyed) return;
  let p;
  p = makePeer(LOBBY_PEER_ID, {
    onBrokerDown: () => {
      if (gameState.lobby.peer !== p) return;
      if (!brokerDown()) {
        gameState.lobby.peer = null;
        return;
      }
      gameState.lobby.peer = null;
      lobbyEnsure();
    }
  });
  gameState.lobby.peer = p;
  gameState.lobby.keeper = false;

  p.on('open', () => {
    gameState.lobby.keeper = true;
    // Broker PeerJS terhubung -> status Online (di lobby/ruang tunggu)
    if (!gameState.gameStarted) updateServerStatus();
    p.on('connection', (conn) => {
      conn.on('open', () => {
        gameState.lobby.conns.add(conn);
        conn.on('close', () => gameState.lobby.conns.delete(conn));
        conn.on('error', () => gameState.lobby.conns.delete(conn));
        conn.send({ type: 'LOBBY_LIST', rooms: gameState.lobby.rooms });
      });
      conn.on('data', (data) => handleLobbyKeeperData(conn, data));
    });
    if (gameState.isHost && gameState.isPublic && gameState.roomCode) {
      setTimeout(lobbyRegister, 800);
    }
    lobbyBroadcastList();
  });

  p.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      try { p.destroy(); } catch (e) { /* ignore */ }
      gameState.lobby.peer = null;
      gameState.lobby.keeper = false;
      lobbyConnectClient();
    } else {
      if (!gameState.connected && !gameState.gameStarted) {
      }
    }
  });

  p.on('disconnected', () => {
    if (gameState.lobby.keeper) {
      setTimeout(() => {
        if (gameState.lobby.peer && !gameState.lobby.peer.destroyed) {
          try { gameState.lobby.peer.reconnect(); } catch (e) { /* ignore */ }
        }
      }, 1000);
    }
  });
}

function lobbyConnectClient() {
  let p;
  p = makePeer(undefined, {
    onBrokerDown: () => {
      if (gameState.lobby.peer !== p) return;
      if (!brokerDown()) {
        gameState.lobby.peer = null;
        return;
      }
      try { if (!p.destroyed) p.destroy(); } catch (e) { /* ignore */ }
      gameState.lobby.peer = null;
      lobbyConnectClient();
    }
  });
  gameState.lobby.peer = p;

  p.on('open', () => {
    if (!gameState.gameStarted) updateServerStatus();
    const conn = p.connect(LOBBY_PEER_ID, { reliable: true });
    gameState.lobby.conn = conn;
    conn.on('open', () => {
      conn.send({ type: 'LOBBY_LIST_REQ' });
      if (gameState.isHost && gameState.isPublic && gameState.roomCode) {
        conn.send({ type: 'LOBBY_REGISTER', room: makeLobbyRoomInfo() });
      }
    });
    conn.on('data', handleLobbyClientData);
    conn.on('close', () => { gameState.lobby.conn = null; });
    conn.on('error', () => { gameState.lobby.conn = null; });
  });

  p.on('error', () => { /* keeper offline / gagal */ });
}

function handleLobbyKeeperData(conn, data) {
  if (!data || !data.type) return;
  if (data.type === 'LOBBY_REGISTER') {
    const room = data.room;
    if (!room || !room.code) return;
    const existing = gameState.lobby.rooms.find((r) => r.code === room.code);
    if (existing) Object.assign(existing, room);
    else gameState.lobby.rooms.push(room);
    lobbyBroadcastList();
  } else if (data.type === 'LOBBY_UNREGISTER') {
    gameState.lobby.rooms = gameState.lobby.rooms.filter((r) => r.code !== data.code);
    lobbyBroadcastList();
  } else if (data.type === 'LOBBY_LIST_REQ') {
    conn.send({ type: 'LOBBY_LIST', rooms: gameState.lobby.rooms });
  }
}

function handleLobbyClientData(data) {
  if (!data || !data.type) return;
  if (data.type === 'LOBBY_LIST') {
    gameState.lobby.rooms = Array.isArray(data.rooms) ? data.rooms : [];
    renderPublicRooms();
    updateOnlineUsers();
  }
}

function lobbyBroadcastList() {
  const payload = { type: 'LOBBY_LIST', rooms: gameState.lobby.rooms };
  gameState.lobby.conns.forEach((conn) => {
    if (conn.open) conn.send(payload);
  });
  renderPublicRooms();
  updateOnlineUsers();
}

function lobbyRegister() {
  if (!gameState.isPublic || !gameState.roomCode) return;
  if (gameState.lobby.keeper) {
    const room = makeLobbyRoomInfo();
    const existing = gameState.lobby.rooms.find((r) => r.code === room.code);
    if (existing) Object.assign(existing, room);
    else gameState.lobby.rooms.push(room);
    lobbyBroadcastList();
  } else if (gameState.lobby.conn && gameState.lobby.conn.open) {
    gameState.lobby.conn.send({ type: 'LOBBY_REGISTER', room: makeLobbyRoomInfo() });
  } else {
    lobbyEnsure();
    setTimeout(lobbyRegister, 1500);
  }
}

function lobbyUnregister() {
  if (!gameState.roomCode) return;
  if (gameState.lobby.keeper) {
    gameState.lobby.rooms = gameState.lobby.rooms.filter((r) => r.code !== gameState.roomCode);
    lobbyBroadcastList();
  } else if (gameState.lobby.conn && gameState.lobby.conn.open) {
    gameState.lobby.conn.send({ type: 'LOBBY_UNREGISTER', code: gameState.roomCode });
  }
}

function lobbyRefresh() {
  if (gameState.lobby.keeper) {
    lobbyBroadcastList();
    return;
  }
  if (gameState.lobby.conn && gameState.lobby.conn.open) {
    gameState.lobby.conn.send({ type: 'LOBBY_LIST_REQ' });
    return;
  }
  // Coba ulang koneksi ke lobby keeper
  if (gameState.lobby.peer && !gameState.lobby.peer.destroyed) {
    try {
      gameState.lobby.peer.destroy();
    } catch (e) {
      // ignore
    }
    gameState.lobby.peer = null;
  }
  gameState.lobby.conn = null;
  lobbyEnsure();
  setTimeout(() => {
    if (gameState.lobby.conn && gameState.lobby.conn.open) {
      gameState.lobby.conn.send({ type: 'LOBBY_LIST_REQ' });
    }
  }, 1500);
}

function renderPublicRooms() {
  const list = DOM.publicRoomList;
  const merged = [];
  const seen = new Set();
  gameState.lobby.rooms.forEach((r) => {
    if (!r.isPublic || seen.has(r.code)) return;
    seen.add(r.code);
    merged.push(r);
  });
  const rooms = merged.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!rooms.length) {
    list.innerHTML = '<li class="list-empty">Belum ada room publik. Buat room atau segarkan.</li>';
    return;
  }
  list.innerHTML = rooms.map((r) => `
    <li class="room-row">
      <span class="room-emoji">🎉</span>
      <div class="room-meta">
        <div class="room-name">${escapeHtml(r.hostName || 'Host')}</div>
        <div class="room-detail">Kode: ${escapeHtml(r.code)} · ${r.players}/${r.capacity} pemain</div>
      </div>
      <button class="room-join" data-code="${escapeHtml(r.code)}">GABUNG</button>
    </li>
  `).join('');
  list.querySelectorAll('.room-join').forEach((btn) => {
    btn.addEventListener('click', () => joinRoom(btn.dataset.code));
  });
}

function updateOnlineUsers() {
  const users = new Set();
  users.add(getPlayerName());
  gameState.lobby.rooms.forEach((r) => {
    if (r.hostName) users.add(r.hostName);
    (r.members || []).forEach((m) => users.add(m));
  });
  gameState.onlineUsers = [...users];
  renderOnlineUsers();
}

function renderOnlineUsers() {
  const list = DOM.onlineUsersList;
  if (!gameState.onlineUsers.length) {
    list.innerHTML = '<li class="list-empty">Belum ada pemain online.</li>';
    return;
  }
  list.innerHTML = gameState.onlineUsers
    .map((u) => `<li>🟢 ${escapeHtml(u)}</li>`)
    .join('');
}

/* ============================================
   AUTH & STATUS SERVER (Vercel /api - Neon)
   ============================================ */

function showAuthMsg(text, ok) {
  if (!DOM.authMsg) return;
  DOM.authMsg.textContent = text || '';
  DOM.authMsg.className = 'auth-msg ' + (ok ? 'ok' : (text ? 'err' : ''));
}

function applyAuthUI() {
  const logged = !!gameState.auth.username || !!gameState.auth.isGuest;
  // Header dashboard
  if (DOM.dashName) {
    DOM.dashName.textContent = gameState.auth.isGuest
      ? gameState.playerProfile.name + ' (Tamu)'
      : (gameState.auth.username || gameState.playerProfile.name || 'Pemain');
  }
  if (DOM.dashAvatar) DOM.dashAvatar.textContent = gameState.playerProfile.avatar || gameState.auth.avatar || '👦';
  if (DOM.dashStats) {
    const wins = (gameState.me && gameState.me.wins) || 0;
    DOM.dashStats.textContent = gameState.auth.isGuest
      ? 'Tamu — menang tidak dicatat ke papan'
      : `Rekor: ${wins} menang`;
  }
  if (DOM.authMsg) { DOM.authMsg.textContent = ''; DOM.authMsg.className = 'auth-msg'; }
  applyAuthGate();
}

// Gerbang: belum login/tamu -> halaman auth; sudah -> dashboard lobby
function applyAuthGate() {
  const logged = !!gameState.auth.username || !!gameState.auth.isGuest;
  if (logged && gameState.screenState === 'auth') {
    showScreen('lobby');
    lobbyEnsure();
  } else if (!logged && gameState.screenState !== 'auth') {
    showScreen('auth');
  }
}

function setAuthMode(mode) {
  gameState.authMode = mode === 'register' ? 'register' : 'login';
  if (DOM.authTabLogin) DOM.authTabLogin.classList.toggle('active', gameState.authMode === 'login');
  if (DOM.authTabRegister) DOM.authTabRegister.classList.toggle('active', gameState.authMode === 'register');
  if (DOM.authSubmitBtn) DOM.authSubmitBtn.textContent = gameState.authMode === 'register' ? '✨ Buat Akun' : '🚀 Masuk';
  if (DOM.authPassword) DOM.authPassword.setAttribute('autocomplete', gameState.authMode === 'register' ? 'new-password' : 'current-password');
}

// Login cepat tanpa akun server
function loginGuest() {
  gameState.auth.isGuest = true;
  gameState.auth.username = '';
  gameState.auth.avatar = gameState.playerProfile.avatar || '👦';
  gameState.playerProfile.name = 'Guest-' + Math.floor(1000 + Math.random() * 9000);
  gameState.playerProfile.avatar = gameState.auth.avatar;
  persistAuth();
  applyAuthUI();
  showToast('Masuk sebagai tamu. Menang tidak dicatat.');
  updateOnlineUsers();
}

function persistAuth() {
  try {
    localStorage.setItem('unoduel_auth', JSON.stringify({
      token: gameState.auth.token,
      username: gameState.auth.username,
      avatar: gameState.auth.avatar,
      isGuest: !!gameState.auth.isGuest,
      guestName: gameState.auth.isGuest ? gameState.playerProfile.name : ''
    }));
  } catch (e) { /* ignore */ }
}

async function apiPost(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function handleAuth(action) {
  const username = ((DOM.authUsername && DOM.authUsername.value) || '').trim();
  const password = (DOM.authPassword && DOM.authPassword.value) || '';
  if (username.length < 3) { showAuthMsg('Username minimal 3 karakter', false); return; }
  if (password.length < 4) { showAuthMsg('Password minimal 4 karakter', false); return; }
  const { ok, data } = await apiPost('/api/' + action, { username, password, avatar: gameState.playerProfile.avatar });
  if (!ok) { showAuthMsg((data && data.error) || 'Gagal, coba lagi', false); return; }
  gameState.auth.token = data.token || '';
  gameState.auth.username = (data.user && data.user.username) || username;
  gameState.auth.avatar = (data.user && data.user.avatar) || gameState.playerProfile.avatar;
  gameState.auth.isGuest = false;
  gameState.playerProfile.name = gameState.auth.username;
  gameState.playerProfile.avatar = gameState.auth.avatar;
  if (DOM.authUsername) DOM.authUsername.value = '';
  if (DOM.authPassword) DOM.authPassword.value = '';
  persistAuth();
  showToast('Selamat datang, ' + gameState.auth.username + '! 👋');
  applyAuthUI();
  loadLeaderboard();
  updateOnlineUsers();
}

async function logoutUser() {
  gameState.auth.token = '';
  gameState.auth.username = '';
  gameState.auth.avatar = '';
  gameState.auth.isGuest = false;
  gameState.playerProfile.name = 'Pemain';
  gameState.me = null;
  try { localStorage.removeItem('unoduel_auth'); } catch (e) { /* ignore */ }
  applyAuthUI();
  showToast('Sudah keluar.');
  loadLeaderboard();
  updateOnlineUsers();
}

async function restoreAuth() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('unoduel_auth') || 'null'); } catch (e) { /* ignore */ }
  if (!saved || (!saved.token && !saved.isGuest)) { applyAuthUI(); return; }

  // Sesi tamu: langsung masuk dashboard tanpa cek server
  if (saved.isGuest) {
    gameState.auth.isGuest = true;
    gameState.auth.username = '';
    gameState.auth.avatar = saved.avatar || '👦';
    gameState.playerProfile.name = saved.guestName || 'Guest-' + Math.floor(1000 + Math.random() * 9000);
    gameState.playerProfile.avatar = gameState.auth.avatar;
    applyAuthUI();
    return;
  }

  try {
    const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + saved.token } });
    const data = await res.json();
    if (res.ok && data && data.user) {
      gameState.auth.token = saved.token;
      gameState.auth.username = data.user.username;
      gameState.auth.avatar = data.user.avatar || saved.avatar || '👦';
      gameState.playerProfile.name = gameState.auth.username;
      gameState.playerProfile.avatar = gameState.auth.avatar;
      gameState.me = data.me || null;
    } else {
      try { localStorage.removeItem('unoduel_auth'); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // server belum bisa dijangkau -> pakai sesi lokal dulu
    gameState.auth.token = saved.token;
    gameState.auth.username = saved.username;
    gameState.auth.avatar = saved.avatar || '👦';
    gameState.playerProfile.name = gameState.auth.username;
    gameState.playerProfile.avatar = gameState.auth.avatar;
  }
  applyAuthUI();
  loadLeaderboard();
}

async function checkServerHealth() {
  let ok = false;
  let db = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      const data = await res.json();
      ok = !!(data && data.ok);
      db = !!(data && data.db);
      break;
    } catch (e) {
      // cold-start / gagal sesaat -> coba sekali lagi
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
  }

  if (ok) {
    gameState.auth.failStreak = 0;
  } else {
    gameState.auth.failStreak = (gameState.auth.failStreak || 0) + 1;
  }
  // Offline hanya setelah 2 kegagalan beruntun, biar tidak berkedip-kedip
  gameState.auth.serverOk = ok || gameState.auth.failStreak < 2;
  gameState.auth.dbOk = db;
  updateServerStatus();
  renderLeaderboard();
}

// Status indikator: fokus pada koneksi P2P (yang dipakai gameplay).
// Status "Offline" merah tidak pernah ditampilkan agar tidak mengganggu pemain —
// cukup tampil netral "Menghubungkan..." saat server API tak terjangkau.
function updateServerStatus() {
  if (gameState.connected) {
    setConnectionState(
      'online',
      gameState.isOnline ? 'P2P Terhubung' : 'Terhubung'
    );
    return;
  }
  if (gameState.auth.serverOk) {
    setConnectionState('online', 'Server Online');
  } else {
    setConnectionState('connecting', 'Menghubungkan...');
  }
}

/* ============================================
   LEADERBOARD (Papan Peringkat - Neon via Vercel /api/score)
   ============================================ */

async function loadLeaderboard() {
  gameState.leaderboard = [];
  gameState.me = null;
  const meName = getPlayerName();
  try {
    const qs = meName ? '?name=' + encodeURIComponent(meName) : '';
    const res = await fetch('/api/score' + qs, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (Array.isArray(data)) {
      gameState.leaderboard = data;
    } else if (data && Array.isArray(data.leaderboard)) {
      gameState.leaderboard = data.leaderboard;
      gameState.me = data.me || null;
    }
  } catch (e) {
    console.warn('Gagal memuat leaderboard:', e);
  }
  renderLeaderboard();
}

async function recordWin(name) {
  if (!name || name === 'Bot') return;
  if (!gameState.auth.username || gameState.auth.isGuest) return; // tamu tidak dicatat ke papan
  try {
    await fetch('/api/score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(gameState.auth.token ? { Authorization: 'Bearer ' + gameState.auth.token } : {})
      },
      body: JSON.stringify({ name: getPlayerName(), avatar: gameState.playerProfile.avatar })
    });
  } catch (e) {
    console.warn('Gagal menyimpan skor:', e);
  }
  loadLeaderboard();
}

function renderLeaderboard() {
  const lists = [DOM.leaderboardList, DOM.authLeaderboardList].filter(Boolean);
  const statusHtml = (extra) => `<li class="list-empty">${extra}</li>`;
  let html = '';
  if (gameState.auth.serverOk && gameState.auth.dbOk === false) {
    html = statusHtml('⚠️ Database belum terhubung.<br/><span class="lb-hint">Atur DATABASE_URL di Vercel env lalu redeploy.</span>');
  } else if (!gameState.leaderboard || !gameState.leaderboard.length) {
    html = statusHtml('Belum ada skor. Menangkan game untuk masuk papan.');
  } else {
    const top5 = gameState.leaderboard.slice(0, 5);
    html = top5.map((e, i) => {
      const isMe = gameState.me && e.name === gameState.me.name;
      return `<li class="${isMe ? 'lb-me' : ''}"><span class="rank">${i + 1}</span> ${escapeHtml(e.name)}<span class="points">${e.wins}</span></li>`;
    }).join('');
  }
  lists.forEach((list) => { list.innerHTML = html; });
}
/* ============================================
   P2P - LOGIKA CLIENT
   ============================================ */

let joinTimeout = null;
let _joinAttempts = 0;
let _joinActive = false;

function joinRoom(code, isReconnect) {
  resetOnlineState();
  _joinActive = true;
  if (!isReconnect) _joinAttempts = 0;
  gameState.gameMode = 'online';
  gameState.isOnline = true;
  gameState.isHost = false;
  rejoining = false;

  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    showToast('Masukkan kode room');
    return;
  }

  const targetId = PEER_PREFIX + cleanCode;
  const session = loadSession();
  const resumeId = (session && session.code === cleanCode && session.playerId) || null;

  const failRetry = () => {
    if (!_joinActive) return;
    _joinActive = false;
    _joinAttempts += 1;
    if (_joinAttempts >= PEER_BROKERS.length * 2) {
      updateServerStatus();
      if (gameState.screenState === 'gameplay' || gameState.screenState === 'room') {
        clearSession();
        leaveGame();
      } else {
        DOM.joinPrivateBtn.disabled = false;
        DOM.joinPrivateBtn.textContent = 'GABUNG';
        showToast('Room tidak ditemukan. Periksa kode & koneksi.');
      }
      return;
    }
    nextBroker();
    try {
      if (gameState.peer && !gameState.peer.destroyed) gameState.peer.destroy();
    } catch (e) { /* ignore */ }
    gameState.peer = null;
    gameState.conn = null;
    setTimeout(() => {
      if (!gameState.connected) joinRoom(code, true);
    }, 700);
  };

  let peer;
  peer = makePeer(undefined, {
    onBrokerDown: () => {
      if (gameState.peer === peer) failRetry();
    }
  });
  gameState.peer = peer;

  peer.on('open', () => {
    gameState.roomCode = cleanCode;
    saveSession();
    const conn = peer.connect(targetId, { reliable: true });
    gameState.conn = conn;

    // Pasang listener data SEGERA agar tidak ada pesan yang terlewat
    conn.on('data', handleClientData);

    conn.on('open', () => {
      gameState.connected = true;
      _joinActive = false;
      _joinAttempts = 0;
      rejoinAttempts = 0;
      rejoining = false;
      hideDisconnectBanner();
      updateServerStatus();
      conn.send({
        type: 'JOIN_ROOM',
        resumeId,
        player: {
          name: getPlayerName(),
          avatar: gameState.playerProfile.avatar || '👦'
        }
      });
      // Polling status room agar tidak pernah stuck di ruang tunggu.
      startStatePolling();
      // Timeout: jika belum masuk room dalam 8 detik, anggap gagal
      clearTimeout(joinTimeout);
      joinTimeout = setTimeout(() => {
        if (gameState.screenState === 'lobby' || !gameState.gameStarted) {
          if (gameState.screenState === 'lobby') {
            updateServerStatus();
            showToast('Gagal masuk room. Periksa kode & coba lagi.');
            DOM.joinPrivateBtn.disabled = false;
            DOM.joinPrivateBtn.textContent = 'GABUNG';
          }
        }
      }, 8000);
    });

    conn.on('close', handleHostDisconnect);
    conn.on('error', handleHostDisconnect);
  });

  peer.on('disconnected', () => {
    if (gameState.peer !== peer || rejoining) return;
    showDisconnectBanner('Menghubungkan kembali...');
    if (!peer.destroyed) {
      setTimeout(() => {
        if (gameState.peer === peer && !peer.destroyed && !rejoining) {
          try {
            peer.reconnect();
          } catch (e) {
            // ignore
          }
        }
      }, 1200);
    }
  });

  peer.on('error', (err) => {
    if (gameState.peer !== peer) return;
    if (err.type === 'peer-unavailable' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'network') {
      failRetry();
      return;
    }
    clearTimeout(joinTimeout);
    stopStatePolling();
    _joinActive = false;
    DOM.joinPrivateBtn.disabled = false;
    DOM.joinPrivateBtn.textContent = 'GABUNG';
    updateServerStatus();
    showToast('Gagal terhubung: ' + err.type);
  });
}

// Penerima data di sisi CLIENT
function handleClientData(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'ROOM_UPDATE':
    case 'SYNC_STATE':
      clearTimeout(joinTimeout);
      _joinActive = false;
      rejoinAttempts = 0;
      rejoining = false;
      hideDisconnectBanner();
      applyStatePayload(data);
      break;

    case 'PENDING_WILD': {
      gameState.pendingWild = data.cardIndex;
      DOM.colorPicker.classList.remove('hidden');
      break;
    }

    case 'CHAT': {
      if (data.id && gameState.seenChatIds.has(data.id)) break;
      appendChat({
        id: data.id,
        kind: data.emote ? 'emote' : 'msg',
        sender: data.sender,
        avatar: data.avatar,
        text: data.text,
        emote: data.emote
      });
      if (data.emote) playEmoteSound(emoteSoundOf(data.emote));
      break;
    }

    case 'TOAST':
      showToast(data.message);
      break;

    default:
      break;
  }
}

// Auto-rejoin: kalau koneksi ke host drop, jangan langsung keluar.
// Coba sambung ulang ke room yang sama (resumeId) beberapa kali dulu.
let rejoinAttempts = 0;
let rejoining = false;
const MAX_REJOIN = 3;

function handleHostDisconnect() {
  clearTimeout(joinTimeout);
  stopStatePolling();
  const code = gameState.roomCode;
  if ((gameState.screenState === 'gameplay' || gameState.screenState === 'room') && code && !rejoining && rejoinAttempts < MAX_REJOIN) {
    rejoining = true;
    rejoinAttempts += 1;
    showDisconnectBanner(`Menghubungkan kembali... (${rejoinAttempts}/${MAX_REJOIN})`);
    try {
      if (gameState.peer && !gameState.peer.destroyed) gameState.peer.destroy();
    } catch (e) { /* ignore */ }
    gameState.peer = null;
    gameState.conn = null;
    setTimeout(() => {
      rejoining = false;
      if (!gameState.connected) joinRoom(code, true);
    }, 2500);
    return;
  }
  clearSession();
  showToast('Host keluar dari room');
  leaveGame();
}

/* ============================================
   RESET / LEAVE
   ============================================ */

function resetOnlineState() {
  clearTimeout(joinTimeout);
  _joinActive = false;
  rejoinAttempts = 0;
  rejoining = false;
  stopResync();
  stopStatePolling();
  gameState.roomCode = '';
  gameState.playerIndex = 0;
  gameState.isHost = false;
  gameState.isOnline = false;
  gameState.connected = false;
  gameState.isPublic = false;
  gameState.gameStarted = false;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.pairSelect = null;
  gameState.passPending = false;
  gameState.currentColor = null;
  gameState.players = [];
  gameState.connections = [];
  gameState.deck = [];
  gameState.discard = [];
  gameState.deckCount = 0;
  gameState.currentPlayer = 0;
  gameState.direction = 1;
  gameState.lastTopId = null;
  clearTimeout(gameState.botTimer);
  clearBotChat();
}

function leaveGame() {
  if (gameState.isPublic) {
    lobbyUnregister();
  }
  if (gameState.peer) {
    try {
      gameState.peer.destroy();
    } catch (e) {
      // ignore
    }
    gameState.peer = null;
  }
  gameState.conn = null;
  gameState.connections = [];
  stopStatePolling();
  clearSession();
  DOM.colorPicker.classList.add('hidden');
  hideWinnerOverlay();
  hideDisconnectBanner();
  closeSettings();
  resetOnlineState();
  updateServerStatus();
  showScreen('lobby');
}

/* ============================================
   SOLO MODE (LATIHAN SOLO vs Bot)
   ============================================ */

function resetLocalGame(botCount = 1) {
  if (gameState.peer) {
    try {
      gameState.peer.destroy();
    } catch (e) {
      // ignore
    }
    gameState.peer = null;
  }
  gameState.conn = null;
  resetOnlineState();
  gameState.gameMode = 'solo';
  gameState.isOnline = false;

  const totalPlayers = 1 + Math.max(0, Math.min(parseInt(botCount, 10) || 1, MAX_PLAYERS - 1));
  const freshDeck = createDeckFor(totalPlayers);
  gameState.deck = freshDeck;
  gameState.discard = [];
  gameState.deckCount = freshDeck.length;

  gameState.players = [
    {
      id: 'player1',
      name: getPlayerName(),
      avatar: gameState.playerProfile.avatar || '👦',
      isMe: true,
      isHost: false,
      isBot: false,
      hand: [],
      hasUno: false
    }
  ];
  for (let b = 1; b < totalPlayers; b += 1) {
    gameState.players.push({
      id: 'bot' + b,
      name: 'Bot ' + b,
      avatar: '🤖',
      isMe: false,
      isHost: false,
      isBot: true,
      hand: [],
      hasUno: false
    });
  }

  for (let i = 0; i < 7; i += 1) {
    for (const p of gameState.players) {
      p.hand.push(freshDeck.pop());
    }
  }

  let first = freshDeck.pop();
  while (first && ACTION_VALUES.includes(first.value)) {
    freshDeck.unshift(first);
    first = freshDeck.pop();
  }

  gameState.deck = freshDeck;
  gameState.deckCount = freshDeck.length;
  gameState.discard = [first || { color: 'red', value: '0' }];
  gameState.currentPlayer = 0;
  gameState.direction = 1;
  gameState.currentColor = (first || { color: 'red' }).color;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.pairSelect = null;
  gameState.gameStarted = true;
  gameState.log = [];

  hideWinnerOverlay();
  DOM.colorPicker.classList.add('hidden');
  DOM.chatMessages.innerHTML = '';
  gameState.chatHistory = [];
  gameState.seenChatIds.clear();
  addLog('🃏 Ronde dimulai!');
  renderGameplay();

  // Bot sapa pembuka biar suasana hidup
  setTimeout(() => {
    const b = gameState.players.findIndex((p) => p.isBot);
    if (b > -1 && !gameState.winner) botSpeak(b, 'greeting');
  }, 1200);
}

function drawLocal() {
  const me = gameState.players[0];
  const drawn = drawCardFor(0);

  if (!drawn) {
    endRoundFewestCards('❌ Deck habis');
    renderGameplay();
    return;
  }

  addLog('🎴 Ambil 1 kartu');
  playSound('draw');

  if (isValidMove(drawn, topCard())) {
    addLog('✅ Bisa dimainkan!');
    if (drawn.color === 'wild' || drawn.value === 'wild4') {
      gameState.pendingWild = me.hand.length - 1;
      DOM.colorPicker.classList.remove('hidden');
      renderGameplay();
      return;
    }
    if (roomPlayCard(0, me.hand.length - 1)) afterRoomChange();
  } else {
    gameState.currentPlayer = nextTurn(0);
    renderGameplay();
    const nextPlayer = gameState.players[gameState.currentPlayer];
    if (nextPlayer && nextPlayer.isBot) {
      setTimeout(botTurn, 800);
    }
  }
}

function passLocal() {
  if (gameState.winner || !isMyTurn()) return;

  // Ada kartu hasil draw yang bisa dimainkan tapi ditolak -> lewati giliran
  if (gameState.passPending) {
    gameState.passPending = false;
    addLog('⏭ Pass giliran');
    gameState.currentPlayer = nextTurn(0);
    renderGameplay();
    const nextPlayer = gameState.players[gameState.currentPlayer];
    if (nextPlayer && nextPlayer.isBot) {
      setTimeout(botTurn, 700);
    }
    return;
  }

  // PASS wajib ambil 1 kartu
  const me = gameState.players[0];
  const drawn = drawCardFor(0);

  if (!drawn) {
    endRoundFewestCards('❌ Deck habis');
    renderGameplay();
    return;
  }

  addLog('🎴 Ambil 1 kartu (Pass)');
  playSound('draw');

  if (isValidMove(drawn, topCard())) {
    gameState.passPending = true;
    addLog('✅ Bisa dimainkan! Klik kartunya atau Pass lagi untuk lewati.');
    showToast('Kartu baru bisa dimainkan!');
    if (drawn.color === 'wild' || drawn.value === 'wild4') {
      gameState.pendingWild = me.hand.length - 1;
      DOM.colorPicker.classList.remove('hidden');
    }
    renderGameplay();
    return;
  }

  addLog('⏭ Pass giliran');
  gameState.currentPlayer = nextTurn(0);
  renderGameplay();
  const nextPlayer = gameState.players[gameState.currentPlayer];
  if (nextPlayer && nextPlayer.isBot) {
    setTimeout(botTurn, 700);
  }
}
/* ============================================
   RENDERING - RUANG TUNGGU
   ============================================ */

function enterWaitingRoom(code) {
  gameState.gameStarted = false;
  DOM.waitingRoomCode.textContent = code;
  showScreen('room');
  broadcastState();
}

function renderWaitingRoom(data) {
  const list = DOM.waitingPlayersList;
  // Refresh total setiap polling — jangan append, agar nama tidak muncul ganda.
  list.innerHTML = '';
  const players = dedupePlayers(data.players || []);
  players.forEach((p) => {
    const li = document.createElement('li');
    if (p.isBot) li.className = 'bot-row';
    li.textContent = `${p.avatar || '👤'} ${p.name}${p.isMe ? ' (Kamu)' : ''}${p.isHost ? ' 👑' : ''}${p.isBot ? ' 🤖 BOT' : ''}`;
    list.appendChild(li);
  });

  const count = players.length;
  const capacity = data.capacity || gameState.roomCapacity || count;
  DOM.waitingRoomCode.textContent = data.roomCode || gameState.roomCode;
  DOM.waitingCapacity.textContent = `Kapasitas: ${count} / ${capacity}`;
  DOM.waitingStatus.textContent = `Pemain terhubung: ${count}/${capacity}`;

  if (gameState.isHost) {
    DOM.startGameBtn.style.display = '';
    DOM.startGameBtn.disabled = count < MIN_PLAYERS;
    const botFill = capacity - count;
    DOM.startGameBtn.textContent = count >= MIN_PLAYERS
      ? (botFill > 0 ? `Mulai Game (isi ${botFill} bot)` : 'Mulai Game')
      : `Butuh minimal ${MIN_PLAYERS} pemain`;
  } else {
    DOM.startGameBtn.style.display = 'none';
  }
}

/* ============================================
   RENDERING - GAMEPLAY
   ============================================ */

// Sudut tempat duduk (derajat): pemain utama selalu di bawah (90°).
// Khusus 4 pemain -> dikunci jadi kotak/persegi (Bawah, Kiri, Atas, Kanan).
function seatAngleDeg(idx) {
  const n = gameState.players.length;
  const meIdx = myIndex();
  if (n === 4) {
    const others = [];
    for (let i = 0; i < n; i += 1) {
      if (i !== meIdx) others.push(i);
    }
    const angles = [180, 270, 0]; // kiri, atas, kanan (bawah = pemain utama)
    const k = others.indexOf(idx);
    return angles[k];
  }
  const slot = 360 / n;
  const start = 90 - slot * meIdx;
  return ((start + slot * idx) % 360 + 360) % 360;
}

// Tata letak pemain melingkar (radial) mengelilingi meja tengah memakai trigonometri
function renderSeats() {
  const container = DOM.seats;
  container.innerHTML = '';
  const players = gameState.players;
  if (!players.length) return;

  const meIdx = myIndex();
  const n = players.length;
  const compact = window.innerWidth < 640;

  // Radius dinamis: posisi seat dipastikan TIDAK lebih dekat dari `clearance` px ke tepi meja,
  // sekaligus tetap di dalam arena (diklem). Radius besar = seat makin jauh dari meja (aman).
  const arenaW = container.clientWidth || window.innerWidth;
  const arenaH = container.clientHeight || window.innerHeight;
  const tableW = Math.min(380, arenaW * 0.56);
  const tableH = Math.min(248, arenaH * 0.36);
  const clearance = compact ? 14 : 26; // jarak bebas minimum ke tepi meja (px)
  const baseX = compact ? 38 : (n > 6 ? 40 : 44);
  const baseY = compact ? 34 : (n > 6 ? 38 : 42);
  const minX = (tableW / 2 + clearance) / arenaW * 100;
  const minY = (tableH / 2 + clearance) / arenaH * 100;
  const radiusX = clampNum(Math.max(baseX, minX), 16, 44);
  const radiusY = clampNum(Math.max(baseY, minY), 16, 42);

  players.forEach((player, idx) => {
    if (idx === meIdx) return;

    const angleDeg = seatAngleDeg(idx);
    const rad = (angleDeg * Math.PI) / 180;
    // Clamp agar seat (termasuk label & bubble) tetap berada dalam arena
    const x = clampNum(50 + radiusX * Math.cos(rad), 7, 93);
    const y = clampNum(50 + radiusY * Math.sin(rad), 9, 86);
    const rot = angleDeg - 90; // arah kartu menghadap ke tengah meja
    const count = opponentHandCount(player);
    const isTurn = !gameState.winner && idx === gameState.currentPlayer;

    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.dataset.pid = String(idx);
    if (isTurn) seat.classList.add('turn');
    seat.style.left = `${x}%`;
    seat.style.top = `${y}%`;

    const cards = document.createElement('div');
    cards.className = 'seat-cards';
    cards.style.transform = `rotate(${rot}deg)`;
    const shown = Math.max(1, Math.min(count, 6));
    for (let i = 0; i < shown; i += 1) {
      const mc = document.createElement('div');
      mc.className = 'seat-card';
      cards.appendChild(mc);
    }

    const label = document.createElement('div');
    label.className = 'seat-label';
    const nameDisplay = player.name || 'Pemain';
    label.innerHTML = `
      <span class="seat-avatar">${player.avatar || '👤'}</span>
      <span class="seat-name">${escapeHtml(nameDisplay)}${player.isBot ? ' 🤖' : ''}</span>
      <span class="seat-count">${count}</span>
      ${player.hasUno && !gameState.winner ? '<span class="seat-uno">UNO</span>' : ''}
    `;

    seat.appendChild(cards);
    seat.appendChild(label);

    // Bubble chat bot (muncul otomatis, hilang sendiri setelah ±3,5 detik)
    if (gameState.botChat && gameState.botChat.index === idx && Date.now() < gameState.botChat.until) {
      const bubble = document.createElement('div');
      bubble.className = 'seat-bubble';
      bubble.textContent = gameState.botChat.text;
      seat.appendChild(bubble);
    }

    container.appendChild(seat);
  });
}

function renderPlayerDock() {
  const me = myPlayer();
  if (!me) {
    DOM.playerDockHeader.innerHTML = '';
    DOM.myHand.innerHTML = '';
    return;
  }

  const hand = dedupeCards(me.hand || []);
  const isTurn = isMyTurn() && !gameState.winner;
  if (!isTurn && gameState.pairSelect) gameState.pairSelect = null;
  const turnBadge = isTurn ? '<span class="turn-badge">● Giliran Kamu</span>' : '';
  const pairSelect = gameState.pairSelect;
  const pairValue = pairSelect ? pairSelect.value : null;
  const pairCardId = pairSelect ? pairSelect.cardId : null;

  DOM.playerDockHeader.innerHTML = `
    <span class="seat-avatar">${me.avatar || '👤'}</span>
    <span class="seat-name">${me.name}</span>
    <span class="card-count">${hand.length}</span>
    ${turnBadge}
  `;

  DOM.myHand.innerHTML = hand
    .map((card, ci) => cardButtonHTML(card, ci, isTurn && isValidMove(card, topCard()), pairCardId !== null && card.id === pairCardId))
    .join('');

  DOM.pairHint.classList.toggle('hidden', pairValue === null);
  if (pairValue !== null) {
    DOM.pairHint.textContent = `Kartu ${pairValue} dipilih — ketuk kartu angka ${pairValue} lain untuk main dobel, atau ketuk lagi untuk main 1`;
  }

  DOM.playerDock.classList.toggle('dock-active', isTurn);

  if (DOM.myHand.scrollWidth > DOM.myHand.clientWidth) {
    DOM.myHand.scrollLeft = DOM.myHand.scrollWidth;
  }
}

// Kartu yang dibuang menumpuk mulus ke atas tumpukan buangan
function renderDiscard() {
  const top = topCard();
  const pile = DOM.discardPile;

  if (!top) {
    pile.innerHTML = '<span class="uno-card static wild">?</span>';
    gameState.lastTopId = null;
    return;
  }

  const changed = gameState.lastTopId !== top.id;
  gameState.lastTopId = top.id;

  if (changed) {
    const slot = document.createElement('div');
    slot.className = 'discard-slot pile-pop';
    slot.innerHTML = `<span class="uno-card static ${cardColorClass(top)}">${cardFace(top)}</span>`;
    pile.appendChild(slot);
    while (pile.children.length > 5) pile.removeChild(pile.firstChild);
  }

  Array.from(pile.children).forEach((el, i) => {
    const fromBottom = pile.children.length - 1 - i;
    el.className = 'discard-slot' + (fromBottom === 0 ? (changed ? ' pile-pop' : '') : ' l' + Math.min(fromBottom, 4));
  });
}

function renderDeckCount() {
  DOM.deckCount.textContent = gameState.isOnline ? gameState.deckCount : gameState.deck.length;
}

function updateStatus() {
  const pill = DOM.statusPill;
  const turnInd = DOM.turnIndicator;
  const colorInd = DOM.activeColorIndicator;
  const colorNameOf = {
    red: 'Merah',
    yellow: 'Kuning',
    green: 'Hijau',
    blue: 'Biru'
  };
  const colorHexOf = {
    red: '#ff4d4d',
    yellow: '#ffd400',
    green: '#22c55e',
    blue: '#2563eb'
  };

  if (gameState.winner) {
    const msg = `🏆 ${gameState.winner.name} menang!`;
    if (pill) {
      pill.textContent = msg;
      pill.classList.add('winner');
    }
    if (turnInd) turnInd.textContent = msg;
    if (colorInd) {
      colorInd.textContent = '';
      colorInd.style.background = '';
    }
    return;
  }
  if (!gameState.players.length || !gameState.players[gameState.currentPlayer]) {
    if (pill) {
      pill.textContent = 'Mempersiapkan...';
      pill.classList.remove('winner');
    }
    if (turnInd) turnInd.textContent = 'Mempersiapkan...';
    if (colorInd) {
      colorInd.textContent = '';
      colorInd.style.background = '';
    }
    return;
  }
  const current = gameState.players[gameState.currentPlayer];
  const you = isMyTurn();
  const dirArrow = gameState.direction === 1 ? '↻' : '↺';
  const colorName = colorNameOf[gameState.currentColor] || '';

  if (pill) {
    pill.textContent = `Giliran: ${current.name}${you ? ' (Kamu)' : ''} • ${dirArrow}${colorName ? ' • Warna: ' + colorName : ''}`;
    pill.classList.remove('winner');
  }
  if (turnInd) {
    turnInd.textContent = `Giliran: ${current.name}${you ? ' (Kamu)' : ''} ${dirArrow}`;
  }
  if (colorInd) {
    const hex = colorHexOf[gameState.currentColor];
    if (hex) {
      colorInd.textContent = colorName;
      colorInd.style.background = hex;
    } else {
      colorInd.textContent = '';
      colorInd.style.background = '';
    }
  }
}

function renderGameplay() {
  renderSeats();
  renderPlayerDock();
  renderDiscard();
  renderDeckCount();
  updateStatus();

  if (gameState.winner) {
    showWinnerOverlay(gameState.winner.name);
  } else {
    hideWinnerOverlay();
  }

  const me = myPlayer();
  const unoVisible = me && dedupeCards(me.hand || []).length === 1 && !me.hasUno && !gameState.winner;
  DOM.unoBtn.classList.toggle('hidden', !unoVisible);
  DOM.passBtn.disabled = !isMyTurn();
}

/* ============================================
   AKSI
   ============================================ */

function sendAction(action, d = {}) {
  if (gameState.isOnline) {
    if (gameState.isHost) {
      handleGameAction(0, null, { action, data: d }, true);
    } else if (gameState.conn && gameState.conn.open) {
      gameState.conn.send({ type: 'ACTION', action, data: d });
    }
  }
}

function playMyCard(idx, color) {
  if (gameState.isOnline) {
    if (!gameState.isHost) optimisticPlay(idx, color);
    sendAction('PLAY_CARD', { cardIndex: idx, chosenColor: color });
  } else if (roomPlayCard(0, idx, color)) afterRoomChange();
}

// Mainkan 2 kartu dobel sekaligus (angka sama, warna boleh beda).
function playMyPair(idxA, idxB, color) {
  if (gameState.isOnline) {
    if (!gameState.isHost) optimisticPlayPair(idxA, idxB, color);
    sendAction('PLAY_PAIR', { cardIndices: [idxA, idxB], chosenColor: color });
  } else if (roomPlayPair(0, idxA, idxB, color)) afterRoomChange();
}

function drawAction() {
  gameState.passPending = false;
  gameState.pairSelect = null;
  if (gameState.isOnline) {
    sendAction('DRAW');
  } else {
    drawLocal();
  }
}

function passAction() {
  if (gameState.winner || !isMyTurn()) return;
  gameState.pairSelect = null;
  if (gameState.isOnline) {
    sendAction('PASS');
  } else {
    passLocal();
  }
}

/* ============================================
   GAME LOG -> STATUS EVENT
   ============================================ */

function addLog(message) {
  gameState.log.unshift(message);
  if (gameState.log.length > 40) gameState.log.pop();
  pushStatusEvent(message);
}

function pushStatusEvent(message) {
  const el = DOM.statusEvent;
  if (!el) return;
  el.textContent = message;
  el.classList.remove('event-pop');
  void el.offsetWidth;
  el.classList.add('event-pop');
}

/* ============================================
   EVENT HANDLERS - LOBBY
   ============================================ */

DOM.authTabLogin.addEventListener('click', () => setAuthMode('login'));
DOM.authTabRegister.addEventListener('click', () => setAuthMode('register'));
DOM.authSubmitBtn.addEventListener('click', () => handleAuth(gameState.authMode === 'register' ? 'register' : 'login'));
DOM.authGuestBtn.addEventListener('click', loginGuest);
DOM.authPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuth(gameState.authMode === 'register' ? 'register' : 'login'); });
DOM.authUsername.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuth(gameState.authMode === 'register' ? 'register' : 'login'); });

// Navigasi dashboard
DOM.dashLogoutBtn.addEventListener('click', logoutUser);
DOM.dashNavBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const nav = btn.dataset.nav;
    if (nav === 'settings') { openSettings(); return; }
    if (nav === 'profile') {
      showToast(`${DOM.dashName ? DOM.dashName.textContent : 'Pemain'} — ${DOM.dashStats ? DOM.dashStats.textContent : ''}`);
      return;
    }
  });
});

// "+ Buat Room" di sidebar room publik
DOM.authCreateRoomBtn.addEventListener('click', () => {
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Room Publik (Host)';
  createRoom(true);
});

DOM.avatarBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    DOM.avatarBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    gameState.playerProfile.avatar = btn.dataset.avatar;
  });
});

// BUAT ROOM (Public) - langsung jadi, semua bisa gabung
DOM.createRoomBtn.addEventListener('click', () => {
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Room Publik (Host)';
  createRoom(true);
});

// ROOM PRIVAT - buat room pakai kode unik 6 karakter
DOM.createPrivateBtn.addEventListener('click', () => {
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Room Privat (Host)';
  createRoom(false);
});

// LATIHAN SOLO - langsung main vs bot (jumlah bot bisa dipilih)
DOM.soloBtn.addEventListener('click', () => {
  gameState.gameMode = 'solo';
  DOM.roomInfoDisplay.textContent = 'Mode: Latihan Solo';
  const botCount = parseInt(DOM.soloBots.value, 10) || 1;
  resetLocalGame(botCount);
  showScreen('gameplay');
});

let joining = false;

DOM.joinPrivateBtn.addEventListener('click', () => {
  if (joining) return;
  const code = DOM.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast('Masukkan kode room');
    return;
  }
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Mode: Online';
  joining = true;
  DOM.joinPrivateBtn.disabled = true;
  DOM.joinPrivateBtn.textContent = '...';
  joinRoom(code);
  setTimeout(() => {
    joining = false;
    DOM.joinPrivateBtn.disabled = false;
    DOM.joinPrivateBtn.textContent = 'GABUNG';
  }, 10000);
});

DOM.roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    DOM.joinPrivateBtn.click();
  }
});

DOM.refreshRoomsBtn.addEventListener('click', () => {
  lobbyRefresh();
  showToast('Memperbarui daftar room...');
});

/* ============================================
   EVENT HANDLERS - RUANG TUNGGU
   ============================================ */

DOM.copyCodeBtn.addEventListener('click', () => {
  if (gameState.roomCode) {
    navigator.clipboard.writeText(gameState.roomCode).then(() => {
      showToast('Kode disalin!');
    });
  }
});

DOM.startGameBtn.addEventListener('click', () => {
  if (!gameState.isHost) return;
  startOnlineGame();
});

DOM.leaveRoomBtn.addEventListener('click', () => {
  leaveGame();
});

/* ============================================
   EVENT HANDLERS - GAMEPLAY
   ============================================ */

DOM.newRoundBtn.addEventListener('click', () => {
  if (gameState.isOnline) {
    if (gameState.isHost) {
      startOnlineGame();
    } else {
      showToast('Ronde baru hanya bisa dimulai host');
    }
    return;
  }
  resetLocalGame();
});

DOM.settingsBtn.addEventListener('click', () => {
  openSettings();
});

function openSettings() {
  DOM.settingsModal.classList.remove('hidden');
  DOM.soundToggleBtn.classList.toggle('on', gameState.soundEnabled);
  DOM.soundToggleBtn.textContent = gameState.soundEnabled ? 'ON' : 'OFF';
}

function closeSettings() {
  DOM.settingsModal.classList.add('hidden');
}

DOM.settingsCloseBtn.addEventListener('click', closeSettings);

DOM.settingsModal.addEventListener('click', (e) => {
  if (e.target === DOM.settingsModal) closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

DOM.soundToggleBtn.addEventListener('click', () => {
  gameState.soundEnabled = !gameState.soundEnabled;
  DOM.soundToggleBtn.classList.toggle('on', gameState.soundEnabled);
  DOM.soundToggleBtn.textContent = gameState.soundEnabled ? 'ON' : 'OFF';
  if (gameState.soundEnabled) playSound('click');
});

DOM.exitGameBtn.addEventListener('click', () => {
  closeSettings();
  leaveGame();
});

// Main kartu dari tangan
DOM.myHand.addEventListener('click', (e) => {
  if (gameState.screenState !== 'gameplay' || gameState.winner || !isMyTurn()) return;

  const cardBtn = e.target.closest('.uno-card[data-index]');
  if (!cardBtn) return;

  const idx = parseInt(cardBtn.dataset.index, 10);
  if (!Number.isInteger(idx)) return;

  const me = myPlayer();
  if (!me) return;
  const card = me.hand[idx];
  if (!card) return;

  // Wild / +4 -> pilih warna dulu (dobel hanya untuk kartu angka)
  if (card.color === 'wild' || card.value === 'wild4') {
    gameState.pairSelect = null;
    gameState.pendingWild = idx;
    DOM.colorPicker.classList.remove('hidden');
    return;
  }

  gameState.passPending = false;
  const top = topCard();
  const sel = gameState.pairSelect;

  // Ada pilihan: ketuk kartu angka yang sama -> main dobel
  if (sel) {
    const firstIdx = me.hand.findIndex((c) => c && c.id === sel.cardId);
    if (firstIdx > -1 && firstIdx !== idx && canPair(me.hand[firstIdx], card, top)) {
      gameState.pairSelect = null;
      playMyPair(firstIdx, idx);
      return;
    }
    // Ketuk kartu yang sama lagi -> main 1 kartu
    if (firstIdx === idx) {
      gameState.pairSelect = null;
      playMyCard(idx);
      return;
    }
    // Kartu lain yang tidak cocok dipasangkan -> main 1 kartu
    gameState.pairSelect = null;
    playMyCard(idx);
    return;
  }

  // Belum ada pilihan: kartu yang memungkinkan dobel -> pilih dulu
  if (canStartPair(card, top, me.hand)) {
    gameState.pairSelect = { value: card.value, cardId: card.id };
    renderPlayerDock();
    playSound('click');
    return;
  }

  playMyCard(idx);
});

// Tumpukan draw
DOM.drawPile.addEventListener('click', () => {
  if (gameState.screenState !== 'gameplay' || gameState.winner || !isMyTurn()) return;
  drawAction();
});

// Pass (wajib ambil 1 kartu)
DOM.passBtn.addEventListener('click', () => {
  if (gameState.winner || !isMyTurn()) return;
  passAction();
});

// UNO!
DOM.unoBtn.addEventListener('click', () => {
  const me = myPlayer();
  if (!me || me.hand.length !== 1) return;

  if (gameState.isOnline) {
    sendAction('UNO');
  } else {
    me.hasUno = true;
    addLog('🎺 UNO!');
    showToast('UNO!');
    playSound('win');
    renderGameplay();
  }
});

// Picker warna (Wild / +4)
DOM.colorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (gameState.pendingWild === null) return;

    const color = btn.dataset.color;
    const idx = gameState.pendingWild;
    gameState.pendingWild = null;
    gameState.passPending = false;
    DOM.colorPicker.classList.add('hidden');

    if (gameState.isOnline) {
      if (!gameState.isHost) optimisticPlay(idx, color);
      sendAction('PLAY_CARD', { cardIndex: idx, chosenColor: color });
    } else if (roomPlayCard(0, idx, color)) afterRoomChange();
  });
});

DOM.colorPicker.addEventListener('click', (e) => {
  if (e.target === DOM.colorPicker) {
    gameState.pendingWild = null;
    gameState.pairSelect = null;
    DOM.colorPicker.classList.add('hidden');
  }
});

/* ============================================
   LAYAR PEMENANG
   ============================================ */

DOM.winnerAgainBtn.addEventListener('click', () => {
  if (gameState.isOnline) {
    if (gameState.isHost) {
      startOnlineGame();
    } else {
      sendAction('NEW_ROUND');
      showToast('Meminta ronde baru ke Host...');
    }
  } else {
    resetLocalGame(parseInt(DOM.soloBots.value, 10) || 1);
  }
});

DOM.winnerMenuBtn.addEventListener('click', () => {
  leaveGame();
});

/* ============================================
   CHAT & EMOTE
   ============================================ */

DOM.chatToggleBtn.addEventListener('click', () => {
  DOM.chatPanel.classList.add('closing');
  setTimeout(() => {
    DOM.chatPanel.classList.add('hidden');
    DOM.chatPanel.classList.remove('closing');
    DOM.chatShowBtn.classList.remove('hidden');
  }, 250);
});

DOM.chatShowBtn.addEventListener('click', () => {
  DOM.chatPanel.classList.remove('hidden');
  DOM.chatShowBtn.classList.add('hidden');
  DOM.chatInput.focus();
});

DOM.chatSendBtn.addEventListener('click', () => {
  sendChatMessage(DOM.chatInput.value);
  DOM.chatInput.value = '';
});

DOM.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage(DOM.chatInput.value);
    DOM.chatInput.value = '';
  }
});

DOM.emoteToggleBtn.addEventListener('click', () => {
  DOM.emoteGrid.classList.toggle('hidden');
});

function buildEmoteGrid() {
  DOM.emojiPicker.innerHTML = EMOTES.map((em) =>
    `<button class="emote-btn" data-emote="${em.e}" data-sound="${em.s}" title="${em.e}">${em.e}</button>`
  ).join('');

  DOM.emoteGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.emote-btn');
    if (!btn) return;
    sendEmote(btn.dataset.emote, btn.dataset.sound);
    DOM.emoteGrid.classList.add('hidden');
  });
}

/* ============================================
   INITIALIZATION
   ============================================ */

function init() {
  // Tampilkan dashboard langsung jika ada sesi tersimpan, kalau tidak ke halaman auth
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('unoduel_auth') || 'null'); } catch (e) { /* ignore */ }
  showScreen((saved && (saved.token || saved.isGuest)) ? 'lobby' : 'auth');

  lobbyEnsure();
  setTimeout(lobbyRefresh, 2000);

  // Dropdown kapasitas room 2-8 pemain
  for (let n = 2; n <= MAX_PLAYERS; n += 1) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `${n} pemain`;
    if (n === 4) opt.selected = true;
    DOM.roomCapacity.appendChild(opt);
  }
  DOM.roomCapacity.addEventListener('change', () => {
    gameState.roomCapacity = parseInt(DOM.roomCapacity.value, 10) || 4;
  });

  // Dropdown jumlah Bot untuk mode solo (1-7 bot)
  for (let n = 1; n <= MAX_PLAYERS - 1; n += 1) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = n === 1 ? '1 Bot' : `${n} Bot`;
    if (n === 1) opt.selected = true;
    DOM.soloBots.appendChild(opt);
  }

  gameState.playerProfile.avatar = DOM.avatarBtns[0].dataset.avatar;
  DOM.avatarBtns[0].classList.add('active');

  DOM.soundToggleBtn.classList.add('on');
  DOM.soundToggleBtn.textContent = 'ON';

  buildEmoteGrid();

  loadLeaderboard();
  restoreAuth();
  checkServerHealth();
  setInterval(checkServerHealth, 15000);
  renderOnlineUsers();

  // Ambil daftar room publik & daftar pemain online saat lobby dibuka
  lobbyEnsure();
  setTimeout(lobbyRefresh, 2000);
  setInterval(lobbyRefresh, 30000);

  // Recovery: jika halaman di-refresh di tengah permainan, sambung ulang ke room.
  tryAutoRejoin();
}

// Setelah reload, sambung otomatis ke room yang masih tersimpan di sessionStorage.
// Host akan membalas state penuh (kartu, meja, giliran) sehingga game langsung pulih.
function tryAutoRejoin() {
  const sess = loadSession();
  if (!sess || !sess.code) return;
  if (Date.now() - (sess.ts || 0) > 12 * 60 * 60 * 1000) {
    clearSession();
    return;
  }
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Mode: Online';
  showToast('Menghubungkan kembali ke room...');
  setTimeout(() => {
    if (!gameState.roomCode) joinRoom(sess.code);
  }, 300);
}

init();