import { io } from 'socket.io-client';
import { createDeck, shuffleDeck, isPlayableCard, getCardLabel } from './poker.js';

/* ============================================
   CONSTANTS
   ============================================ */

const COLORS = ['red', 'yellow', 'green', 'blue'];
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

/* ============================================
   GAME STATE - CENTRALIZED
   ============================================ */

const gameState = {
  // APP STATE
  screenState: 'lobby', // 'lobby' | 'room' | 'gameplay'
  gameMode: 'bot', // 'bot' | 'online'
  playerProfile: {
    name: 'Pemain',
    avatar: '🧑'
  },

  // ONLINE STATE
  socket: null,
  pendingSocketAction: null,
  roomCode: '',
  playerIndex: 0,
  isHost: false,
  connectedToRoom: false,
  isOnline: false,

  // GAMEPLAY STATE
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
  // Screens
  lobbyScreen: document.getElementById('lobby-screen'),
  roomScreen: document.getElementById('room-screen'),
  gameplayScreen: document.getElementById('gameplay-screen'),

  // Lobby Elements
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

  // Waiting Room Elements
  waitingRoomCode: document.getElementById('waiting-room-code'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  waitingPlayersList: document.getElementById('waiting-players-list'),
  waitingStatus: document.getElementById('waiting-status'),
  startGameBtn: document.getElementById('start-game-btn'),
  leaveRoomBtn: document.getElementById('leave-room-btn'),

  // Gameplay Elements
  exitGameBtn: document.getElementById('exit-game-btn'),
  roomInfoDisplay: document.getElementById('room-info-display'),
  tableSeats: document.getElementById('table-seats'),
  discardPile: document.getElementById('discard-pile'),
  drawPile: document.getElementById('draw-pile'),
  deckCount: document.getElementById('deck-count'),
  statusContent: document.getElementById('status-content'),
  gameLog: document.getElementById('game-log'),
  drawBtn: document.getElementById('draw-btn'),
  passBtn: document.getElementById('pass-btn'),
  unoBtn: document.getElementById('uno-btn'),
  newRoundBtn: document.getElementById('new-round-btn'),
  colorPicker: document.getElementById('color-picker'),
  colorButtons: [...document.querySelectorAll('.color-button')],
  toast: document.getElementById('toast')
};

/* ============================================
   UTILITY FUNCTIONS
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
  }, 2000);
}

function playSound(type = 'click') {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const sounds = {
      click: { freq: 520, dur: 0.08, type: 'triangle' },
      draw: { freq: 300, dur: 0.12, type: 'sawtooth' },
      win: { freq: 720, dur: 0.25, type: 'square' },
      action: { freq: 440, dur: 0.11, type: 'sine' }
    };

    const s = sounds[type] || sounds.click;
    osc.type = s.type;
    osc.frequency.value = s.freq;
    gain.gain.value = 0.03;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, s.dur * 1000);
  } catch (e) {
    // Silent fail
  }
}

function addLog(message) {
  gameState.log.unshift(message);
  const html = gameState.log.slice(0, 10).map((msg) => `<li>${msg}</li>`).join('');
  DOM.gameLog.innerHTML = html;
}

/* ============================================
   CARD ART
   ============================================ */

function getCardSymbol(card) {
  if (card.value === 'reverse') return '🔄';
  if (card.value === 'skip') return '🚫';
  if (card.value === 'draw2') return '🃏';
  if (card.value === 'wild' || card.value === 'wild4') return '🌈';
  return String(card.value);
}

function cardFace(card) {
  const small = getCardLabel(card);
  return `
    <span class="card-corner tl">${small}</span>
    <span class="card-center">${getCardSymbol(card)}</span>
    <span class="card-corner br">${small}</span>
  `;
}

function cardColorClass(card) {
  if (!card) return 'wild';
  return card.color === 'wild' ? 'wild' : card.displayColor || card.color;
}

function cardButtonHTML(card, idx, playable) {
  const cls = `uno-card ${cardColorClass(card)}${playable ? ' playable' : ''}`;
  return `<button class="${cls}" data-index="${idx}" data-value="${card.value}">${cardFace(card)}</button>`;
}

/* ============================================
   GAME LOGIC - LOCAL GAME (BOT MODE)
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

function drawCardLocal(playerIdx) {
  replenishDeck();
  const card = gameState.deck.pop();
  if (!card) return null;
  gameState.players[playerIdx].hand.push(card);
  return card;
}

function playCardLocal(playerIdx, cardIdx, color = null) {
  const player = gameState.players[playerIdx];
  const card = player.hand[cardIdx];
  const top = topCard();

  if (!card || !isPlayableCard(card, top)) {
    addLog('❌ Kartu tidak cocok!');
    showToast('Kartu tidak cocok');
    return;
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
    renderGameplay();
    return;
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
    addLog('⟲ Reverse!');
  } else if (card.value === 'draw2') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    for (let i = 0; i < 2; i += 1) drawCardLocal(nextIdx);
    addLog(`${target.name} ambil +2`);
    playSound('action');
    nextIdx = nextTurn(nextIdx);
  } else if (card.value === 'wild4') {
    nextIdx = nextTurn(nextIdx);
    const target = gameState.players[nextIdx];
    for (let i = 0; i < 4; i += 1) drawCardLocal(nextIdx);
    addLog(`${target.name} ambil +4`);
    playSound('action');
    nextIdx = nextTurn(nextIdx);
  } else {
    nextIdx = nextTurn(nextIdx);
  }

  gameState.currentPlayer = nextIdx;
  renderGameplay();

  const currentPlayer = gameState.players[gameState.currentPlayer];
  if (currentPlayer && currentPlayer.isBot) {
    setTimeout(botTurn, 700);
  }
}

function botTurn() {
  if (gameState.isOnline || gameState.winner || gameState.currentPlayer !== 1) {
    return;
  }

  const bot = gameState.players[1];
  if (!bot || bot.isBot !== true) return;

  setTimeout(() => {
    if (gameState.winner || gameState.currentPlayer !== 1) return;
    const playable = bot.hand.filter((c) => isPlayableCard(c, topCard()));

    if (!playable.length) {
      const drawn = drawCardLocal(1);
      if (drawn && isPlayableCard(drawn, topCard())) {
        const idx = bot.hand.indexOf(drawn);
        const color = drawn.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : null;
        playCardLocal(1, idx, color);
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
    playCardLocal(1, idx, color);
  }, 700);
}

function resetLocalGame() {
  const freshDeck = shuffleDeck(createDeck());
  gameState.deck = freshDeck;
  gameState.discard = [];
  gameState.deckCount = freshDeck.length;

  gameState.players = [
    { id: 'player1', name: gameState.playerProfile.name, hand: [], isBot: false, isMe: true, hasUno: false, handCount: 0 },
    { id: 'player2', name: 'Bot', hand: [], isBot: true, isMe: false, hasUno: false, handCount: 0 }
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
  addLog('🃏 Ronde dimulai!');
  renderGameplay();
}

function drawLocal() {
  const me = gameState.players[0];
  const drawn = drawCardLocal(0);

  if (!drawn) {
    addLog('❌ Deck habis!');
    renderGameplay();
    return;
  }

  addLog('📚 Ambil 1 kartu');
  playSound('draw');

  if (isPlayableCard(drawn, topCard())) {
    addLog('✅ Bisa dimainkan!');

    if (drawn.color === 'wild' || drawn.value === 'wild4') {
      gameState.pendingWild = me.hand.length - 1;
      DOM.colorPicker.classList.remove('hidden');
      renderGameplay();
      return;
    }

    playCardLocal(0, me.hand.length - 1);
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
   HELPERS - MY TURN / MY PLAYER
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

function playableFromHand(card) {
  return isMyTurn() && isPlayableCard(card, topCard());
}

/* ============================================
   RENDERING - GAMEPLAY
   ============================================ */

function positionSeat(seat, idx, meIdx, total) {
  if (idx === meIdx) {
    seat.style.left = '0';
    seat.style.right = '0';
    seat.style.bottom = '6px';
    seat.style.top = 'auto';
    seat.style.transform = 'none';
    return;
  }

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
    y = 9;
  } else {
    const t = pos / (others - 1);
    x = 12 + t * 76;
    y = 9 + Math.pow(Math.abs(t - 0.5) * 2, 2) * 14;
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
  const meAvatar = gameState.playerProfile.avatar || '🧑';

  gameState.players.forEach((player, idx) => {
    const seat = document.createElement('div');
    seat.className = 'seat';

    if (idx === meIdx) {
      seat.classList.add('seat-me');
      const handLen = (player.hand || []).length;
      seat.innerHTML = `
        <div class="seat-name-row">
          <span class="seat-avatar">${meAvatar}</span>
          <span class="seat-name">${player.name}</span>
          <span class="card-count">${handLen}</span>
        </div>
        <div class="my-hand${handLen > 12 ? ' many-cards' : ''}"></div>
      `;
      const handEl = seat.querySelector('.my-hand');
      handEl.innerHTML = (player.hand || [])
        .map((card, ci) => cardButtonHTML(card, ci, playableFromHand(card)))
        .join('');
    } else {
      seat.classList.add('seat-opponent');
      const count = player.handCount !== undefined ? player.handCount : (player.hand || []).length;
      const avatar = gameState.isOnline ? '👤' : '🤖';
      const shown = Math.max(1, Math.min(count, 4));
      seat.innerHTML = `
        <div class="seat-name-row">
          <span class="seat-avatar">${avatar}</span>
          <span class="seat-name">${player.name}</span>
          <span class="card-count">${count}</span>
        </div>
        <div class="opponent-stack">${'<span class="mini-back">🂠</span>'.repeat(shown)}</div>
      `;
    }

    positionSeat(seat, idx, meIdx, total);
    container.appendChild(seat);
  });
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
  if (gameState.winner) {
    DOM.statusContent.textContent = `🏆 ${gameState.winner.name} menang!`;
    return;
  }
  if (!gameState.players.length || !gameState.players[gameState.currentPlayer]) {
    DOM.statusContent.textContent = 'Mempersiapkan...';
    return;
  }
  const current = gameState.players[gameState.currentPlayer];
  const you = isMyTurn();
  const dirArrow = gameState.direction === 1 ? '↻' : '↺';
  DOM.statusContent.textContent = `Giliran: ${current.name}${you ? ' (Kamu)' : ''} • Arah ${dirArrow}`;
}

function renderGameplay() {
  renderSeats();
  renderDiscard();
  renderDeckCount();
  updateStatus();

  const me = myPlayer();
  const unoVisible = me && me.hand.length === 1 && !me.hasUno && !gameState.winner;
  DOM.unoBtn.classList.toggle('hidden', !unoVisible);
  DOM.drawBtn.disabled = !isMyTurn();
  DOM.passBtn.disabled = gameState.isOnline || !isMyTurn();
}

/* ============================================
   WAITING ROOM RENDERING
   ============================================ */

function enterWaitingRoom(code) {
  gameState.gameStarted = false;
  DOM.waitingRoomCode.textContent = code;
  showScreen('room');
  renderWaitingRoom(gameState.players);
}

function renderWaitingRoom(players) {
  const list = DOM.waitingPlayersList;
  list.innerHTML = '';
  (players || []).forEach((p) => {
    const li = document.createElement('li');
    li.textContent = `${p.name}${p.isMe ? ' (Kamu)' : ''}`;
    list.appendChild(li);
  });

  const count = (players || []).length;
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
   ONLINE MODE - SOCKET.IO
   ============================================ */

function connectSocket(action) {
  if (gameState.socket && gameState.socket.connected) {
    if (action) action();
    return;
  }

  if (gameState.socket) {
    if (action) gameState.pendingSocketAction = action;
    return;
  }

  gameState.socket = io(SOCKET_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket']
  });
  if (action) gameState.pendingSocketAction = action;

  gameState.socket.on('connect', () => {
    DOM.connectionStatus.textContent = '✅ Terhubung';
    if (gameState.pendingSocketAction) {
      const a = gameState.pendingSocketAction;
      gameState.pendingSocketAction = null;
      a();
    }
  });

  gameState.socket.on('disconnect', () => {
    DOM.connectionStatus.textContent = '❌ Offline';
  });

  gameState.socket.on('roomCreated', ({ code }) => {
    gameState.createdRoomCode = code;
    gameState.roomCode = code;
    gameState.isHost = true;
    gameState.connectedToRoom = true;
    enterWaitingRoom(code);
    showToast(`Room dibuat: ${code}`);
  });

  gameState.socket.on('roomJoined', ({ code }) => {
    gameState.roomCode = code;
    gameState.isHost = false;
    gameState.connectedToRoom = true;
    enterWaitingRoom(code);
    showToast(`Gabung room: ${code}`);
  });

  gameState.socket.on('gameState', handleGameState);

  gameState.socket.on('error', ({ message }) => {
    showToast(`❌ ${message}`);
  });
}

function handleGameState(payload) {
  if (payload.started) {
    gameState.isOnline = true;
    gameState.roomCode = payload.code || gameState.roomCode;
    gameState.playerIndex = payload.playerIndex;
    gameState.currentPlayer = payload.currentPlayer;
    gameState.direction = payload.direction;
    gameState.discard = payload.discardTop ? [payload.discardTop] : [];
    gameState.deckCount = payload.deckCount;
    gameState.winner = payload.winner ? { name: payload.winner } : null;
    gameState.players = payload.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      isBot: false,
      isMe: idx === payload.playerIndex,
      isCurrentPlayer: idx === payload.currentPlayer,
      handCount: p.handCount,
      hasUno: p.hasUno,
      hand: idx === payload.playerIndex ? payload.myHand : []
    }));

    if (gameState.screenState !== 'gameplay') {
      gameState.gameStarted = true;
      showScreen('gameplay');
      DOM.roomInfoDisplay.textContent = `Room: ${gameState.roomCode} | Player #${gameState.playerIndex + 1}`;
    }
    renderGameplay();
  } else {
    gameState.players = payload.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      isMe: idx === payload.playerIndex,
      handCount: p.handCount,
      hand: []
    }));

    if (gameState.screenState === 'gameplay') {
      gameState.gameStarted = false;
      showToast('Game dihentikan: ada pemain keluar');
      enterWaitingRoom(gameState.roomCode);
    } else if (gameState.connectedToRoom) {
      renderWaitingRoom(gameState.players);
    }
  }
}

