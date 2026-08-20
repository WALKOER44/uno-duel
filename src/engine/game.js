import { createDeckFor, shuffleDeck, dedupeCards, dedupePlayers, createCard, getCardLabel, cardColorClass } from './cards.js';
import { isValidMove, canPair, canStartPair, nextTurn } from './rules.js';
import { pickBotPersona, randomLine, botPickMove, botChooseColor } from './bot.js';
import { ACTION_VALUES } from './constants.js';

export function createGameState() {
  return {
    players: [],
    deck: [],
    discard: [],
    currentPlayer: 0,
    direction: 1,
    currentColor: null,
    winner: null,
    gameStarted: false,
    pendingWild: null,
    pairSelect: null,
    roomCode: null,
    roomCapacity: 8,
    isPublic: false,
    isOnline: false,
    isHost: false,
    playerIndex: 0,
    chatHistory: [],
    log: [],
    botMoods: {},
    botChat: null,
    hasUno: false
  };
}

export function topCard(G) {
  return G.discard[G.discard.length - 1] || null;
}

export function myIndex(G) {
  return G.isOnline ? G.playerIndex : 0;
}

export function isMyTurn(G) {
  if (G.winner) return false;
  return G.currentPlayer === myIndex(G);
}

export function startGame(G, opts) {
  const capacity = opts.capacity || G.roomCapacity || 8;
  while (G.players.length < Math.max(2, capacity) && G.players.length < 8) {
    const persona = pickBotPersona(G.players);
    G.players.push({
      id: `bot-${persona.name}-${Date.now()}`,
      name: persona.name,
      avatar: persona.avatar,
      isMe: false,
      isHost: false,
      isBot: true,
      hasUno: false,
      hand: []
    });
  }

  G.deck = shuffleDeck(createDeckFor(G.players.length));
  G.discard = [];
  G.players.forEach((p) => {
    p.hand = [];
    p.hasUno = false;
    for (let i = 0; i < 7; i += 1) p.hand.push(G.deck.pop());
  });

  let top = G.deck.pop();
  while (top && ACTION_VALUES.includes(top.value)) {
    G.discard.push(top);
    top = G.deck.pop();
  }
  if (!top) top = createCard('red', '0');
  G.discard.push(top);
  G.currentColor = top.color === 'wild' ? 'red' : top.color;
  G.currentPlayer = 0;
  G.direction = 1;
  G.winner = null;
  G.gameStarted = true;
  G.pendingWild = null;
  G.pairSelect = null;
  G.botMoods = {};
  G.botChat = null;
  G.hasUno = false;
  G.log = [`🎮 ${G.players[0].name} mulai bermain!`];
  return G;
}

export function replenishDeck(G) {
  if (G.deck.length > 0) return;
  if (G.discard.length >= 2) {
    const t = G.discard.pop();
    G.deck = shuffleDeck(G.discard);
    G.discard = [t];
    G.log.push('🔄 Tumpukan buangan diacak kembali menjadi kartu draw!');
    return;
  }
  G.deck = createDeckFor(G.players.length || 2);
  G.log.push('🔄 Tumpukan kartu habis! Mengisi ulang dengan kartu baru dari awal.');
}

export function drawCardFor(G, playerIdx) {
  replenishDeck(G);
  const card = G.deck.pop();
  if (!card) return null;
  G.players[playerIdx].hand.push(card);
  return card;
}

function setActiveColor(G, playedCard, chosenColor) {
  G.currentColor = (chosenColor || playedCard.chosenColor) || playedCard.color || null;
}

function registerHit(G, playerIdx, kind) {
  const p = G.players[playerIdx];
  if (!p) return null;
  const mood = G.botMoods[playerIdx] || { hits: 0, lastHit: 0 };
  const now = Date.now();
  if (now - mood.lastHit < 9000) mood.hits += 1;
  else mood.hits = 1;
  mood.lastHit = now;
  G.botMoods[playerIdx] = mood;

  const emoteMap = {
    draw2: ['cry', 'rage', 'pout'],
    draw4: ['rage', 'rage', 'shock'],
    skip: ['pout', 'rage', 'shock']
  };
  const pool = emoteMap[kind] || ['pout', 'rage'];
  const emotion = mood.hits >= 2 ? 'rage' : pool[Math.floor(Math.random() * pool.length)];
  const isBot = !!p.isBot;
  const lineKey =
    mood.hits >= 2 ? (kind === 'draw4' ? 'draw4rage' : 'draw2rage') : kind === 'draw4' ? 'draw4' : 'draw2';
  return { playerIdx, emotion, isBot, lineKey };
}

