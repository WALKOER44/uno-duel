export default function PixelSprite({ sprite, size = 4, className = '', style }) {
  if (!sprite || !sprite.rows) return null;
  const { rows, width } = sprite;
  const height = rows.length;
  return (
    <div
      className={`pixel-sprite ${className}`}
      style={{
        width: width * size,
        height: height * size,
        ...style
      }}
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        row.map((color, x) => {
          if (color === 'transparent') return null;
          return (
            <span
              key={`${x}-${y}`}
              style={{
                position: 'absolute',
                left: x * size,
                top: y * size,
                width: size,
                height: size,
                backgroundColor: color,
                imageRendering: 'pixelated'
              }}
            />
          );
        })
      )}
    </div>
  );
}