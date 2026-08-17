import { describe, expect, it } from 'vitest';
import { evaluateHand, determineWinner, compareHands } from './poker.js';

describe('poker evaluation', () => {
  it('recognizes a royal flush and gives it the highest score', () => {
    const royalFlush = [
      { rank: 14, suit: '♠' },
      { rank: 13, suit: '♠' },
      { rank: 12, suit: '♠' },
      { rank: 11, suit: '♠' },
      { rank: 10, suit: '♠' },
      { rank: 9, suit: '♥' },
      { rank: 2, suit: '♣' }
    ];

    const result = evaluateHand(royalFlush);
    expect(result.label).toBe('Royal Flush');
    expect(result.score).toBe(9);
  });

  it('ranks a better hand over a weaker one', () => {
    const betterHand = [
      { rank: 14, suit: '♠' },
      { rank: 14, suit: '♥' },
      { rank: 9, suit: '♣' },
      { rank: 9, suit: '♦' },
      { rank: 8, suit: '♠' },
      { rank: 7, suit: '♥' },
      { rank: 2, suit: '♦' }
    ];

    const weakerHand = [
      { rank: 13, suit: '♠' },
      { rank: 12, suit: '♦' },
      { rank: 11, suit: '♣' },
      { rank: 10, suit: '♥' },
      { rank: 9, suit: '♦' },
      { rank: 8, suit: '♣' },
      { rank: 7, suit: '♠' }
    ];

    expect(compareHands(evaluateHand(betterHand), evaluateHand(weakerHand))).toBe(1);
  });

  it('resolves the winner correctly for a showdown', () => {
    const playerA = { name: 'Kamu', holeCards: [{ rank: 10, suit: '♠' }, { rank: 10, suit: '♥' }] };
    const playerB = { name: 'Bot', holeCards: [{ rank: 9, suit: '♠' }, { rank: 9, suit: '♥' }] };
    const community = [
      { rank: 5, suit: '♣' },
      { rank: 7, suit: '♦' },
      { rank: 8, suit: '♠' },
      { rank: 2, suit: '♥' },
      { rank: 4, suit: '♣' }
    ];

    const outcome = determineWinner(playerA, playerB, community);
    expect(outcome.winner).toBe('Kamu');
  });
});
