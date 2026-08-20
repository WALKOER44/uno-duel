import { COLORS, ACTION_VALUES } from './constants.js';

export function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createCard(color, value) {
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

export function createDeck() {
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

export function shuffleDeck(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createDeckFor(playerCount) {
  const full = shuffleDeck(createDeck());
  const stock = Math.min(full.length, 20 + (playerCount - 1) * 10);
  return full.slice(0, stock);
}

export function dedupeCards(hand) {
  const seen = new Set();
  return (hand || []).filter((c) => {
    if (!c || !c.id) return true;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function dedupePlayers(players) {
  const seen = new Set();
  return (players || []).filter((p) => {
    if (!p || !p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export function getCardLabel(card) {
  if (!card) return '';
  if (card.value === 'skip') return '⏭';
  if (card.value === 'reverse') return '⟲';
  if (card.value === 'draw2') return '+2';
  if (card.value === 'wild') return 'W';
  if (card.value === 'wild4') return '+4';
  return String(card.value);
}

export function getCardSymbol(card) {
  if (!card) return '🃏';
  if (card.value === 'reverse') return '🔄';
  if (card.value === 'skip') return '🚫';
  if (card.value === 'draw2') return '➕';
  if (card.value === 'wild' || card.value === 'wild4') return '🃏';
  return String(card.value);
}

export function cardColorClass(card) {
  if (!card) return 'wild';
  const dc = card.displayColor;
  if (dc && dc !== 'wild') return dc;
  return card.color;
}

export function isActionValue(value) {
  return ACTION_VALUES.includes(value);
}