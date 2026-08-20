import { useMemo, useRef, useEffect } from 'react';
import Card from './Card.jsx';
import { useGame } from '../context/GameContext.jsx';
import { isValidMove, canStartPair } from '../engine/rules.js';
import { useAudioActions } from '../context/SettingsContext.jsx';

export default function PlayerDock() {
  const { view, playMyCard, playMyPair, drawAction, passAction, unoAction, selectPairCard } = useGame();
  const { sfx } = useAudioActions();
  const g = view.game;
  const handRef = useRef(null);

  const top = g.discardTop;

  const playable = useMemo(() => {
    if (!g.isMyTurn || g.winner || g.pendingWild) return new Set();
    const set = new Set();
    g.myHand.forEach((c) => {
      if (isValidMove(c, top, g.currentColor)) set.add(c.id);
    });
    return set;
  }, [g.myHand, top, g.currentColor, g.isMyTurn, g.winner, g.pendingWild]);

  useEffect(() => {
    if (handRef.current) handRef.current.scrollLeft = handRef.current.scrollWidth;
  }, [g.myHand.length]);

  function onCardClick(card) {
    if (!g.isMyTurn || g.winner || g.pendingWild) return;

    if (card.value === 'wild' || card.value === 'wild4') {
      sfx('click');
      playMyCard(card.id, null);
      return;
    }

    if (g.pairSelect) {
      const a = g.myHand.find((c) => c.id === g.pairSelect);
      if (a && card.value === a.value && card.id !== a.id) {
        sfx('play');
        playMyPair(a.id, card.id);
        return;
      }
      selectPairCard(null);
      return;
    }

    if (canStartPair(card, top, g.myHand)) {
      sfx('click');
      selectPairCard(card.id);
      return;
    }

    if (!playable.has(card.id)) {
      sfx('click');
      return;
    }
    sfx('play');
    playMyCard(card.id, null);
  }

  const canPairStart = useMemo(() => {
    if (!g.isMyTurn || g.winner) return false;
    return g.myHand.some((c) => canStartPair(c, top, g.myHand));
  }, [g.myHand, top, g.isMyTurn, g.winner]);

  return (
    <div className={`player-dock ${g.isMyTurn ? 'dock-active' : ''}`}>
      <div className="player-dock-header">
        <span>
          Kartumu: {g.myHand.length}
          {g.hasUno && ' — UNO! 🔔'}
        </span>
        <span className="pair-hint" style={{ display: canPairStart || g.pairSelect ? '' : 'none' }}>
          {g.pairSelect ? 'Pilih kartu angka sama untuk dobel 🔗' : 'Klik 2 kartu angka sama untuk dobel'}
        </span>
      </div>
      <div className="my-hand" ref={handRef}>
        {g.myHand.map((card) => (
          <Card
            key={card.id}
            card={card}
            playable={playable.has(card.id) && !g.pairSelect}
            selected={g.pairSelect === card.id}
            onClick={() => onCardClick(card)}
          />
        ))}
      </div>
      <div className="dock-actions">
        <button
          type="button"
          className="pass-button"
          onClick={() => {
            sfx('draw');
            drawAction();
          }}
          disabled={!g.isMyTurn || g.winner}
        >
          Pass (ambil kartu)
        </button>
        <button
          type="button"
          className={`uno-button ${g.myHand.length === 1 ? '' : 'hidden'}`}
          onClick={() => unoAction()}
        >
          UNO!
        </button>
      </div>
    </div>
  );
}