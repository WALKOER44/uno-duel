import { topCard } from './game.js';

export const MSG = {
  JOIN_ROOM: 'JOIN_ROOM',
  SYNC_REQ: 'SYNC_REQ',
  ACTION: 'ACTION',
  CHAT: 'CHAT',
  ROOM_UPDATE: 'ROOM_UPDATE',
  SYNC_STATE: 'SYNC_STATE',
  PENDING_WILD: 'PENDING_WILD',
  TOAST: 'TOAST',
  LOBBY_REGISTER: 'LOBBY_REGISTER',
  LOBBY_UNREGISTER: 'LOBBY_UNREGISTER',
  LOBBY_LIST_REQ: 'LOBBY_LIST_REQ',
  LOBBY_LIST: 'LOBBY_LIST'
};

export function makeStatePayload(G, type, recipientIdx) {
  const me = G.players[recipientIdx];
  const players = G.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isMe: !!me && p.id === me.id,
    isHost: !!p.isHost,
    isBot: !!p.isBot,
    hasUno: !!p.hasUno,
    handCount: (p.hand || []).length
  }));
  return {
    type,
    roomCode: G.roomCode,
    started: !!G.gameStarted,
    capacity: G.roomCapacity,
    isPublic: G.isPublic,
    players,
    botChat: G.botChat ? { index: G.botChat.index, text: G.botChat.text, ts: G.botChat.ts } : null,
    gameState: {
      playerIndex: recipientIdx,
      currentPlayer: G.currentPlayer,
      direction: G.direction,
      currentColor: G.currentColor,
      discardTop: topCard(G),
      deckCount: G.deck.length,
      winner: G.winner ? { name: G.winner.name } : null,
      chatHistory: G.chatHistory,
      pendingWild: G.pendingWild,
      myHand: (G.players[recipientIdx] || {}).hand || []
    }
  };
}