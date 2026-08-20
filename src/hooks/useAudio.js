import { useEffect } from 'react';
import { MusicEngine } from '../engine/audio.js';
import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export function useMusicSync() {
  const { view } = useGame();
  const { goodLife, prefs } = useSettings();

  useEffect(() => {
    if (view.screen === 'gameplay') {
      MusicEngine.request('gameplay');
      goodLife.request('gameplay');
    } else if (view.screen === 'lobby' || view.screen === 'room') {
      MusicEngine.request('lobby');
      goodLife.request('lobby');
    } else {
      MusicEngine.stop();
      goodLife.stop();
    }
  }, [view.screen, goodLife, prefs.musicEnabled]);
}