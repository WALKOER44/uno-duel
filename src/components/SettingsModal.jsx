import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function SettingsModal() {
  const { leaveGame } = useGame();
  const { prefs, setPref, settingsOpen, closeSettings } = useSettings();
  if (!settingsOpen) return null;

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-head">
          <h3>Pengaturan</h3>
          <button type="button" className="close-btn" onClick={closeSettings}>
            ✕
          </button>
        </div>
        <div className="setting-row">
          <span>🔊 Suara Efek</span>
          <button type="button" className={`toggle-btn ${prefs.soundEnabled ? 'on' : ''}`} onClick={() => setPref('soundEnabled', !prefs.soundEnabled)}>
            {prefs.soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="setting-row">
          <span>🎤 Lagu "Good Life" (BGM)</span>
          <button type="button" className={`toggle-btn ${prefs.goodLifeEnabled ? 'on' : ''}`} onClick={() => setPref('goodLifeEnabled', !prefs.goodLifeEnabled)}>
            {prefs.goodLifeEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="setting-row">
          <span>🔉 Volume Good Life</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={prefs.goodLifeVolume}
            onChange={(e) => setPref('goodLifeVolume', Number(e.target.value))}
            className="volume-slider"
          />
          <span className="volume-val">{Math.round(prefs.goodLifeVolume * 100)}%</span>
        </div>
        <div className="setting-row">
          <span>💬 Chat</span>
          <button type="button" className={`toggle-btn ${prefs.chatVisible ? 'on' : ''}`} onClick={() => setPref('chatVisible', !prefs.chatVisible)}>
            {prefs.chatVisible ? 'ON' : 'OFF'}
          </button>
        </div>
        <button type="button" className="lobby-btn btn-black" onClick={leaveGame}>
          🚪 Keluar Match
        </button>
        <p className="settings-note">
          🎧 BGM "Good Life" butuh file <code>public/audio/good-life.mp3</code> (rekaman/MP3 legal milikmu).
          Cara mengganti lagu dijelaskan di README.
        </p>
      </div>
    </div>
  );
}