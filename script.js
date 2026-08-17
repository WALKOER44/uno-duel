/* ============================================
   UNO DUEL - P2P MULTIPLAYER (PeerJS)
   Frontend only. No backend / WebSocket server.
   Redesign: clean minimal UI, floating pop-ups,
   chat & emote panel, settings menu.
   ============================================ */

/* ============================================
   CONSTANTS
   ============================================ */

const COLORS = ['red', 'yellow', 'green', 'blue'];
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const PEER_PREFIX = 'uno-duel-';

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
   DECK LOGIC
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

function isValidMove(card, topCard) {
  if (!card) return false;
  if (!topCard) return true;
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild4') {
    return true;
  }
  if (card.color === topCard.color) return true;
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

function cardButtonHTML(card, idx, playable) {
  const cls = `uno-card ${cardColorClass(card)}${playable ? ' playable' : ''}`;
  return `<button class="${cls}" data-index="${idx}" data-value="${card.value}">${cardFace(card)}</button>`;
}

/* ============================================
   GAME STATE - CENTRALIZED
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
  roomCode: '',
  playerIndex: 0,
  isHost: false,
  isOnline: false,
  connected: false,

  // ROOM / GAME STATE (host is authoritative)
  players: [],
  deck: [],
  deckCount: 0,
  discard: [],
  currentPlayer: 0,
  direction: 1,
  winner: null,
  pendingWild: null,
  log: [],
  gameStarted: false
};

/* ============================================
   DOM CACHE
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

  waitingRoomCode: document.getElementById('waiting-room-code'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  waitingPlayersList: document.getElementById('waiting-players-list'),
  waitingStatus: document.getElementById('waiting-status'),
  startGameBtn: document.getElementById('start-game-btn'),
  leaveRoomBtn: document.getElementById('leave-room-btn'),

  roomInfoDisplay: document.getElementById('room-info-display'),
  tableSeats: document.getElementById('table-seats'),
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

  toast: document.getElementById('toast')
};

/* ============================================
   UTILITIES
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

function setConnectionStatus(text) {
  DOM.connectionStatus.textContent = text;
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
   CHAT & EMOTE
   ============================================ */

