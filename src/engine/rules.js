import { isActionValue } from './cards.js';

export function isValidMove(card, topCard, currentColor) {
  if (!card) return false;
  if (!topCard) return true;
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild4') return true;
  const activeColor = topCard.chosenColor || currentColor || topCard.color;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function canPair(cardA, cardB, top) {
  if (!cardA || !cardB || !top) return false;
  if (cardA.id === cardB.id) return false;
  if (isActionValue(cardA.value) || isActionValue(cardB.value)) return false;
  if (cardA.value !== cardB.value) return false;
  return cardA.value === top.value;
}

export function canStartPair(card, top, hand) {
  if (!card || !top) return false;
  if (isActionValue(card.value)) return false;
  if (card.value !== top.value) return false;
  return (hand || []).filter((c) => c && c.value === card.value).length >= 2;
}

export function nextTurn(idx, len, direction) {
  const next = idx + direction;
  if (next >= len) return 0;
  if (next < 0) return len - 1;
  return next;
}

export function playableIndexes(hand, topCard, currentColor) {
  return (hand || [])
    .map((c, i) => (isValidMove(c, topCard, currentColor) ? i : -1))
    .filter((i) => i !== -1);
}