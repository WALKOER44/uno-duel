import PixelCharacter from '../PixelCharacter.jsx';

const LABELS = {
  idle: null,
  hit: '💢 Kena serangan!',
  freeze: '🧊 Diblokir!',
  spin: '🔄 Terbalik!',
  win: '🎉 Kamu Menang!',
  lose: '😢 Kalah...'
};

export default function EmotionLayer({ mood }) {
  return (
    <div className="emotion-layer">
      {LABELS[mood] && (
        <div className={`pixel-mood mood-${mood}`}>
          <PixelCharacter mood={mood} />
          <div className="pixel-mood-label">{LABELS[mood]}</div>
        </div>
      )}
    </div>
  );
}