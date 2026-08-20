import { useEffect } from 'react';
import { useGame } from './context/GameContext.jsx';
import { useMusicSync } from './hooks/useAudio.js';
import AuthScreen from './components/AuthScreen.jsx';
import Lobby from './components/Lobby.jsx';
import WaitingRoom from './components/WaitingRoom.jsx';
import GameRoom from './components/GameRoom.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Toast from './components/Toast.jsx';
import DisconnectBanner from './components/DisconnectBanner.jsx';

export default function App() {
  const { view } = useGame();
  useMusicSync();

  useEffect(() => {
    const unlock = () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        if (ctx.state === 'suspended') ctx.resume();
        ctx.close && ctx.close();
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <>
      <DisconnectBanner />
      {view.screen === 'auth' && <AuthScreen />}
      {view.screen === 'lobby' && <Lobby />}
      {view.screen === 'room' && <WaitingRoom />}
      {view.screen === 'gameplay' && <GameRoom />}
      <SettingsModal />
      <Toast />
    </>
  );
}