import { useEffect, useRef } from 'react';
import PixelSprite from './PixelSprite.jsx';
import { PIXEL_CHARACTER } from '../engine/pixels.js';

export default function PixelCharacter({ mood = 'idle' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = el.dataset.mood;
    if (prev) el.classList.remove(`char-${prev}`);
    el.classList.add(`char-${mood}`);
    el.dataset.mood = mood;
  }, [mood]);

  return (
    <div className={`pixel-character char-${mood}`} ref={ref}>
      <PixelSprite sprite={{ rows: PIXEL_CHARACTER.rows, width: PIXEL_CHARACTER.width }} size={4} />
    </div>
  );
}