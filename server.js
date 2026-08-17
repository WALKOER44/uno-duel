import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const PORT = process.env.PORT || 3001;
const COLORS = ['red', 'yellow', 'green', 'blue'];
const rooms = new Map();
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createCard(color, value) {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, color, value, displayColor: color };
}

function createDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push(createCard(color, '0'));
    for (let value = 1; value <= 9; value += 1) {
      deck.push(createCard(color, String(value)));
      deck.push(createCard(color, String(value)));
    }
    ['skip', 'reverse', 'draw2'].forEach((v) => {
      deck.push(createCard(color, v));
      deck.push(createCard(color, v));
    });
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push(createCard('wild', 'wild'));
    deck.push(createCard('wild', 'wild4'));
  }
  return deck;
}

function shuffleDeck(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextTurn(length, currIdx, direction) {
  const next = currIdx + direction;
  if (next >= length) return 0;
  if (next < 0) return length - 1;
  return next;
}

function isPlayable(card, topCard) {
  if (!topCard) return true;
  if (card.color === 'wild') return true;
  if (card.color === topCard.color) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function replenishDeck(room) {
  if (room.deck.length > 0) return;
  if (room.discard.length <= 1) return;
  const top = room.discard.pop();
  room.deck = shuffleDeck(room.discard);
  room.discard = [top];
}

function broadcastRoomState(room) {
  const topCard = room.discard[room.discard.length - 1] || null;
  
  for (let playerIdx = 0; playerIdx < room.players.length; playerIdx += 1) {
    const player = room.players[playerIdx];
    const clientPayload = {
      code: room.code,
      started: room.started,
      currentPlayer: room.currentPlayer,
      direction: room.direction,
      winner: room.winner,
      message: room.message,
      playerIndex: playerIdx,
      discardTop: topCard,
      deckCount: room.deck.length,
      myHand: player.hand || [],
      players: room.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        handCount: (p.hand || []).length,
        isCurrentPlayer: idx === room.currentPlayer,
        hasUno: p.hasUnoPressed
      }))
    };
    
    io.to(player.id).emit('gameState', clientPayload);
  }
}

