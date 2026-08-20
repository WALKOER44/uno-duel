import { useGame } from '../context/GameContext.jsx';

const COLORS = [
  { id: 'red', c: '#ff4d4d' },
  { id: 'yellow', c: '#ffd400' },
  { id: 'green', c: '#22c55e' },
  { id: 'blue', c: '#2563eb' }
];

export default function ColorPicker() {
  const { view, chooseWildColor } = useGame();
  if (!view.game.pendingWild) return null;
  return (
    <div className="modal">
      <div className="modal-card">
        <h3>Pilih Warna</h3>
        <div className="color-buttons">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="color-button"
              style={{ '--c': c.c }}
              onClick={() => chooseWildColor(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}