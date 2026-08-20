import { useGame } from '../context/GameContext.jsx';

export default function Toast() {
  const { view } = useGame();
  if (!view.ui.toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {view.ui.toast.message}
    </div>
  );
}