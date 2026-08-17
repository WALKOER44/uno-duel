export const COLORS = ['red', 'yellow', 'green', 'blue'];

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createCard(color, value) {
  return {
    id: makeId(),
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

export function isPlayableCard(card, topCard) {
  if (!topCard) return true;
  if (card.color === 'wild') return true;
  if (card.color === topCard.color) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function isValidMove(card, topCard) {
  if (!card) return false;
  if (!topCard) return true;
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild4') {
    return true;
  }
  if (card.color === topCard.color) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function getPlayableCards(hand, topCard) {
  return hand.filter((card) => isValidMove(card, topCard));
}

export function getCardLabel(card) {
  if (card.value === 'skip') return '⏭';
  if (card.value === 'reverse') return '⟲';
  if (card.value === 'draw2') return '+2';
  if (card.value === 'wild') return 'W';
  if (card.value === 'wild4') return '+4';
  return String(card.value);
}

export function getNumericValue(card) {
  if (card.value === 'skip' || card.value === 'reverse') return 20;
  if (card.value === 'draw2') return 25;
  if (card.value === 'wild4') return 50;
  if (card.value === 'wild') return 40;
  return Number(card.value);
}