function resetOnlineState() {
  gameState.createdRoomCode = null;
  gameState.roomCode = '';
  gameState.playerIndex = 0;
  gameState.isHost = false;
  gameState.connectedToRoom = false;
  gameState.isOnline = false;
  gameState.gameStarted = false;
  gameState.winner = null;
  gameState.pendingWild = null;
  gameState.players = [];
}

function leaveGame() {
  if (gameState.socket) {
    gameState.socket.disconnect();
    gameState.socket = null;
  }
  resetOnlineState();
  showScreen('lobby');
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
  gameState.isOnline = false;
  gameState.playerIndex = 0;
  gameState.isHost = false;
  DOM.roomInfoDisplay.textContent = 'Mode: Lawan Bot';
  resetLocalGame();
  showScreen('gameplay');
});

DOM.createRoomBtn.addEventListener('click', () => {
  const name = gameState.playerProfile.name || 'Pemain';
  connectSocket(() => {
    gameState.socket.emit('createRoom', { playerName: name });
  });
});

DOM.joinRoomBtn.addEventListener('click', () => {
  const code = DOM.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast('Masukkan kode room');
    return;
  }
  const name = gameState.playerProfile.name || 'Pemain';
  connectSocket(() => {
    gameState.socket.emit('joinRoom', { code, playerName: name });
  });
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
  if (!gameState.socket || !gameState.isHost || !gameState.roomCode) return;
  gameState.socket.emit('startGame', { code: gameState.roomCode });
});

