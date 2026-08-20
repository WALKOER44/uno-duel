import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GoodLifePlayer, playSound, playEmoteSound } from '../engine/audio.js';

const PREF_KEY = 'unoduel_prefs_v2';

const DEFAULTS = {
  soundEnabled: true,
  musicEnabled: true,
  chatVisible: true,
  goodLifeEnabled: true,
  goodLifeVolume: 0.7
};

const SettingsContext = createContext(null);

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULTS };
}

export function SettingsProvider({ children }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const goodLifeRef = useRef(new GoodLifePlayer());

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (e) {}
  }, [prefs]);

  useEffect(() => {
    const gl = goodLifeRef.current;
    gl.setEnabled(prefs.goodLifeEnabled);
    gl.setVolume(prefs.goodLifeVolume);
  }, [prefs.goodLifeEnabled, prefs.goodLifeVolume]);

  const setPref = useCallback((key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({ prefs, setPref, settingsOpen, openSettings, closeSettings, goodLife: goodLifeRef.current }),
    [prefs, setPref, settingsOpen, openSettings, closeSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings harus dipakai di dalam <SettingsProvider>');
  return ctx;
}

export function useAudioActions() {
  const { prefs } = useSettings();
  return useMemo(
    () => ({
      sfx: (name) => {
        if (prefs.soundEnabled) playSound(name);
      },
      emote: (name) => {
        if (prefs.soundEnabled) playEmoteSound(name);
      }
    }),
    [prefs.soundEnabled]
  );
}