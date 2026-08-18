/* ============================================
   UNO ARENA - P2P MULTIPLAYER (PeerJS)
   Frontend untuk GitHub Pages (file terpisah:
   index.html + style.css + script.js).
   Tanpa backend / WebSocket server.

   PROTOKOL JARINGAN:
   - Client -> Host : { type: 'JOIN_ROOM', player: { name, avatar } }
   - Client -> Host : { type: 'ACTION', action: 'PLAY_CARD'|'DRAW'|'PASS'|'UNO'|'NEW_ROUND', data: {...} }
   - Siapa pun      : { type: 'CHAT',   sender: nama, text: pesan, avatar, id, emote? }
   - Host  -> Semua : { type: 'ROOM_UPDATE', roomCode, started:false, players: [...], gameState: {...} }
   - Host  -> Semua : { type: 'SYNC_STATE',  roomCode, started:true,  players: [...], gameState: {...} }
   - Host  -> Client: { type: 'PENDING_WILD', cardIndex }
   - Host  -> Client: { type: 'TOAST', message }
   ============================================ */

/* ============================================
   KONSTANTA
   ============================================ */

const COLORS = ['red', 'yellow', 'green', 'blue'];
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
// Peer ID = kode room 5 karakter (client melakukan peer.connect(kodeRoom)).
const PEER_PREFIX = '';
const ACTION_VALUES = ['skip', 'reverse', 'draw2', 'draw8', 'draw16', 'wild', 'wild4'];

