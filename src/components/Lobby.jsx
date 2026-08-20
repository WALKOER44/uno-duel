import { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function Lobby() {
  const { view, serverStatus, startSolo, createRoom, joinRoom, refreshRooms, logoutUser } = useGame();
  const { openSettings } = useSettings();
  const [botCount, setBotCount] = useState(3);
  const [capacity, setCapacity] = useState(4);
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const statusDot =
    serverStatus === 'online' ? 'status-online' : serverStatus === 'degraded' ? 'status-connecting' : 'status-offline';
  const statusLabel =
    serverStatus === 'online' ? 'Terhubung' : serverStatus === 'degraded' ? 'DB terputus (leaderboard nonaktif)' : 'Server offline';

  async function handleJoin() {
    if (!roomCode.trim() || joining) return;
    setJoining(true);
    await joinRoom(roomCode.trim());
    setTimeout(() => setJoining(false), 1500);
  }

  async function handleRefresh() {
    setSpinning(true);
    await refreshRooms();
    setTimeout(() => setSpinning(false), 600);
  }

  return (
    <div className="screen screen-active bg-play">
      <div className="dash-header">
        <div className="dash-user">
          <img src="./logo.svg" alt="UNO DUEL" className="dash-logo" />
          <span className="dash-avatar">{view.auth.avatar}</span>
          <div className="dash-user-meta">
            <span className="dash-name">{view.auth.username}</span>
            <span className="dash-stats">{view.profile ? `${view.profile.wins} menang` : 'Pemain baru'}</span>
          </div>
          <span className="dash-online">
            <span className={`status-dot ${statusDot}`}></span> {statusLabel}
          </span>
        </div>
        <nav className="dash-nav">
          <button type="button" className="dash-nav-btn" onClick={openSettings}>
            Atur
          </button>
          <button type="button" className="dash-nav-btn dash-logout" onClick={logoutUser}>
            Keluar
          </button>
        </nav>
      </div>

      <div className="dash-grid">
        <main className="dash-main">
          <div className="panel mode-panel">
            <h2 className="mode-title">🎮 Pilih Mode Bermain</h2>

            <button type="button" className="lobby-btn btn-white btn-big" onClick={() => startSolo(botCount)}>
              🎮 LATIHAN SOLO
            </button>
            <div className="solo-bot-row">
              <span className="field-label">Jumlah Bot</span>
              <select className="select-input" value={botCount} onChange={(e) => setBotCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} bot
                  </option>
                ))}
              </select>
            </div>

            <div className="divider">
              <span>atau</span>
            </div>

            <div className="mode-subtitle">🌍 Multiplayer</div>
            <button type="button" className="lobby-btn btn-purple btn-big" onClick={() => createRoom(true, capacity)}>
              🌍 BUAT ROOM PUBLIK
            </button>
            <button type="button" className="lobby-btn btn-black btn-big" onClick={() => createRoom(false, capacity)}>
              🔒 BUAT ROOM PRIVAT
            </button>

            <div className="panel join-box">
              <div className="field-label">Kode Room Privat</div>
              <div className="join-row">
                <input
                  className="text-input code-input"
                  type="text"
                  maxLength={6}
                  placeholder="KODE 6 HURUF"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
                <button type="button" className="lobby-btn btn-black btn-small" onClick={handleJoin} disabled={joining}>
                  GABUNG
                </button>
              </div>
              <div className="capacity-row">
                <span className="field-label">Kapasitas Room (2-8)</span>
                <select className="select-input" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} pemain
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="connection-status">
            <span className={`status-dot ${statusDot}`}></span>
            <span className="status-label">Status Server:</span>
            <span>{statusLabel}</span>
          </div>
        </main>

        <aside className="dash-side">
          <div className="side-widget">
            <div className="widget-title">🌍 Room Publik</div>
            <div className="list-head">
              <span className="list-title">Sedang dibuka</span>
              <button type="button" className={`refresh-btn ${spinning ? 'spinning' : ''}`} title="Segarkan daftar room" onClick={handleRefresh}>
                ⟳
              </button>
            </div>
            <ul className="public-room-list">
              {view.publicRooms.length === 0 && <li className="list-empty">Belum ada room...</li>}
              {view.publicRooms.map((room) => (
                <li key={room.code} className="room-row">
                  <span className="room-code">#{room.code}</span>
                  <span className="room-count">
                    {room.players ? room.players.length : 0}/{room.capacity || 8}
                  </span>
                  <button type="button" className="btn btn-purple btn-small" onClick={() => joinRoom(room.code)}>
                    Gabung
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="side-widget">
            <div className="widget-title">🟢 Pemain Online</div>
            <ul className="side-list">
              {view.onlineUsers.length === 0 && <li className="list-empty">Belum ada pemain...</li>}
              {view.onlineUsers.map((u, i) => (
                <li key={i} className="side-row">
                  <span>{u.avatar}</span>
                  <span className="side-name">{u.name}</span>
                  <span className="side-room">#{u.roomCode}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="side-widget">
            <div className="widget-title">🏆 Papan Peringkat</div>
            <ul className="side-list">
              {(view.leaderboard || []).length === 0 && <li className="list-empty">Belum ada data...</li>}
              {(view.leaderboard || []).map((row, i) => (
                <li key={row.name} className="room-row">
                  <span className="lb-rank">{i + 1}</span>
                  <span>{row.avatar}</span>
                  <span className="lb-name">{row.name}</span>
                  <span className="lb-wins">{row.wins} menang</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}