function appendChat(msg) {
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

function sendChatMessage(text) {
  const msg = (text || '').trim();
  if (!msg) return;
  const me = myPlayer();

  if (gameState.isOnline) {
    if (gameState.isHost) {
      broadcastChat({ from: me.name, avatar: me.avatar, text: msg });
    } else if (gameState.conn && gameState.conn.open) {
      gameState.conn.send({ type: 'chat', text: msg });
    }
  } else {
    appendChat({ kind: 'msg', avatar: me.avatar, from: me.name, text: msg });
    botReactToChat();
  }
}

function sendEmote(emote, sound) {
  playEmoteSound(sound || emoteSoundOf(emote));
  const me = myPlayer();

  if (gameState.isOnline) {
    if (gameState.isHost) {
      broadcastChat({ from: me.name, avatar: me.avatar, emote });
    } else if (gameState.conn && gameState.conn.open) {
      gameState.conn.send({ type: 'chat', emote });
    }
  } else {
    appendChat({ kind: 'emote', avatar: me.avatar, from: me.name, emote });
    botReactToChat();
  }
}

function broadcastChat(msg) {
  gameState.players.forEach((p) => {
    if (p.isMe) {
      appendChat({ ...msg, kind: msg.emote ? 'emote' : 'msg' });
    } else if (p.conn && p.conn.open) {
      p.conn.send({ type: 'chat', from: msg.from, avatar: msg.avatar, text: msg.text, emote: msg.emote });
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
    appendChat({ kind: 'emote', avatar: '🤖', from: bot.name, emote: emote.e });
    playEmoteSound(emote.s);
  }, delay);
}

/* ============================================
   ROOM GAME LOGIC (works for both bot & host)
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

/**
 * Executes a card play against the room state.
 * Returns true when the play was applied (state already updated).
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
  } else if (card.value === 'draw2') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    for (let i = 0; i < 2; i += 1) drawCardFor(nextIdx);
    addLog(`${target.name} ambil +2`);
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
   ONLINE P2P - STATE PAYLOADS
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

function makeStatePayload(recipientIdx) {
  const shared = gameState.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: !!p.isHost,
    isBot: !!p.isBot,
    hasUno: !!p.hasUno,
    handCount: (p.hand || []).length
  }));
  return {
    type: 'state',
    code: gameState.roomCode,
    started: true,
    playerIndex: recipientIdx,
    currentPlayer: gameState.currentPlayer,
    direction: gameState.direction,
    discardTop: topCard(),
    deckCount: gameState.deck.length,
    winner: gameState.winner ? { name: gameState.winner.name } : null,
    players: shared,
    myHand: (gameState.players[recipientIdx] || {}).hand || []
  };
}

function makeLobbyPayload(recipientIdx) {
  return {
    type: 'lobby',
    code: gameState.roomCode,
    players: gameState.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isMe: idx === recipientIdx,
      isHost: !!p.isHost,
      isBot: !!p.isBot,
      handCount: (p.hand || []).length
    }))
  };
}

function broadcastLobby() {
  gameState.players.forEach((p, idx) => {
    const payload = makeLobbyPayload(idx);
    if (p.isMe) {
      renderWaitingRoom(payload);
    } else if (p.conn && p.conn.open) {
      p.conn.send(payload);
    }
  });
}

function broadcastState() {
  gameState.players.forEach((p, idx) => {
    const payload = makeStatePayload(idx);
    if (p.isMe) {
      applyStatePayload(payload);
    } else if (p.conn && p.conn.open) {
      p.conn.send(payload);
    }
  });
}

function applyStatePayload(payload) {
  gameState.isOnline = true;
  gameState.roomCode = payload.code || gameState.roomCode;
  gameState.playerIndex = payload.playerIndex;
  gameState.currentPlayer = payload.currentPlayer;
  gameState.direction = payload.direction;
  gameState.discard = payload.discardTop ? [payload.discardTop] : [];
  gameState.deckCount = payload.deckCount;
  gameState.winner = payload.winner ? { name: payload.winner.name } : null;
  gameState.players = payload.players.map((sp, idx) => ({
    id: sp.id,
    name: sp.name,
    avatar: sp.avatar,
    isMe: idx === payload.playerIndex,
    isHost: !!sp.isHost,
    isBot: !!sp.isBot,
    hasUno: !!sp.hasUno,
    handCount: sp.handCount,
    hand: idx === payload.playerIndex ? payload.myHand : []
  }));
  gameState.gameStarted = true;

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
   P2P - HOST LOGIC
   ============================================ */

function createRoom() {
  resetOnlineState();
  gameState.gameMode = 'online';
  gameState.isOnline = true;
  gameState.isHost = true;
  setConnectionStatus('⏳ Menyiapkan room...');

  spawnHostPeer();
}

function spawnHostPeer() {
  const code = randomCode();
  const peerId = PEER_PREFIX + code;

  const peer = new Peer(peerId, { debug: 1 });
  gameState.peer = peer;

  peer.on('open', () => {
    gameState.roomCode = code;
    gameState.connected = true;
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
    setConnectionStatus('✅ Terhubung (Host)');
    enterWaitingRoom(code);
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      conn.on('data', (data) => handleHostMessage(conn, data));
      conn.on('close', () => handleClientDisconnect(conn));
      conn.on('error', () => handleClientDisconnect(conn));
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      peer.destroy();
      gameState.peer = null;
      spawnHostPeer();
      return;
    }
    if (err.type === 'peer-unavailable') return;
    setConnectionStatus('❌ Gagal: ' + err.type);
    showToast('Gagal membuat room: ' + err.type);
  });
}

function handleHostMessage(conn, data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'hello': {
      if (gameState.gameStarted) {
        conn.send({ type: 'toast', message: 'Game sudah dimulai' });
        return;
      }
      const existing = gameState.players.find((p) => p.id === conn.peer);
      if (existing) {
        existing.name = data.name || existing.name;
        existing.avatar = data.avatar || existing.avatar;
      } else {
        if (gameState.players.length >= MAX_PLAYERS) {
          conn.send({ type: 'toast', message: 'Ruangan penuh' });
          return;
        }
        gameState.players.push({
          id: conn.peer,
          name: data.name || 'Pemain',
          avatar: data.avatar || '👤',
          isMe: false,
          isHost: false,
          isBot: false,
          conn,
          hand: [],
          hasUno: false
        });
      }
      broadcastLobby();
      break;
    }

    case 'chat': {
      const player = gameState.players.find((p) => p.id === conn.peer);
      if (!player) return;
      broadcastChat({ from: player.name, avatar: player.avatar, text: data.text, emote: data.emote });
      if (data.emote) playEmoteSound(emoteSoundOf(data.emote));
      break;
    }

    case 'playCard': {
      const idx = gameState.players.findIndex((p) => p.id === conn.peer);
      if (idx === -1 || idx !== gameState.currentPlayer) return;
      if (roomPlayCard(idx, data.cardIndex, data.chosenColor)) afterRoomChange();
      break;
    }

    case 'drawCard': {
      const idx = gameState.players.findIndex((p) => p.id === conn.peer);
      if (idx === -1 || idx !== gameState.currentPlayer) return;
      const me = gameState.players[idx];
      const drawn = drawCardFor(idx);
      if (!drawn) {
        addLog('❌ Deck habis!');
        broadcastState();
        return;
      }
      addLog('🎴 Ambil 1 kartu');
      playSound('draw');
      if (isValidMove(drawn, topCard())) {
        addLog('✅ Bisa dimainkan!');
        if (drawn.color === 'wild' || drawn.value === 'wild4') {
          gameState.pendingWild = me.hand.length - 1;
          broadcastState();
          conn.send({ type: 'pendingWild', cardIndex: me.hand.length - 1 });
          return;
        }
        if (roomPlayCard(idx, me.hand.length - 1)) afterRoomChange();
      } else {
        gameState.currentPlayer = nextTurn(idx);
        afterRoomChange();
      }
      break;
    }

    case 'callUno': {
      const player = gameState.players.find((p) => p.id === conn.peer);
      if (!player) return;
      player.hasUno = true;
      addLog('🎺 UNO!');
      playSound('win');
      broadcastState();
      break;
    }

    default:
      break;
  }
}

