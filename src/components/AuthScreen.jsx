import { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const AVATARS = ['👦', '👱‍♂️', '👩', '🥷', '👧', '🧑‍🚀'];

export default function AuthScreen() {
  const { view, login, register, loginGuest } = useGame();
  const { openSettings } = useSettings();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('👦');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    if (mode === 'login') await login(username.trim(), password);
    else await register(username.trim(), password, avatar);
    setBusy(false);
  }

  return (
    <div className="screen screen-active bg-play">
      <div className="auth-split">
        <section className="auth-hero">
          <img src="./logo.svg" alt="UNO DUEL" className="auth-logo" />
          <p className="auth-desc">
            Adu cepat, adu strategi dalam duel kartu UNO. Kumpulkan kemenangan, raih puncak papan peringkat, dan
            taklukkan lawan dari seluruh dunia!
          </p>
          <div className="side-widget auth-lb">
            <div className="widget-title">🏆 Papan Peringkat — Top 5</div>
            <ul className="side-list">
              {view.leaderboard.length === 0 && <li className="list-empty">Belum ada data...</li>}
              {view.leaderboard.slice(0, 5).map((row, i) => (
                <li key={row.name} className="room-row">
                  <span className="lb-rank">{i + 1}</span>
                  <span>{row.avatar}</span>
                  <span className="lb-name">{row.name}</span>
                  <span className="lb-wins">{row.wins} menang</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-card-wrap">
          <div className="auth-card">
            <div className="auth-tabs">
              <button type="button" className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
                Masuk
              </button>
              <button type="button" className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
                Buat Akun
              </button>
            </div>

            <div className="field-label">Username</div>
            <input
              className="text-input"
              type="text"
              maxLength={16}
              placeholder="Username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />

            <div className="field-label">Password</div>
            <input
              className="text-input"
              type="password"
              placeholder="Password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />

            {mode === 'register' && (
              <>
                <div className="field-label">Pilih Avatar</div>
                <div className="avatar-row">
                  {AVATARS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`avatar-btn ${avatar === a ? 'active' : ''}`}
                      onClick={() => setAvatar(a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button type="button" className="btn btn-purple btn-block" onClick={submit} disabled={busy}>
              🚀 {mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>

            <div className="auth-or">
              <span>ATAU</span>
            </div>

            <button type="button" className="btn btn-white btn-block" onClick={loginGuest}>
              👻 Main sebagai Guest
            </button>

            <button type="button" className="btn btn-black btn-block" onClick={openSettings}>
              ⚙️ Pengaturan
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}