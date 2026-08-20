import { BOT_PERSONAS, BOT_LINES, COLORS } from './constants.js';
import { isValidMove } from './rules.js';

export function pickBotPersona(players) {
  const used = new Set(players.map((p) => p && p.name));
  const fresh = BOT_PERSONAS.filter((b) => !used.has(b.name));
  const pool = fresh.length ? fresh : BOT_PERSONAS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomLine(category) {
  const arr = BOT_LINES[category] || BOT_LINES.play;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function botPickMove(bot, top, currentColor) {
  const playable = (bot.hand || []).filter((c) => isValidMove(c, top, currentColor));
  if (!playable.length) return null;

  if (Math.random() < 0.35) {
    const action = playable.find((c) => c.value === 'draw2' || c.value === 'wild4' || c.value === 'skip');
    if (action) return action;
  }

  const colors = { red: 0, yellow: 0, green: 0, blue: 0 };
  (bot.hand || []).forEach((c) => {
    if (c.color && colors[c.color] !== undefined) colors[c.color] += 1;
  });
  let best = 'red';
  let max = -1;
  for (const c of COLORS) {
    if (colors[c] > max) {
      max = colors[c];
      best = c;
    }
  }
  const preferred = playable.filter((c) => (c.color || c.displayColor) === best);
  return preferred.length
    ? preferred[Math.floor(Math.random() * preferred.length)]
    : playable[Math.floor(Math.random() * playable.length)];
}

export function botChooseColor(bot) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  (bot.hand || []).forEach((c) => {
    if (c.color && counts[c.color] !== undefined) counts[c.color] += 1;
  });
  let best = 'red';
  let max = -1;
  for (const c of COLORS) {
    if (counts[c] > max) {
      max = counts[c];
      best = c;
    }
  }
  return best;
}