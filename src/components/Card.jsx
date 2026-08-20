import { getCardLabel, getCardSymbol, cardColorClass } from '../engine/cards.js';

export default function Card({ card, playable = false, selected = false, staticMode = false, onClick, title }) {
  if (!card) return null;
  const cls = [
    'uno-card',
    cardColorClass(card),
    playable ? 'playable' : '',
    selected ? 'selected' : '',
    staticMode ? 'static' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      title={title}
      disabled={!onClick || staticMode}
      aria-disabled={staticMode ? true : undefined}
    >
      <span className="card-corner tl">{getCardLabel(card)}</span>
      <span className="card-center">{getCardSymbol(card)}</span>
      <span className="card-corner br">{getCardLabel(card)}</span>
    </button>
  );
}