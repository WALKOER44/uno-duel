import { useGame } from '../context/GameContext.jsx';

export default function WaitingRoom() {
  const { view, startOnlineGame, leaveGame } = useGame();
  const { room } = view;
  const canStart = room.isHost && room.players.length >= 2;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
    } catch (e) {}
  }

  return (
    <div className="screen screen-active">
      <div className="room-box">
        <h2 className="room-title">Ruang Tunggu</h2>
        <div className="room-code-row">
          <span>Kode Room:</span>
          <strong>{room.code}</strong>
          <button type="button" className="copy-btn" title="Salin kode" onClick={copyCode}>
            📋
          </button>
        </div>
        <p className="waiting-capacity">
          Kapasitas: {room.players.length} / {room.capacity}
        </p>
        <ul className="waiting-players-list">
          {room.players.map((p) => (
            <li key={p.id} className={p.isHost ? 'waiting-host' : ''}>
              <span className="waiting-avatar">{p.avatar}</span>
              <span className="waiting-name">
                {p.name}
                {p.isHost && ' 👑'}
                {p.isBot && ' 🤖'}
              </span>
              {p.isMe && <span className="waiting-me">(kamu)</span>}
            </li>
          ))}
        </ul>
        <p className="waiting-status">{room.isHost ? 'Bagikan kode room ke temanmu!' : 'Menunggu host memulai...'}</p>
        {room.isHost && (
          <button type="button" className="lobby-btn btn-yellow" onClick={startOnlineGame} disabled={!canStart}>
            Mulai Game{!canStart ? ' (butuh 2 pemain)' : ''}
          </button>
        )}
        <button type="button" className="lobby-btn btn-black" onClick={leaveGame}>
          Keluar Ruangan
        </button>
      </div>
    </div>
  );
}