// Server publik PeerJS yang stabil (0.peerjs.com) + STUN agar NAT traversal lancar.
const PEER_CONFIG = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  debug: 1,
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
  }
};

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
  return {
    id: makeId(),
    color,
    value,
    displayColor: color,
    label: value === 'wild' ? 'WILD' : value === 'wild4' ? '+4' : value === 'draw8' ? '+8' : value === 'draw16' ? '+16' : value
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
    ['skip', 'reverse', 'draw2', 'draw8', 'draw16'].forEach((value) => {
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

// ATURAN: kartu bisa dibuang jika warna ATAU angka/nilai sama dengan kartu tumpukan.
// Wild / warna bebas: bila tumpukan atas adalah Wild, warna aktif (currentColor) hasil
// pilihan pemain menjadi acuan. Pemain boleh buang kartu berwarna sama dengan currentColor
// atau kartu Wild lainnya.
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
  if (card.value === 'draw8') return '+8';
  if (card.value === 'draw16') return '+16';
  if (card.value === 'wild') return 'W';
  if (card.value === 'wild4') return '+4';
  return String(card.value);
}

function getCardSymbol(card) {
  if (card.value === 'reverse') return '🔄';
  if (card.value === 'skip') return '🚫';
  if (card.value === 'draw2') return '➕';
  if (card.value === 'draw8') return '8';
  if (card.value === 'draw16') return '16';
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

function cardButtonHTML(card, idx, playable) {
  const cls = `uno-card ${cardColorClass(card)}${playable ? ' playable' : ''}`;
  return `<button class="${cls}" data-index="${idx}" data-value="${card.value}">${cardFace(card)}</button>`;
}

/* ============================================
   STATE GAME TERPUSAT
   ============================================ */

const gameState = {
  screenState: 'lobby', // 'lobby' | 'room' | 'gameplay'
  gameMode: 'bot', // 'bot' | 'online'
  playerProfile: {
    name: 'Pemain',
    avatar: '🧑'
  },

  soundEnabled: true,

  // P2P STATE
  peer: null,
  conn: null,
  connections: [], // Host: kumpulan koneksi dari seluruh client (multi-client)
  roomCode: '',
  playerIndex: 0,
  isHost: false,
  isOnline: false,
  connected: false,

  // ROOM / GAME STATE (host adalah otoritas)
  players: [],
  deck: [],
  deckCount: 0,
  discard: [],
  currentPlayer: 0,
  direction: 1,
  currentColor: null, // warna aktif (hasil pilihan Wild / warna kartu terakhir)
  winner: null,
  pendingWild: null,
  passPending: false,
  log: [],
  chatHistory: [],
  seenChatIds: new Set(),
  gameStarted: false
};

/* ============================================
   CACHE DOM
   ============================================ */

const DOM = {
  lobbyScreen: document.getElementById('lobby-screen'),
  roomScreen: document.getElementById('room-screen'),
  gameplayScreen: document.getElementById('gameplay-screen'),

  playerNameInput: document.getElementById('player-name'),
  avatarBtns: [...document.querySelectorAll('.avatar-btn')],
  botModeBtn: document.getElementById('bot-mode-btn'),
  onlineModeBtn: document.getElementById('online-mode-btn'),
  botSection: document.getElementById('bot-section'),
  onlineSection: document.getElementById('online-section'),
  startBotBtn: document.getElementById('start-bot-btn'),
  createRoomBtn: document.getElementById('create-room-btn'),
  joinRoomBtn: document.getElementById('join-room-btn'),
  roomCodeInput: document.getElementById('room-code-input'),
  connectionStatus: document.getElementById('connection-status'),
  connectionDot: document.getElementById('connection-dot'),

  waitingRoomCode: document.getElementById('waiting-room-code'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  waitingPlayersList: document.getElementById('waiting-players-list'),
  waitingStatus: document.getElementById('waiting-status'),
  startGameBtn: document.getElementById('start-game-btn'),
  leaveRoomBtn: document.getElementById('leave-room-btn'),

  roomInfoDisplay: document.getElementById('room-info-display'),
  tableSeats: document.getElementById('player-list'),
  discardPile: document.getElementById('discard-pile'),
  drawPile: document.getElementById('draw-pile'),
  deckCount: document.getElementById('deck-count'),

  playerDock: document.getElementById('player-dock'),
  playerDockHeader: document.getElementById('player-dock-header'),
  myHand: document.getElementById('my-hand'),
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
  DOM.lobbyScreen.classList.remove('screen-active');
  DOM.roomScreen.classList.remove('screen-active');
  DOM.gameplayScreen.classList.remove('screen-active');

  if (screenName === 'lobby') {
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

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// Indikator status koneksi: 'online' (hijau) | 'connecting' (kuning) | 'offline' (merah)
function setConnectionState(state, text) {
  if (DOM.connectionDot) {
    DOM.connectionDot.className = 'status-dot status-' + state;
  }
  DOM.connectionStatus.textContent = text;
}

function showDisconnectBanner(text) {
  if (!DOM.disconnectBanner) return;
  DOM.disconnectBanner.textContent = text || '⚠️ Koneksi Terputus — mencoba menghubungkan ulang...';
  DOM.disconnectBanner.classList.remove('hidden');
}

function hideDisconnectBanner() {
  if (!DOM.disconnectBanner) return;
  DOM.disconnectBanner.classList.add('hidden');
}

function showWinnerOverlay(name) {
  if (!DOM.winnerOverlay) return;
  DOM.winnerNameEl.textContent = name || 'Pemain';
  DOM.winnerOverlay.classList.remove('hidden');
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
    text: msg.message !== undefined ? msg.message : msg.text || '',
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

// Kirim pesan teks via { type: 'CHAT', sender, text }
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

// Host meneruskan paket CHAT ke semua client kecuali pengirim.
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
   ROOM GAME LOGIC (Host otoritatif, dipakai juga untuk bot mode)
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
  if (gameState.discard.length <= 1) return;
  const top = gameState.discard.pop();
  gameState.deck = shuffleDeck(gameState.discard);
  gameState.discard = [top];
}

function drawCardFor(playerIdx) {
  replenishDeck();
  const card = gameState.deck.pop();
  if (!card) return null;
  gameState.players[playerIdx].hand.push(card);
  return card;
}

// Set warna aktif (currentColor) setiap kartu dimainkan, termasuk hasil pilihan Wild.
function setActiveColor(playedCard, chosenColor) {
  gameState.currentColor = (chosenColor || playedCard.chosenColor) || playedCard.color || null;
}

/**
 * Eksekusi pembuangan kartu terhadap state room.
 * Mengembalikan true bila kartu berhasil diproses (state sudah berubah).
 */
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
  addLog(`${player.name} main ${getCardLabel(card)}`);
  playSound('click');

  if (player.hand.length === 0) {
    gameState.winner = player;
    addLog(`🎉 ${player.name} MENANG!`);
    showToast(`${player.name} Menang!`);
    playSound('win');
    return true;
  }

  if (player.hand.length === 1) {
    player.hasUno = false;
  }

  let nextIdx = playerIdx;

  if (card.value === 'skip') {
    nextIdx = nextTurn(nextIdx);
    nextIdx = nextTurn(nextIdx);
    addLog('⏭ Skip!');
  } else if (card.value === 'reverse') {
    gameState.direction *= -1;
    if (gameState.players.length === 2) {
      nextIdx = nextTurn(nextIdx);
    }
    addLog('🔄 Reverse!');
  } else if (card.value === 'draw2' || card.value === 'draw8' || card.value === 'draw16') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    const amount = { draw2: 2, draw8: 8, draw16: 16 }[card.value] || 2;
    for (let i = 0; i < amount; i += 1) drawCardFor(nextIdx);
    addLog(`${target.name} ambil +${amount}`);
    playSound('action');
    nextIdx = nextTurn(nextIdx);
  } else if (card.value === 'wild4') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    for (let i = 0; i < 4; i += 1) drawCardFor(nextIdx);
    addLog(`${target.name} ambil +4`);
    playSound('action');
    nextIdx = nextTurn(nextIdx);
  } else {
    nextIdx = nextTurn(nextIdx);
  }

  gameState.currentPlayer = nextIdx;
  return true;
}

function afterRoomChange() {
  if (gameState.isOnline && gameState.isHost) {
    broadcastState();
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
  if (gameState.currentPlayer !== 1) return;

  setTimeout(() => {
    if (gameState.winner || gameState.currentPlayer !== 1) return;
    const bot = gameState.players[1];
    if (!bot || !bot.isBot) return;

    const playable = bot.hand.filter((c) => isValidMove(c, topCard()));

    if (!playable.length) {
      const drawn = drawCardFor(1);
      if (drawn && isValidMove(drawn, topCard())) {
        const idx = bot.hand.indexOf(drawn);
        const color = drawn.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
        if (roomPlayCard(1, idx, color)) afterRoomChange();
        return;
      }
      addLog('🤖 Bot pass');
      gameState.currentPlayer = 0;
      renderGameplay();
      return;
    }

    const choice = playable[Math.floor(Math.random() * playable.length)];
    const idx = bot.hand.indexOf(choice);
    const color = choice.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
    if (roomPlayCard(1, idx, color)) afterRoomChange();
  }, 700);
}

/* ============================================
   PROTOKOL P2P - STATE PAYLOAD (HOST -> SEMUA)
   ROOM_UPDATE (belum mulai / ruang tunggu) &
   SYNC_STATE  (saat permainan berjalan)
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

// Payload dibangun per penerima agar "myHand" terisi kartu milik masing-masing.
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
    players,
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

// Diterapkan di Host (self) dan di Client saat menerima ROOM_UPDATE / SYNC_STATE.
function applyStatePayload(data) {
  gameState.isOnline = true;
  gameState.roomCode = data.roomCode || data.code || gameState.roomCode;
  gameState.gameStarted = !!data.started;
  gameState.players = (data.players || []).map((sp, idx) => ({
    id: sp.id,
    name: sp.name,
    avatar: sp.avatar,
    isMe: idx === (data.gameState || {}).playerIndex,
    isHost: !!sp.isHost,
    isBot: !!sp.isBot,
    hasUno: !!sp.hasUno,
    handCount: sp.handCount,
    hand: idx === (data.gameState || {}).playerIndex ? (data.gameState || {}).myHand : []
  }));

  const gs = data.gameState || {};
  gameState.playerIndex = gs.playerIndex || 0;
  gameState.currentPlayer = gs.currentPlayer;
  gameState.direction = gs.direction;
  gameState.currentColor = gs.currentColor || null;
  gameState.discard = gs.discardTop ? [gs.discardTop] : [];
  gameState.deckCount = gs.deckCount;
  gameState.winner = gs.winner ? { name: gs.winner.name } : null;

  syncChatHistory(gs.chatHistory);

  // Belum mulai -> ruang tunggu
  if (!data.started) {
    hideWinnerOverlay();
    if (gameState.screenState !== 'room') {
      showScreen('room');
    }
    renderWaitingRoom(data);
    return;
  }

  // Sudah mulai -> gameplay
  if (gameState.screenState !== 'gameplay') {
    showScreen('gameplay');
    DOM.roomInfoDisplay.textContent = `Room: ${gameState.roomCode}`;
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
   P2P - LOGIKA HOST
   ============================================ */

function createRoom() {
  resetOnlineState();
  gameState.gameMode = 'online';
  gameState.isOnline = true;
  gameState.isHost = true;
  setConnectionState('connecting', 'Menghubungkan...');
  spawnHostPeer();
}

function spawnHostPeer() {
  const code = randomCode();
  const peerId = PEER_PREFIX + code;

  const peer = new Peer(peerId, PEER_CONFIG);
  gameState.peer = peer;

  setConnectionState('connecting', 'Menghubungkan...');

  peer.on('open', () => {
    gameState.roomCode = code;
    gameState.connected = true;
    hideDisconnectBanner();
    setConnectionState('online', 'Online');
    gameState.players = [{
      id: peer.id,
      name: gameState.playerProfile.name || 'Pemain',
      avatar: gameState.playerProfile.avatar || '🧑',
      isMe: true,
      isHost: true,
      isBot: false,
      conn: null,
      hand: [],
      hasUno: false
    }];
    enterWaitingRoom(code);
  });

  // Terima koneksi masuk dari client (multi-client)
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      gameState.connections.push(conn);
      conn.on('data', (data) => handleHostData(conn, data));
      conn.on('close', () => handleClientDisconnect(conn));
      conn.on('error', () => handleClientDisconnect(conn));
    });
  });

  peer.on('disconnected', () => {
    setConnectionState('connecting', 'Menghubungkan ulang...');
    showDisconnectBanner('⚠️ Koneksi Terputus — mencoba menghubungkan ulang...');
    if (gameState.peer && !gameState.peer.destroyed) {
      setTimeout(() => {
        try {
          gameState.peer.reconnect();
        } catch (e) {
          // ignore
        }
      }, 1200);
    }
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      peer.destroy();
      gameState.peer = null;
      spawnHostPeer();
      return;
    }
    if (err.type === 'peer-unavailable') return;
    setConnectionState('offline', 'Offline');
    showToast('Gagal membuat room: ' + err.type);
  });
}

