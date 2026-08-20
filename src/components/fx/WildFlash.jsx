import { useGame } from '../../context/GameContext.jsx';
import { COLOR_HEX } from '../../engine/constants.js';

export default function WildFlash({ color }) {
  const { view } = useGame();
  const g = view.game;
  const activeColor = color || g.currentColor;
  if (!activeColor) return null;
  return <div className="wild-flash" style={{ '--wc': COLOR_HEX[activeColor] || '#fff' }} />;
}