function startGame(room) {
  const freshDeck = shuffleDeck(createDeck());
  room.deck = freshDeck;
  room.discard = [];
  room.direction = 1;
  room.currentPlayer = 0;
  room.winner = null;
  room.message = 'Ronde dimulai!';

  for (const player of room.players) {
    player.hand = [];
    player.hasUnoPressed = false;
  }

  for (let i = 0; i < 7; i += 1) {
    for (const player of room.players) {
      const card = room.deck.pop();
      if (card) player.hand.push(card);
    }
  }

  let firstCard = room.deck.pop();
  while (firstCard && (firstCard.color === 'wild' || firstCard.value === 'wild4')) {
    room.deck.unshift(firstCard);
    firstCard = room.deck.pop();
  }

  if (firstCard) room.discard.push(firstCard);
  else room.discard.push(createCard('red', '0'));

  room.started = true;
  broadcastRoomState(room);
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

io.on('connection', (socket) => {
  console.log(`[Socket] ${socket.id} connected`);

  socket.on('createRoom', ({ playerName }) => {
    const code = randomCode();
    const room = {
      code,
      players: [
        { id: socket.id, name: playerName || 'Player 1', hand: [], hasUnoPressed: false }
      ],
      started: false,
      deck: [],
      discard: [],
      currentPlayer: 0,
      winner: null,
      direction: 1,
      message: 'Menunggu pemain lain...'
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('roomCreated', { code, playerIndex: 0 });
    broadcastRoomState(room);
    console.log(`[Room] ${code} created by ${playerName}`);
  });

  socket.on('joinRoom', ({ code, playerName }) => {
    const normalized = (code || '').toUpperCase();
    const room = getRoom(normalized);

    if (!room) {
      socket.emit('error', { message: 'Kode ruangan tidak ditemukan.' });
      return;
    }

    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('error', { message: `Ruangan penuh (maksimal ${MAX_PLAYERS} pemain).` });
      return;
    }

    if (room.started) {
      socket.emit('error', { message: 'Permainan sudah dimulai.' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName || `Player ${room.players.length + 1}`,
      hand: [],
      hasUnoPressed: false
    });

    socket.join(normalized);
    socket.emit('roomJoined', { code: normalized, playerIndex: room.players.length - 1 });
    broadcastRoomState(room);
    console.log(`[Room] ${playerName} joined ${normalized}`);

    if (room.players.length >= MAX_PLAYERS && !room.started) {
      startGame(room);
      console.log(`[Game] Room ${normalized} full - auto start`);
    }
  });

  socket.on('startGame', ({ code }) => {
    const room = getRoom(code);
    if (!room || room.started) return;
    if (room.players.length < MIN_PLAYERS) {
      socket.emit('error', { message: `Butuh minimal ${MIN_PLAYERS} pemain untuk mulai.` });
      return;
    }

    startGame(room);
    console.log(`[Game] Starting in room ${code}`);
  });

  socket.on('playCard', ({ code, cardIndex, chosenColor }) => {
    const room = getRoom(code);
    if (!room || !room.started) return;

    const playerIdx = room.players.findIndex((p) => p.id === socket.id);
    if (playerIdx === -1 || playerIdx !== room.currentPlayer) return;

    const player = room.players[playerIdx];
    const card = player.hand[cardIndex];
    const topCard = room.discard[room.discard.length - 1];

    if (!card || !isPlayable(card, topCard)) {
      socket.emit('error', { message: 'Kartu tidak bisa dimainkan.' });
      return;
    }

    player.hand.splice(cardIndex, 1);
    const playedCard = { ...card, displayColor: chosenColor || card.color };
    room.discard.push(playedCard);
    room.message = `${player.name} mainkan ${card.value}`;

    if (player.hand.length === 0) {
      room.winner = player.name;
      room.message = `${player.name} menang! 🎉`;
      broadcastRoomState(room);
      return;
    }

    if (player.hand.length === 1) {
      player.hasUnoPressed = false;
    }

    // Handle card actions
    let nextIdx = playerIdx;
    if (card.value === 'skip') {
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      room.message = `${player.name} Skip!`;
    } else if (card.value === 'reverse') {
      room.direction *= -1;
      if (room.players.length === 2) {
        nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      }
      room.message = `${player.name} Reverse!`;
    } else if (card.value === 'draw2') {
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      const target = room.players[nextIdx];
      for (let i = 0; i < 2; i += 1) {
        replenishDeck(room);
        if (room.deck.length > 0) {
          target.hand.push(room.deck.pop());
        }
      }
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      room.message = `${player.name} +2!`;
    } else if (card.value === 'wild4') {
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      const target = room.players[nextIdx];
      for (let i = 0; i < 4; i += 1) {
        replenishDeck(room);
        if (room.deck.length > 0) {
          target.hand.push(room.deck.pop());
        }
      }
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
      room.message = `${player.name} +4!`;
    } else {
      nextIdx = nextTurn(room.players.length, nextIdx, room.direction);
    }

    room.currentPlayer = nextIdx;
    broadcastRoomState(room);
  });

  socket.on('drawCard', ({ code }) => {
    const room = getRoom(code);
    if (!room || !room.started) return;

    const playerIdx = room.players.findIndex((p) => p.id === socket.id);
    if (playerIdx === -1 || playerIdx !== room.currentPlayer) return;

    replenishDeck(room);
    if (room.deck.length === 0) {
      room.message = 'Deck habis!';
      broadcastRoomState(room);
      return;
    }

    const drawnCard = room.deck.pop();
    room.players[playerIdx].hand.push(drawnCard);
    room.message = `${room.players[playerIdx].name} ambil kartu`;

    if (isPlayable(drawnCard, room.discard[room.discard.length - 1])) {
      room.message += ' (bisa dimainkan)';
    } else {
      room.currentPlayer = nextTurn(room.players.length, playerIdx, room.direction);
      room.message += ' (tidak cocok, giliran berikutnya)';
    }

    broadcastRoomState(room);
  });

  socket.on('callUno', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    player.hasUnoPressed = true;
    room.message = `${player.name} UNO!`;
    broadcastRoomState(room);
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        const leftPlayer = room.players[idx];
        room.players.splice(idx, 1);

        console.log(`[Room] ${leftPlayer.name} left ${room.code}`);

        if (room.players.length === 0) {
          rooms.delete(room.code);
          console.log(`[Room] ${room.code} deleted (empty)`);
        } else {
          room.currentPlayer = Math.min(room.currentPlayer, room.players.length - 1);
          room.message = `${leftPlayer.name} keluar.`;
          room.started = false;
          broadcastRoomState(room);
        }
        break;
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🎮 UNO Server running on http://localhost:${PORT}\n`);
});

