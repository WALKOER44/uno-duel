import Card from './Card.jsx';
import { useGame } from '../context/GameContext.jsx';
import { useAudioActions } from '../context/SettingsContext.jsx';

export default function Table() {
  const { view, drawAction } = useGame();
  const { sfx } = useAudioActions();
  const g = view.game;

  const handleDraw = () => {
    sfx('draw');
    drawAction();
  };

  return (
    <div className="table">
      <div className="table-info">
        <span className="turn-indicator">
          {g.started
            ? g.winner
              ? `${g.winner.name} menang! 🏆`
              : g.isMyTurn
              ? 'Giliranmu! 🎯'
              : `Giliran: ${view.room.players[g.currentPlayer]?.name || '...'}`
            : 'Mempersiapkan...'}
        </span>
        {g.currentColor && <span className="active-color-indicator" style={{ backgroundColor: colorHex(g.currentColor) }} />}
      </div>
      <div className="pile-row">
        <button type="button" className="deck-card deck-back" onClick={handleDraw} title="Ambil Kartu">
          <span className="deck-glyph">🂠</span>
          <span className="deck-count">{g.deckCount}</span>
        </button>
        <div className="deck-card deck-display">
          <Card card={g.discardTop} staticMode />
        </div>
      </div>
      <div className="table-label">UNO DUEL</div>
    </div>
  );
}

function colorHex(color) {
  return {
    red: '#ff4d4d',
    yellow: '#ffd400',
    green: '#22c55e',
    blue: '#2563eb'
  }[color] || '#000';
}