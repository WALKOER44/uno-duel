import { useMemo } from 'react';
import { useGame } from '../context/GameContext.jsx';
import PixelEmote from './fx/PixelEmote.jsx';

export default function Seats() {
  const { view } = useGame();
  const { room, game } = view;

  const opponents = useMemo(() => room.players.filter((p) => !p.isMe), [room.players]);
  const myIndex = game.myIndex;

  function positionFor(i, total) {
    const spots = Math.max(total, 2);
    const angle = -90 + (i + 1) * (360 / spots);
    const rad = (angle * Math.PI) / 180;
    const rx = 50 + 38 * Math.cos(rad);
    const ry = 50 + 38 * Math.sin(rad);
    return { left: `${rx}%`, top: `${ry}%` };
  }

  return (
    <div className="seats">
      {opponents.map((p, i) => {
        const pos = positionFor(i, opponents.length);
        const playerIdx = room.players.findIndex((rp) => rp.id === p.id);
        const isTurn = game.started && !game.winner && game.currentPlayer !== myIndex && room.players[game.currentPlayer]?.id === p.id;
        return (
          <div key={p.id} className={`seat ${isTurn ? 'turn' : ''}`} style={pos}>
            <div className="seat-cards">
              {Array.from({ length: Math.min(p.handCount, 6) }).map((_, c) => (
                <span key={c} className="seat-card" />
              ))}
            </div>
            <div className="seat-label">
              <span className="seat-avatar">{p.avatar}</span>
              <span className="seat-name">{p.name}</span>
              <span className="seat-count">{p.handCount}</span>
              {p.hasUno && <span className="seat-uno">UNO!</span>}
            </div>
            {game.botChat && game.botChat.index === playerIdx && (
              <div className="seat-bubble">
                {game.botChat.text === '🤔' ? <PixelEmote name="think" size={2} /> : game.botChat.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}