import { useGame } from '../context/GameContext.jsx';

export default function DisconnectBanner() {
  const { view } = useGame();
  if (!view.room.isOnline || view.room.connected) return null;
  return <div className="disconnect-banner">Menghubungkan kembali...</div>;
}