import { useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export function useMusicSync() {
  const { view } = useGame();
  const { goodLife } = useSettings();

  useEffect(() => {
    if (view.screen === 'gameplay') {
      goodLife.request('gameplay');
    } else if (view.screen === 'lobby' || view.screen === 'room') {
      goodLife.request('lobby');
    } else {
      goodLife.stop();
    }
  }, [view.screen, goodLife]);
}