function handleClientDisconnect(conn) {
  const idx = gameState.players.findIndex((p) => p.id === conn.peer);
  if (idx === -1) return;
  const name = gameState.players[idx].name;
  gameState.players.splice(idx, 1);
  addLog(`${name} keluar`);

  if (gameState.gameStarted) {
    gameState.gameStarted = false;
    gameState.discard = [];
    gameState.deck = [];
    gameState.winner = null;
    for (const p of gameState.players) p.hand = [];
    showToast('Game dihentikan: ada pemain keluar');
    broadcastLobby();
  } else {
    broadcastLobby();
  }
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
  while (first && (first.color === 'wild' || first.value === 'wild4')) {
    gameState.deck.unshift(first);
    first = gameState.deck.pop();
  }

  gameState.deckCount = gameState.deck.length;
  gameState.discard = [first || { color: 'red', value: '0' }];
  gameState.currentPlayer = 0;
  gameState.direction = 1;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.gameStarted = true;
  gameState.log = [];

  DOM.colorPicker.classList.add('hidden');
  DOM.chatMessages.innerHTML = '';
  addLog('🃏 Ronde dimulai!');
  broadcastState();
}

/* ============================================
   P2P - CLIENT LOGIC
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

  setConnectionStatus('⏳ Menghubungkan...');
  const targetId = PEER_PREFIX + cleanCode;

  const peer = new Peer(undefined, { debug: 1 });
  gameState.peer = peer;

  peer.on('open', () => {
    const conn = peer.connect(targetId, { reliable: true });
    gameState.conn = conn;

    conn.on('open', () => {
      gameState.connected = true;
      gameState.roomCode = cleanCode;
      setConnectionStatus('✅ Terhubung');
      conn.send({
        type: 'hello',
        name: gameState.playerProfile.name || 'Pemain',
        avatar: gameState.playerProfile.avatar || '👤'
      });
    });

    conn.on('data', handleClientData);
    conn.on('close', handleHostDisconnect);
    conn.on('error', handleHostDisconnect);
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      setConnectionStatus('❌ Room tidak ditemukan');
      showToast('Room tidak ditemukan. Periksa kode.');
    } else {
      setConnectionStatus('❌ ' + err.type);
      showToast('Gagal terhubung: ' + err.type);
    }
  });
}

function handleClientData(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'lobby':
      renderWaitingRoom(data);
      break;

    case 'state':
      applyStatePayload(data);
      break;

    case 'pendingWild': {
      gameState.pendingWild = data.cardIndex;
      DOM.colorPicker.classList.remove('hidden');
      break;
    }

    case 'chat': {
      if (data.emote) {
        appendChat({ kind: 'emote', avatar: data.avatar, from: data.from, emote: data.emote });
        playEmoteSound(emoteSoundOf(data.emote));
      } else {
        appendChat({ kind: 'msg', avatar: data.avatar, from: data.from, text: data.text });
      }
      break;
    }

    case 'toast':
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
  gameState.players = [];
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
  DOM.colorPicker.classList.add('hidden');
  closeSettings();
  resetOnlineState();
  setConnectionStatus('Offline');
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
  while (first && (first.color === 'wild' || first.value === 'wild4')) {
    freshDeck.unshift(first);
    first = freshDeck.pop();
  }

  gameState.deck = freshDeck;
  gameState.deckCount = freshDeck.length;
  gameState.discard = [first || { color: 'red', value: '0' }];
  gameState.currentPlayer = 0;
  gameState.direction = 1;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.gameStarted = true;
  gameState.log = [];

  DOM.colorPicker.classList.add('hidden');
  DOM.chatMessages.innerHTML = '';
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

/* ============================================
   RENDERING - WAITING ROOM
   ============================================ */