function setBotChat(G, playerIdx, category) {
  const p = G.players[playerIdx];
  if (!p || !p.isBot) return;
  G.botChat = { index: playerIdx, text: randomLine(category), until: Date.now() + 3500, ts: Date.now() };
}

export function playCard(G, playerIdx, cardId, chosenColor) {
  const player = G.players[playerIdx];
  const idx = (player.hand || []).findIndex((c) => c.id === cardId);
  const card = idx === -1 ? null : player.hand[idx];
  const top = topCard(G);

  if (!card || !isValidMove(card, top, G.currentColor)) {
    return { ok: false, reason: 'invalid' };
  }

  player.hand.splice(idx, 1);
  const played = { ...card, displayColor: chosenColor || card.color };
  if (card.color === 'wild' || card.value === 'wild4') {
    if (chosenColor) {
      played.chosenColor = chosenColor;
      played.displayColor = chosenColor;
    }
  }
  setActiveColor(G, played, chosenColor);
  G.discard.push(played);
  G.log.push(`${player.name} main ${getCardLabel(card)}`);

  if (player.hand.length === 0) {
    G.winner = player;
    G.log.push(`🎉 ${player.name} MENANG!`);
    const effects = { winnerIdx: playerIdx, kind: 'win' };
    if (!player.isBot) {
      const loser = G.players.find((p) => p.isBot);
      if (loser) setBotChat(G, G.players.indexOf(loser), 'lose');
    } else {
      setBotChat(G, playerIdx, 'win');
    }
    return { ok: true, card: played, winner: true, effects };
  }

  if (player.hand.length === 1) {
    player.hasUno = false;
    if (player.isBot) setBotChat(G, playerIdx, 'uno');
  }

  let nextIdx = playerIdx;
  const effects = { card: played, action: null, hit: null };

  if (card.value === 'skip') {
    const skippedIdx = nextTurn(nextIdx, G.players.length, G.direction);
    nextIdx = nextTurn(skippedIdx, G.players.length, G.direction);
    effects.action = 'skip';
    effects.hit = registerHit(G, skippedIdx, 'skip');
    G.log.push('⏭ Skip!');
    if (player.isBot) setBotChat(G, playerIdx, 'skip');
  } else if (card.value === 'reverse') {
    G.direction *= -1;
    if (G.players.length === 2) {
      nextIdx = nextTurn(nextIdx, G.players.length, G.direction);
    }
    effects.action = 'reverse';
    G.log.push('🔄 Reverse!');
  } else if (card.value === 'draw2') {
    nextIdx = nextTurn(nextIdx, G.players.length, G.direction);
    const target = G.players[nextIdx];
    for (let i = 0; i < 2; i += 1) drawCardFor(G, nextIdx);
    effects.action = 'draw2';
    effects.hit = registerHit(G, nextIdx, 'draw2');
    G.log.push(`${target.name} ambil +2`);
    nextIdx = nextTurn(nextIdx, G.players.length, G.direction);
  } else if (card.value === 'wild4') {
    nextIdx = nextTurn(nextIdx, G.players.length, G.direction);
    const target = G.players[nextIdx];
    for (let i = 0; i < 4; i += 1) drawCardFor(G, nextIdx);
    effects.action = 'wild4';
    effects.hit = registerHit(G, nextIdx, 'draw4');
    G.log.push(`${target.name} ambil +4`);
    nextIdx = nextTurn(nextIdx, G.players.length, G.direction);
  } else {
    nextIdx = nextTurn(nextIdx, G.players.length, G.direction);
    effects.action = card.value === 'wild' ? 'wild' : null;
    if (card.color === 'wild' || card.value === 'wild4') effects.wildColor = played.chosenColor || G.currentColor;
    if (player.isBot && Math.random() < 0.4) setBotChat(G, playerIdx, 'play');
  }

  G.currentPlayer = nextIdx;
  return { ok: true, card: played, winner: false, effects };
}