// Penerima data di sisi HOST: JOIN_ROOM / CHAT / ACTION
function handleHostData(conn, data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'JOIN_ROOM': {
      if (gameState.gameStarted) {
        conn.send({ type: 'TOAST', message: 'Game sudah dimulai' });
        return;
      }
      const playerInfo = data.player || {};
      const existing = gameState.players.find((p) => p.id === conn.peer);
      if (existing) {
        existing.name = playerInfo.name || existing.name;
        existing.avatar = playerInfo.avatar || existing.avatar;
      } else {
        if (gameState.players.length >= MAX_PLAYERS) {
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
      }
      // Langsung broadcast ulang ke seluruh client (ROOM_UPDATE -> ruang tunggu)
      broadcastState();
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

// Prosesor aksi otoritatif. Dipakai untuk aksi Host sendiri (isLocal=true)
// maupun aksi Client remote (isLocal=false).
function handleGameAction(idx, conn, msg, isLocal) {
  const action = msg.action;
  const d = msg.data || {};
  const player = gameState.players[idx];

  // Ronde baru bisa diminta client ke host
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

  // PASS wajib ambil 1 kartu; kalau hasil draw bisa dimainkan -> tetap giliran
  if (action === 'PASS' || action === 'DRAW') {
    if (idx !== gameState.currentPlayer) return;
    const drawn = drawCardFor(idx);
    if (!drawn) {
      addLog('❌ Deck habis!');
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
  const name = gameState.players[idx].name;
  gameState.players.splice(idx, 1);

  const connIdx = gameState.connections.indexOf(conn);
  if (connIdx !== -1) gameState.connections.splice(connIdx, 1);

  addLog(`${name} keluar`);

  if (gameState.gameStarted) {
    gameState.gameStarted = false;
    gameState.discard = [];
    gameState.deck = [];
    gameState.winner = null;
    gameState.currentColor = null;
    for (const p of gameState.players) p.hand = [];
    hideWinnerOverlay();
    showToast('Game dihentikan: ada pemain keluar');
  }
  broadcastState();
}

function startOnlineGame() {
  if (!gameState.isHost) return;
  if (gameState.players.length < MIN_PLAYERS) {
    showToast(`Butuh minimal ${MIN_PLAYERS} pemain`);
    return;
  }

  const freshDeck = shuffleDeck(createDeck());
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
  gameState.gameStarted = true;
  gameState.log = [];

  hideWinnerOverlay();
  DOM.colorPicker.classList.add('hidden');
  DOM.chatMessages.innerHTML = '';
  gameState.chatHistory = [];
  gameState.seenChatIds.clear();
  addLog('🃏 Ronde dimulai!');
  broadcastState();
}
/* ============================================
   P2P - LOGIKA CLIENT
   ============================================ */

function joinRoom(code) {
  resetOnlineState();
  gameState.gameMode = 'online';
  gameState.isOnline = true;
  gameState.isHost = false;

  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    showToast('Masukkan kode room');
    return;
  }

  setConnectionState('connecting', 'Menghubungkan...');
  const targetId = PEER_PREFIX + cleanCode;

  const peer = new Peer(undefined, PEER_CONFIG);
  gameState.peer = peer;

  peer.on('open', () => {
    const conn = peer.connect(targetId, { reliable: true });
    gameState.conn = conn;

    conn.on('open', () => {
      gameState.connected = true;
      gameState.roomCode = cleanCode;
      hideDisconnectBanner();
      setConnectionState('online', 'Online');
      // HANDSHAKE: Client kirim JOIN_ROOM, Host balas ROOM_UPDATE
      conn.send({
        type: 'JOIN_ROOM',
        player: {
          name: gameState.playerProfile.name || 'Pemain',
          avatar: gameState.playerProfile.avatar || '👤'
        }
      });
    });

    conn.on('data', handleClientData);
    conn.on('close', handleHostDisconnect);
    conn.on('error', handleHostDisconnect);
  });

  peer.on('disconnected', () => {
    setConnectionState('connecting', 'Menghubungkan ulang...');
    showDisconnectBanner('⚠️ Koneksi Terputus — mencoba menghubungkan ulang...');
    if (gameState.peer && !gameState.peer.destroyed) {
      setTimeout(() => {
        try {
          gameState.peer.reconnect();
        } catch (e) {
          // ignore
        }
      }, 1200);
    }
  });

  peer.on('error', (err) => {
    joining = false;
    DOM.joinRoomBtn.disabled = false;
    DOM.joinRoomBtn.textContent = 'Gabung';
    if (err.type === 'peer-unavailable') {
      setConnectionState('offline', 'Offline');
      showToast('Room tidak ditemukan. Periksa kode.');
    } else {
      setConnectionState('offline', 'Offline');
      showToast('Gagal terhubung: ' + err.type);
    }
  });
}

// Penerima data di sisi CLIENT: ROOM_UPDATE / SYNC_STATE / PENDING_WILD / CHAT / TOAST
function handleClientData(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'ROOM_UPDATE':
    case 'SYNC_STATE':
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

function handleHostDisconnect() {
  showToast('Host keluar dari room');
  leaveGame();
}

/* ============================================
   RESET / LEAVE
   ============================================ */

function resetOnlineState() {
  gameState.roomCode = '';
  gameState.playerIndex = 0;
  gameState.isHost = false;
  gameState.isOnline = false;
  gameState.connected = false;
  gameState.gameStarted = false;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.passPending = false;
  gameState.currentColor = null;
  gameState.players = [];
  gameState.connections = [];
  gameState.deck = [];
  gameState.discard = [];
  gameState.deckCount = 0;
  gameState.currentPlayer = 0;
  gameState.direction = 1;
}

function leaveGame() {
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
  DOM.colorPicker.classList.add('hidden');
  hideWinnerOverlay();
  hideDisconnectBanner();
  closeSettings();
  resetOnlineState();
  setConnectionState('offline', 'Offline');
  showScreen('lobby');
}

/* ============================================
   BOT MODE
   ============================================ */

function resetLocalGame() {
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
  gameState.gameMode = 'bot';
  gameState.isOnline = false;

  const freshDeck = shuffleDeck(createDeck());
  gameState.deck = freshDeck;
  gameState.discard = [];
  gameState.deckCount = freshDeck.length;

  gameState.players = [
    {
      id: 'player1',
      name: gameState.playerProfile.name || 'Pemain',
      avatar: gameState.playerProfile.avatar || '🧑',
      isMe: true,
      isHost: false,
      isBot: false,
      hand: [],
      hasUno: false
    },
    {
      id: 'player2',
      name: 'Bot',
      avatar: '🤖',
      isMe: false,
      isHost: false,
      isBot: true,
      hand: [],
      hasUno: false
    }
  ];

  for (let i = 0; i < 7; i += 1) {
    gameState.players[0].hand.push(freshDeck.pop());
    gameState.players[1].hand.push(freshDeck.pop());
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
  gameState.gameStarted = true;
  gameState.log = [];

  hideWinnerOverlay();
  DOM.colorPicker.classList.add('hidden');
  DOM.chatMessages.innerHTML = '';
  gameState.chatHistory = [];
  gameState.seenChatIds.clear();
  addLog('🃏 Ronde dimulai!');
  renderGameplay();
}

function drawLocal() {
  const me = gameState.players[0];
  const drawn = drawCardFor(0);

  if (!drawn) {
    addLog('❌ Deck habis!');
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
    addLog('❌ Deck habis!');
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
  list.innerHTML = '';
  (data.players || []).forEach((p) => {
    const li = document.createElement('li');
    li.textContent = `${p.avatar || '👤'} ${p.name}${p.isMe ? ' (Kamu)' : ''}${p.isHost ? ' 👑' : ''}`;
    list.appendChild(li);
  });

  const count = (data.players || []).length;
  DOM.waitingRoomCode.textContent = data.roomCode || gameState.roomCode;
  DOM.waitingStatus.textContent = `Pemain terhubung: ${count}/${MAX_PLAYERS}`;

  if (gameState.isHost) {
    DOM.startGameBtn.style.display = '';
    DOM.startGameBtn.disabled = count < MIN_PLAYERS;
    DOM.startGameBtn.textContent = count >= MIN_PLAYERS
      ? 'Mulai Game'
      : `Butuh minimal ${MIN_PLAYERS} pemain`;
  } else {
    DOM.startGameBtn.style.display = 'none';
  }
}

/* ============================================
   RENDERING - GAMEPLAY
   Panel pemain di sebelah kanan (jumlah kartu akurat)
   ============================================ */

function renderPlayerPanel() {
  const container = DOM.tableSeats;
  container.innerHTML = '';
  if (!gameState.players.length) return;

  const total = gameState.players.length;
  const meIdx = myIndex();

  gameState.players.forEach((player, idx) => {
    const li = document.createElement('li');
    const count = opponentHandCount(player);
    const isTurn = !gameState.winner && idx === gameState.currentPlayer;
    const isMe = idx === meIdx;

    li.className = 'player-row';
    if (isTurn) li.classList.add('turn');
    if (isMe) li.classList.add('me');

    const unoBadge = player.hasUno && !gameState.winner ? '<span class="row-uno">UNO</span>' : '';
    li.innerHTML = `
      <span class="row-avatar">${player.avatar || '👤'}</span>
      <span class="row-name">${player.name}${player.isHost ? ' 👑' : ''}${isMe ? ' (Kamu)' : ''}</span>
      <span class="row-count">${count}</span>
      ${unoBadge}
    `;
    container.appendChild(li);
  });
}

function renderPlayerDock() {
  const me = myPlayer();
  if (!me) {
    DOM.playerDockHeader.innerHTML = '';
    DOM.myHand.innerHTML = '';
    return;
  }

  const hand = me.hand || [];
  const isTurn = isMyTurn() && !gameState.winner;
  const turnBadge = isTurn ? '<span class="turn-badge">● Giliran Kamu</span>' : '';

  DOM.playerDockHeader.innerHTML = `
    <span class="seat-avatar">${me.avatar || '🧑'}</span>
    <span class="seat-name">${me.name}</span>
    <span class="card-count">${hand.length}</span>
    ${turnBadge}
  `;

  DOM.myHand.innerHTML = hand
    .map((card, ci) => cardButtonHTML(card, ci, isTurn && isValidMove(card, topCard())))
    .join('');

  DOM.playerDock.classList.toggle('dock-active', isTurn);

  if (DOM.myHand.scrollWidth > DOM.myHand.clientWidth) {
    DOM.myHand.scrollLeft = DOM.myHand.scrollWidth;
  }
}

function renderDiscard() {
  const top = topCard();
  if (top) {
    DOM.discardPile.innerHTML = `<span class="uno-card static ${cardColorClass(top)}">${cardFace(top)}</span>`;
  } else {
    DOM.discardPile.innerHTML = '<span class="uno-card static wild">?</span>';
  }
}

function renderDeckCount() {
  DOM.deckCount.textContent = gameState.isOnline ? gameState.deckCount : gameState.deck.length;
}

function updateStatus() {
  const pill = DOM.statusPill;
  if (!pill) return;

  if (gameState.winner) {
    pill.textContent = `🏆 ${gameState.winner.name} menang!`;
    pill.classList.add('winner');
    return;
  }
  if (!gameState.players.length || !gameState.players[gameState.currentPlayer]) {
    pill.textContent = 'Mempersiapkan...';
    pill.classList.remove('winner');
    return;
  }
  const current = gameState.players[gameState.currentPlayer];
  const you = isMyTurn();
  const dirArrow = gameState.direction === 1 ? '↻' : '↺';
  const colorName = {
    red: 'Merah',
    yellow: 'Kuning',
    green: 'Hijau',
    blue: 'Biru'
  }[gameState.currentColor] || '';
  pill.textContent = `Giliran: ${current.name}${you ? ' (Kamu)' : ''} • ${dirArrow}${colorName ? ' • Warna: ' + colorName : ''}`;
  pill.classList.remove('winner');
}

function renderGameplay() {
  renderPlayerPanel();
  renderPlayerDock();
  renderDiscard();
  renderDeckCount();
  updateStatus();

  // Layar Pemenang
  if (gameState.winner) {
    showWinnerOverlay(gameState.winner.name);
  } else {
    hideWinnerOverlay();
  }

  const me = myPlayer();
  const unoVisible = me && me.hand.length === 1 && !me.hasUno && !gameState.winner;
  DOM.unoBtn.classList.toggle('hidden', !unoVisible);
  DOM.passBtn.disabled = !isMyTurn();
}

/* ============================================
   AKSI (mengirim ke Host atau proses lokal)
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
    sendAction('PLAY_CARD', { cardIndex: idx, chosenColor: color });
  } else if (roomPlayCard(0, idx, color)) afterRoomChange();
}

function drawAction() {
  gameState.passPending = false;
  if (gameState.isOnline) {
    sendAction('DRAW');
  } else {
    drawLocal();
  }
}

function passAction() {
  if (gameState.winner || !isMyTurn()) return;
  if (gameState.isOnline) {
    sendAction('PASS');
  } else {
    passLocal();
  }
}

/* ============================================
   GAME LOG -> CHAT FEED
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

DOM.playerNameInput.addEventListener('input', (e) => {
  gameState.playerProfile.name = e.target.value.trim() || 'Pemain';
});

DOM.avatarBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    DOM.avatarBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    gameState.playerProfile.avatar = btn.dataset.avatar;
  });
});

DOM.botModeBtn.addEventListener('click', () => {
  gameState.gameMode = 'bot';
  DOM.botModeBtn.classList.add('active');
  DOM.onlineModeBtn.classList.remove('active');
  DOM.botSection.classList.add('active');
  DOM.onlineSection.classList.remove('active');
});

DOM.onlineModeBtn.addEventListener('click', () => {
  gameState.gameMode = 'online';
  DOM.onlineModeBtn.classList.add('active');
  DOM.botModeBtn.classList.remove('active');
  DOM.onlineSection.classList.add('active');
  DOM.botSection.classList.remove('active');
});

DOM.startBotBtn.addEventListener('click', () => {
  gameState.gameMode = 'bot';
  DOM.roomInfoDisplay.textContent = 'Mode: Lawan Bot';
  resetLocalGame();
  showScreen('gameplay');
});

DOM.createRoomBtn.addEventListener('click', () => {
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Mode: Online (Host)';
  createRoom();
});

let joining = false;

DOM.joinRoomBtn.addEventListener('click', () => {
  if (joining) return;
  const code = DOM.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast('Masukkan kode room');
    return;
  }
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Mode: Online';
  joining = true;
  DOM.joinRoomBtn.disabled = true;
  DOM.joinRoomBtn.textContent = 'Menghubungkan...';
  joinRoom(code);
  setTimeout(() => {
    joining = false;
    DOM.joinRoomBtn.disabled = false;
    DOM.joinRoomBtn.textContent = 'Gabung';
  }, 12000);
});

DOM.roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    DOM.joinRoomBtn.click();
  }
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

  if (card.color === 'wild' || card.value === 'wild4') {
    gameState.pendingWild = idx;
    DOM.colorPicker.classList.remove('hidden');
    return;
  }

  gameState.passPending = false;
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
      sendAction('PLAY_CARD', { cardIndex: idx, chosenColor: color });
    } else if (roomPlayCard(0, idx, color)) afterRoomChange();
  });
});

DOM.colorPicker.addEventListener('click', (e) => {
  if (e.target === DOM.colorPicker) {
    gameState.pendingWild = null;
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
    resetLocalGame();
  }
});

DOM.winnerMenuBtn.addEventListener('click', () => {
  leaveGame();
});

/* ============================================
   EVENT HANDLERS - CHAT & EMOTE
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
  showScreen('lobby');
  DOM.botModeBtn.classList.add('active');
  DOM.botSection.classList.add('active');
  DOM.playerNameInput.value = gameState.playerProfile.name;
  DOM.avatarBtns[0].classList.add('active');
  DOM.soundToggleBtn.classList.add('on');
  DOM.soundToggleBtn.textContent = 'ON';
  buildEmoteGrid();
}

init();