function enterWaitingRoom(code) {
  gameState.gameStarted = false;
  DOM.waitingRoomCode.textContent = code;
  showScreen('room');
  broadcastLobby();
}

function renderWaitingRoom(payload) {
  const list = DOM.waitingPlayersList;
  list.innerHTML = '';
  (payload.players || []).forEach((p) => {
    const li = document.createElement('li');
    li.textContent = `${p.avatar || '👤'} ${p.name}${p.isMe ? ' (Kamu)' : ''}${p.isHost ? ' 👑' : ''}`;
    list.appendChild(li);
  });

  const count = (payload.players || []).length;
  DOM.waitingRoomCode.textContent = payload.code || gameState.roomCode;
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

  if (gameState.screenState !== 'room') {
    showScreen('room');
  }
}

/* ============================================
   RENDERING - GAMEPLAY
   ============================================ */

function positionSeat(seat, idx, meIdx, total) {
  const others = total - 1;
  const oppIndices = [];
  for (let i = 0; i < total; i += 1) {
    if (i !== meIdx) oppIndices.push(i);
  }
  const pos = oppIndices.indexOf(idx);

  let x;
  let y;
  if (others === 1) {
    x = 50;
    y = 10;
  } else if (others === 2) {
    x = pos === 0 ? 26 : 74;
    y = 12;
  } else {
    // Elliptical arc across the top for 3-5 opponents (up to 6 players total)
    const t = pos / (others - 1);
    const angle = Math.PI * (1 - t);
    x = 50 + 38 * Math.cos(angle);
    y = 12 + 20 * Math.sin(angle);
  }

  seat.style.left = `${x}%`;
  seat.style.top = `${y}%`;
  seat.style.transform = 'translate(-50%, -50%)';
  seat.style.right = 'auto';
  seat.style.bottom = 'auto';
}

