import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';

let uid = 0;
function nextId() {
  uid += 1;
  return uid;
}

function rectOf(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function makeFly(deck, hand, delay = 0, dur = 0.55) {
  const sx = deck.left + deck.width / 2;
  const sy = deck.top + deck.height / 2;
  const ex = hand.left + hand.width;
  const ey = hand.top + hand.height * 0.55;
  return { id: nextId(), sx, sy, ex, ey, delay, dur };
}

const DEAL_COUNT = 7;

export default function FlyingCard() {
  const { view } = useGame();
  const g = view.game;
  const [flies, setFlies] = useState([]);
  const prevCountRef = useRef(g.myHand.length);
  const dealtRef = useRef(false);

  const remove = (id) => {
    setFlies((list) => list.filter((f) => f.id !== id));
  };

  useEffect(() => {
    if (g.started && !dealtRef.current && g.myHand.length > 0) {
      dealtRef.current = true;
      const t = setTimeout(() => {
        const deck = rectOf('.deck-card.deck-back');
        const hand = rectOf('.my-hand');
        if (!deck || !hand) return;
        const list = [];
        for (let i = 0; i < Math.min(g.myHand.length, DEAL_COUNT); i += 1) {
          const fly = makeFly(deck, hand, i * 0.09, 0.5);
          list.push(fly);
          setTimeout(() => remove(fly.id), 900 + i * 90);
        }
        setFlies(list);
      }, 120);
      return () => clearTimeout(t);
    }
  }, [g.started, g.myHand.length]);

  useEffect(() => {
    const cur = g.myHand.length;
    if (dealtRef.current && cur > prevCountRef.current) {
      const t = setTimeout(() => {
        const deck = rectOf('.deck-card.deck-back');
        const hand = rectOf('.my-hand');
        if (!deck || !hand) return;
        const fly = makeFly(deck, hand, 0, 0.5);
        setFlies((list) => [...list, fly]);
        setTimeout(() => remove(fly.id), 900);
      }, 60);
      return () => clearTimeout(t);
    }
    prevCountRef.current = cur;
  }, [g.myHand.length]);

  return (
    <div className="fx-arena">
      {flies.map((f) => (
        <div
          key={f.id}
          className="fly-card dealing deck-back"
          style={{
            '--sx': `${f.sx}px`,
            '--sy': `${f.sy}px`,
            '--ex': `${f.ex}px`,
            '--ey': `${f.ey}px`,
            '--delay': `${f.delay}s`,
            '--dur': `${f.dur}s`
          }}
        >
          <span className="card-center">🂠</span>
        </div>
      ))}
    </div>
  );
}