DOM.leaveRoomBtn.addEventListener('click', () => {
  leaveGame();
});

/* ============================================
   EVENT HANDLERS - GAMEPLAY
   ============================================ */

DOM.exitGameBtn.addEventListener('click', () => {
  leaveGame();
});

// Card clicks (delegated on the seats container)
DOM.tableSeats.addEventListener('click', (e) => {
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

function playMyCard(idx) {
  if (gameState.isOnline) {
    gameState.socket.emit('playCard', { code: gameState.roomCode, cardIndex: idx });
  } else {
    playCardLocal(0, idx);
  }
}

// Draw pile
DOM.drawPile.addEventListener('click', () => {
  if (gameState.screenState !== 'gameplay' || gameState.winner || !isMyTurn()) return;
  if (gameState.isOnline) {
    gameState.socket.emit('drawCard', { code: gameState.roomCode });
  } else {
    drawLocal();
  }
});

// Draw button
DOM.drawBtn.addEventListener('click', () => {
  if (gameState.screenState !== 'gameplay' || gameState.winner || !isMyTurn()) return;
  if (gameState.isOnline) {
    gameState.socket.emit('drawCard', { code: gameState.roomCode });
  } else {
    drawLocal();
  }
});

// Pass button (local only)
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

// UNO button
DOM.unoBtn.addEventListener('click', () => {
  const me = myPlayer();
  if (!me || me.hand.length !== 1) return;

  if (gameState.isOnline) {
    gameState.socket.emit('callUno', { code: gameState.roomCode });
  } else {
    me.hasUno = true;
    addLog('🎺 UNO!');
    showToast('UNO!');
    playSound('win');
    renderGameplay();
  }
});

// New round (local only)
DOM.newRoundBtn.addEventListener('click', () => {
  if (gameState.isOnline) {
    showToast('Ronde baru hanya untuk mode bot');
    return;
  }
  resetLocalGame();
});

// Color picker (Wild / +4)
DOM.colorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (gameState.pendingWild === null) return;

    const color = btn.dataset.color;
    const idx = gameState.pendingWild;
    gameState.pendingWild = null;
    DOM.colorPicker.classList.add('hidden');

    if (gameState.isOnline) {
      gameState.socket.emit('playCard', { code: gameState.roomCode, cardIndex: idx, chosenColor: color });
    } else {
      playCardLocal(0, idx, color);
    }
  });
});

/* ============================================
   INITIALIZATION
   ============================================ */

function init() {
  showScreen('lobby');
  DOM.botModeBtn.classList.add('active');
  DOM.botSection.classList.add('active');
  DOM.playerNameInput.value = gameState.playerProfile.name;
  DOM.avatarBtns[0].classList.add('active');
}

init();