function renderSeats() {
  const container = DOM.tableSeats;
  container.innerHTML = '';

  const total = gameState.players.length;
  const meIdx = myIndex();

  gameState.players.forEach((player, idx) => {
    if (idx === meIdx) return;

    const seat = document.createElement('div');
    seat.className = 'seat seat-opponent';

    const count = opponentHandCount(player);
    const avatar = player.avatar || (gameState.isOnline ? '👤' : '🤖');
    const shown = Math.max(1, Math.min(count, 6));
    const cardsHTML = Array.from({ length: shown }, () =>
      '<span class="uno-card back-card">🂠</span>'
    ).join('') + (count > shown ? `<span class="stack-more">+${count - shown}</span>` : '');
    seat.innerHTML = `
      <div class="seat-name-row">
        <span class="seat-avatar">${avatar}</span>
        <span class="seat-name">${player.name}</span>
        <span class="card-count">${count}</span>
      </div>
      <div class="opponent-stack">${cardsHTML}</div>
    `;

    positionSeat(seat, idx, meIdx, total);
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
  pill.textContent = `Giliran: ${current.name}${you ? ' (Kamu)' : ''} • ${dirArrow}`;
  pill.classList.remove('winner');
}

function renderGameplay() {
  renderSeats();
  renderPlayerDock();
  renderDiscard();
  renderDeckCount();
  updateStatus();

  const me = myPlayer();
  const unoVisible = me && me.hand.length === 1 && !me.hasUno && !gameState.winner;
  DOM.unoBtn.classList.toggle('hidden', !unoVisible);
  DOM.passBtn.disabled = gameState.isOnline || !isMyTurn();
}

/* ============================================
   ACTION HELPERS
   ============================================ */

function playMyCard(idx) {
  if (gameState.isOnline) {
    gameState.conn.send({ type: 'playCard', cardIndex: idx });
  } else {
    if (roomPlayCard(0, idx)) afterRoomChange();
  }
}

function drawAction() {
  if (gameState.isOnline) {
    gameState.conn.send({ type: 'drawCard' });
  } else {
    drawLocal();
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

DOM.joinRoomBtn.addEventListener('click', () => {
  const code = DOM.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast('Masukkan kode room');
    return;
  }
  gameState.gameMode = 'online';
  DOM.roomInfoDisplay.textContent = 'Mode: Online';
  joinRoom(code);
});

DOM.roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    DOM.joinRoomBtn.click();
  }
});

/* ============================================
   EVENT HANDLERS - WAITING ROOM
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

// Header: new round & settings
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

// Settings modal
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

// Play my cards
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

  playMyCard(idx);
});

// Draw pile
DOM.drawPile.addEventListener('click', () => {
  if (gameState.screenState !== 'gameplay' || gameState.winner || !isMyTurn()) return;
  drawAction();
});

// Pass
DOM.passBtn.addEventListener('click', () => {
  if (gameState.isOnline || gameState.winner || !isMyTurn()) return;
  addLog('⏭ Pass');
  gameState.currentPlayer = nextTurn(0);
  renderGameplay();
  const nextPlayer = gameState.players[gameState.currentPlayer];
  if (nextPlayer && nextPlayer.isBot) {
    setTimeout(botTurn, 700);
  }
});

// UNO!
DOM.unoBtn.addEventListener('click', () => {
  const me = myPlayer();
  if (!me || me.hand.length !== 1) return;

  if (gameState.isOnline) {
    gameState.conn.send({ type: 'callUno' });
  } else {
    me.hasUno = true;
    addLog('🎺 UNO!');
    showToast('UNO!');
    playSound('win');
    renderGameplay();
  }
});

// Color picker pop-up (Wild / +4)
DOM.colorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (gameState.pendingWild === null) return;

    const color = btn.dataset.color;
    const idx = gameState.pendingWild;
    gameState.pendingWild = null;
    DOM.colorPicker.classList.add('hidden');

    if (gameState.isOnline) {
      gameState.conn.send({ type: 'playCard', cardIndex: idx, chosenColor: color });
    } else {
      if (roomPlayCard(0, idx, color)) afterRoomChange();
    }
  });
});

DOM.colorPicker.addEventListener('click', (e) => {
  if (e.target === DOM.colorPicker) {
    gameState.pendingWild = null;
    DOM.colorPicker.classList.add('hidden');
  }
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