export function playPair(G, playerIdx, idA, idB) {
  const player = G.players[playerIdx];
  const top = topCard(G);
  const idxA = (player.hand || []).findIndex((c) => c.id === idA);
  const idxB = (player.hand || []).findIndex((c) => c.id === idB);
  if (idxA === -1 || idxB === -1 || idxA === idxB) return { ok: false, reason: 'invalid' };
  const cardA = player.hand[idxA];
  const cardB = player.hand[idxB];
  if (!canPair(cardA, cardB, top)) return { ok: false, reason: 'invalid' };

  const lastIdx = Math.max(idxA, idxB);
  const firstIdx = Math.min(idxA, idxB);
  const second = player.hand.splice(lastIdx, 1)[0];
  const first = player.hand.splice(firstIdx, 1)[0];

  const playedFirst = { ...first, displayColor: first.color };
  const playedSecond = { ...second, displayColor: second.color };
  setActiveColor(G, playedSecond, null);
  G.discard.push(playedFirst);
  G.discard.push(playedSecond);
  G.log.push(`${player.name} main dobel ${getCardLabel(first)}`);

  if (player.hand.length === 0) {
    G.winner = player;
    G.log.push(`🎉 ${player.name} MENANG!`);
    if (!player.isBot) {
      const loser = G.players.find((p) => p.isBot);
      if (loser) setBotChat(G, G.players.indexOf(loser), 'lose');
    } else {
      setBotChat(G, playerIdx, 'win');
    }
    return { ok: true, winner: true, effects: { winnerIdx: playerIdx, kind: 'win' } };
  }

  if (player.hand.length === 1) {
    player.hasUno = false;
    if (player.isBot) setBotChat(G, playerIdx, 'uno');
  }

  G.currentPlayer = nextTurn(playerIdx, G.players.length, G.direction);
  return { ok: true, winner: false, effects: { card: playedSecond } };
}

export function drawAndPass(G, playerIdx) {
  const drawn = drawCardFor(G, playerIdx);
  const top = topCard(G);
  if (drawn && isValidMove(drawn, top, G.currentColor)) {
    return { ok: true, drawn, playable: true };
  }
  G.currentPlayer = nextTurn(playerIdx, G.players.length, G.direction);
  return { ok: true, drawn, playable: false };
}

export function pass(G, playerIdx) {
  G.currentPlayer = nextTurn(playerIdx, G.players.length, G.direction);
  return { ok: true };
}

export function setWildColor(G, playerIdx, color) {
  const top = topCard(G);
  if (!top) return { ok: false };
  G.currentColor = color;
  top.chosenColor = color;
  top.displayColor = color;
  G.currentPlayer = nextTurn(playerIdx, G.players.length, G.direction);
  return { ok: true, color };
}

export function setPairSelect(G, cardId) {
  G.pairSelect = cardId;
}

export function clearPairSelect(G) {
  G.pairSelect = null;
}

export function botTurnNow(G, playerIdx) {
  const bot = G.players[playerIdx];
  if (!bot || !bot.isBot || G.winner) return null;
  if (Math.random() < 0.3) {
    G.botChat = { index: playerIdx, text: '🤔', until: Date.now() + 900, ts: Date.now() };
  }
  const choice = botPickMove(bot, topCard(G), G.currentColor);
  if (choice) {
    const color = choice.color === 'wild' ? botChooseColor(bot) : null;
    const res = playCard(G, playerIdx, choice.id, color);
    return res;
  }
  const drawn = drawCardFor(G, playerIdx);
  if (drawn && isValidMove(drawn, topCard(G), G.currentColor)) {
    const color = drawn.color === 'wild' ? botChooseColor(bot) : null;
    return playCard(G, playerIdx, drawn.id, color);
  }
  G.currentPlayer = nextTurn(playerIdx, G.players.length, G.direction);
  return { ok: true, passed: true };
}

export function endRoundFewestCards(G, reason) {
  let best = G.players[0] || { name: 'Pemain', hand: [] };
  for (const p of G.players) {
    if ((p.hand || []).length < (best.hand || []).length) best = p;
  }
  G.log.push(reason || '😵 Semua kartu habis');
  G.winner = best;
  G.log.push(`🏆 ${best.name} MENANG (kartu tersedikit)!`);
  return G;
}

export function cardRectClass(card) {
  return cardColorClass(card);
}

export { dedupeCards, dedupePlayers, canStartPair, nextTurn as nextTurnFn, topCard as getTopCard };