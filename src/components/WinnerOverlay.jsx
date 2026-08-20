import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function WinnerOverlay() {
  const { view, newRound, leaveGame } = useGame();
  const { sfx } = useSettings();
  const g = view.game;
  if (!g.winner) return null;
  const isMe = view.room.players[g.myIndex]?.name === g.winner.name;

  return (
    <div className="modal">
      <div className="modal-card winner-card">
        <div className="winner-icon">🏆</div>
        <h2 className="winner-title">Pemenang</h2>
        <p className="winner-name">
          {g.winner.name}
          {isMe ? ' (Kamu!)' : ''}
        </p>
        <button
          type="button"
          className="lobby-btn btn-yellow"
          onClick={() => {
            sfx('click');
            newRound();
          }}
        >
          🔄 Main Lagi
        </button>
        <button type="button" className="lobby-btn btn-black" onClick={leaveGame}>
          🏠 Kembali ke Menu
        </button>
      </div>
    </div>
  );
}