import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Table from './Table.jsx';
import Seats from './Seats.jsx';
import PlayerDock from './PlayerDock.jsx';
import ColorPicker from './ColorPicker.jsx';
import ChatBox from './ChatBox.jsx';
import WinnerOverlay from './WinnerOverlay.jsx';
import EmotionLayer from './fx/EmotionLayer.jsx';
import WildFlash from './fx/WildFlash.jsx';

export default function GameRoom() {
  const { view, newRound } = useGame();
  const { openSettings, sfx, prefs } = useSettings();
  const g = view.game;
  const prevLogRef = useRef('');
  const [mood, setMood] = useState('idle');
  const [flashColor, setFlashColor] = useState(null);
  const flashTimerRef = useRef(null);

  const lastLog = g.log.length ? g.log[g.log.length - 1] : '';

  useEffect(() => {
    if (lastLog !== prevLogRef.current) {
      prevLogRef.current = lastLog;
      const me = view.room.players[g.myIndex]?.name || '';
      if (lastLog.includes('+2') && lastLog.includes(me)) {
        setMood('hit');
        sfx('draw');
      } else if (lastLog.includes('+4') && lastLog.includes(me)) {
        setMood('hit');
        sfx('action');
      } else if (lastLog.includes('Skip!') && lastLog.includes(me)) {
        setMood('freeze');
        sfx('skip');
      } else if (lastLog.includes('Reverse!') && lastLog.includes(me)) {
        setMood('spin');
        sfx('reverse');
      } else if (lastLog.includes('MENANG!') && lastLog.includes(me)) {
        setMood('win');
        sfx('win');
      } else if (lastLog.includes('MENANG!')) {
        setMood('lose');
      } else if (lastLog.includes('ambat +2') || lastLog.includes('ambil +2') || lastLog.includes('ambil +4')) {
        sfx('action');
      }
    }
  }, [lastLog, g.myIndex, view.room.players, sfx]);

  useEffect(() => {
    if (mood !== 'idle') {
      const t = setTimeout(() => setMood('idle'), 1600);
      return () => clearTimeout(t);
    }
  }, [mood]);

  useEffect(() => {
    return () => clearTimeout(flashTimerRef.current);
  }, []);

  const turnColor = useMemo(
    () => (g.currentColor ? g.currentColor : null),
    [g.currentColor]
  );

  return (
    <div className="screen screen-active">
      <header className="topbar">
        <span className="room-info">
          Room: {view.room.code} {view.room.isOnline ? '• Online' : '• Solo'}
        </span>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" title="Mulai Ronde Baru" onClick={() => { sfx('click'); newRound(); }}>
            🔄
          </button>
          <button type="button" className="icon-btn" title="Pengaturan" onClick={openSettings}>
            ⚙️
          </button>
        </div>
      </header>

      <div className="arena">
        <Seats />
        <Table />
      </div>

      <PlayerDock />

      <div className="status-float">
        <div className={`status-pill ${g.winner ? 'winner' : ''}`}>
          {g.winner ? `${g.winner.name} menang! 🏆` : g.isMyTurn ? 'Giliranmu!' : 'Menunggu giliran...'}
        </div>
        {turnColor && <div className="status-event event-pop">Warna aktif: {turnColor}</div>}
      </div>

      <ColorPicker />
      <WinnerOverlay />
      {prefs.chatVisible && <ChatBox />}
      <EmotionLayer mood={mood} />
      <WildFlash color={flashColor} />
    </div>
  );
}