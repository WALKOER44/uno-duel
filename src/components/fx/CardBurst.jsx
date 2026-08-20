import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';

const SPECIALS = [
  { re: / main ⏭/, kind: 'skip', color: '#ef4444', label: '⏭' },
  { re: / main ⟲/, kind: 'reverse', color: '#2563eb', label: '⟲' },
  { re: / main \+4/, kind: 'wild4', color: '#7c3aed', label: '+4' },
  { re: / main \+2/, kind: 'draw2', color: '#ff7a00', label: '+2' },
  { re: / main W(\s|$)/, kind: 'wild', color: '#ffd400', label: 'WILD' }
];

const PARTICLE_COUNT = 16;

let uid = 0;
function nextId() {
  uid += 1;
  return uid;
}

export default function CardBurst() {
  const { view } = useGame();
  const g = view.game;
  const lastLog = g.log.length ? g.log[g.log.length - 1] : '';
  const prevLogRef = useRef('');
  const [burst, setBurst] = useState(null);

  useEffect(() => {
    if (lastLog === prevLogRef.current) return;
    prevLogRef.current = lastLog;
    const spec = SPECIALS.find((s) => s.re.test(lastLog));
    if (!spec) return;

    const el = document.querySelector('.deck-display');
    const cx = el ? el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 : window.innerWidth / 2;
    const cy = el ? el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 : window.innerHeight / 2;

    const particles = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 70 + Math.random() * 80;
      return {
        id: nextId(),
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        rot: Math.round(-240 + Math.random() * 480),
        delay: Math.random() * 0.12,
        dur: 0.7 + Math.random() * 0.25,
        size: 8 + Math.random() * 6
      };
    });

    setBurst({ id: nextId(), kind: spec.kind, color: spec.color, label: spec.label, cx, cy, particles });
    const t = setTimeout(() => setBurst(null), 1250);
    return () => clearTimeout(t);
  }, [lastLog]);

  if (!burst) return null;

  return (
    <div className="fx-burst" style={{ left: burst.cx, top: burst.cy }}>
      <div className="fx-glow" style={{ '--gc': burst.color }} />
      <div className="fx-label" style={{ '--lc': burst.color }}>
        {burst.label}
      </div>
      {burst.particles.map((p) => (
        <span
          key={p.id}
          className={`fx-particle p-${burst.kind}`}
          style={{
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            '--rot': `${p.rot}deg`,
            '--delay': `${p.delay}s`,
            '--dur': `${p.dur}s`,
            '--psize': `${p.size}px`,
            background: burst.color
          }}
        />
      ))}
    </div>
  );
}