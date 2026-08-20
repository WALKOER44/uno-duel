import PixelSprite from '../PixelSprite.jsx';
import { emotePalette } from '../../engine/pixels.js';

export default function PixelEmote({ name = 'joy', size = 3, className = '' }) {
  const sprite = emotePalette(name);
  return (
    <div className={`pixel-emote pixel-emote-${name} ${className}`}>
      <PixelSprite sprite={{ rows: sprite.rows, width: sprite.width }} size={size} />
    </div>
  );
}