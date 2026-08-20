import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { createGameState, startGame, playCard, playPair, drawAndPass, pass, botTurnNow, myIndex, isMyTurn, topCard } from '../engine/game.js';
import { makeStatePayload, MSG } from '../engine/protocol.js';
import { pickBotPersona, randomLine } from '../engine/bot.js';
import { usePeer, brokerForCode, brokerDown, resetBrokerCounters } from '../hooks/usePeer.js';
import { useSettings, useAudioActions } from './SettingsContext.jsx';
import { EMOTION_DEFS } from '../engine/constants.js';
import { emoteSoundOf } from '../engine/audio.js';

const AUTH_KEY = 'unoduel_auth';
const SESSION_KEY = 'unoduel_session';

const GameContext = createContext(null);

const initialView = {
  screen: 'auth',
  auth: { token: null, username: null, avatar: '👤', isGuest: false, serverOk: null, dbOk: null },
  profile: null,
  leaderboard: [],
  onlineUsers: [],
  publicRooms: [],
  room: {
    code: null,
    capacity: 8,
    isPublic: false,
    isHost: false,
    isOnline: false,
    connected: false,
    players: []
  },
  game: {
    started: false,
    deckCount: 0,
    discardTop: null,
    currentPlayer: 0,
    direction: 1,
    currentColor: null,
    winner: null,
    myHand: [],
    pendingWild: null,
    pairSelect: null,
    hasUno: false,
    log: [],
    botChat: null,
    isMyTurn: false,
    myIndex: 0
  },
  chat: {
    history: [],
    visible: true
  },
  ui: {
    toast: null,
    emotions: [],
    fx: []
  },
  serverStatus: 'connecting'
};

let uid = 0;
function nextId() {
  uid += 1;
  return uid;
}

export function GameProvider({ children }) {
  const { prefs, openSettings, goodLife } = useSettings();
  const { sfx } = useAudioActions();
  const { makePeer, destroyPeer, destroyAll } = usePeer();

  const [view, setView] = useState(initialView);
  const [serverStatus, setServerStatus] = useState('connecting');

  const GRef = useRef(createGameState());
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const connectionsRef = useRef([]);
  const lobbyRef = useRef(null);
  const lobbyConnsRef = useRef(new Set());
  const lobbyRoomsRef = useRef([]);
  const seenChatIdsRef = useRef(new Set());
  const timersRef = useRef({});
  const lastShownBotChatTsRef = useRef(0);
  const joiningRef = useRef(false);
  const rejoinAttemptsRef = useRef(0);
  const playQueueRef = useRef([]);

  const setToast = useCallback((message) => {
    setView((v) => ({ ...v, ui: { ...v.ui, toast: { id: nextId(), message } } }));
    clearTimeout(timersRef.current.toast);
    timersRef.current.toast = setTimeout(() => {
      setView((v) => (v.ui.toast ? { ...v, ui: { ...v.ui, toast: null } } : v));
    }, 2600);
  }, []);

  const addEmotion = useCallback((emotion) => {
    const id = nextId();
    setView((v) => ({ ...v, ui: { ...v.ui, emotions: [...v.ui.emotions, { ...emotion, id }] } }));
    setTimeout(() => {
      setView((v) => ({ ...v, ui: { ...v.ui, emotions: v.ui.emotions.filter((e) => e.id !== id) } }));
    }, 2100);
  }, []);

  const addFx = useCallback((fx) => {
    const id = nextId();
    setView((v) => ({ ...v, ui: { ...v.ui, fx: [...v.ui.fx, { ...fx, id }] } }));
    setTimeout(() => {
      setView((v) => ({ ...v, ui: { ...v.ui, fx: v.ui.fx.filter((f) => f.id !== id) } }));
    }, fx.ttl || 900);
  }, []);

  const showEmotion = useCallback(
    (playerIdx, name, opts = {}) => {
      const def = EMOTION_DEFS[name];
      if (!def) return;
      if (view.screen !== 'gameplay') return;
      addEmotion({ playerIdx, name, face: def.face, sound: def.sound, noSound: opts.sound === false });
    },
    [view.screen, addEmotion]
  );

  const botSpeak = useCallback((playerIdx, category) => {
    const G = GRef.current;
    const p = G.players[playerIdx];
    if (!p || !p.isBot) return;
    const text = category === '🤔' ? '🤔' : randomLine(category);
    G.botChat = { index: playerIdx, text, until: Date.now() + 3500, ts: Date.now() };
    setView((v) => ({ ...v, game: { ...v.game, botChat: G.botChat } }));
    clearTimeout(timersRef.current.botChat);
    timersRef.current.botChat = setTimeout(() => {
      G.botChat = null;
      setView((v) => ({ ...v, game: { ...v.game, botChat: null } }));
    }, 3600);
  }, []);

  const appendChat = useCallback(
    (msg) => {
      setView((v) => {
        const history = [...v.chat.history, msg].slice(-60);
        return { ...v, chat: { ...v.chat, history } };
      });
    },
    []
  );

  const recordWin = useCallback(
    async (name, avatar) => {
      const auth = view.auth;
      if (auth.isGuest || !auth.token) return;
      try {
        await api.score(name, avatar, auth.token);
        const res = await api.leaderboard();
        if (res.ok) setView((v) => ({ ...v, leaderboard: res.data }));
      } catch (e) {}
    },
    [view.auth]
  );

  /* ============ HOST: rebuild view + broadcast from authoritative G ============ */
  const buildRoomPlayers = useCallback((G) => {
    return G.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isMe: !!p.isMe || idx === myIndex(G),
      isHost: !!p.isHost,
      isBot: !!p.isBot,
      hasUno: !!p.hasUno,
      handCount: (p.hand || []).length
    }));
  }, []);

  const commitHost = useCallback(
    (G) => {
      const idx = myIndex(G);
      const myPlayer = G.players[idx];
      setView((v) => ({
        ...v,
        screen: G.gameStarted ? 'gameplay' : 'room',
        room: {
          ...v.room,
          code: G.roomCode,
          capacity: G.roomCapacity,
          isPublic: G.isPublic,
          isHost: G.isHost,
          isOnline: G.isOnline,
          connected: true,
          players: buildRoomPlayers(G)
        },
        game: {
          started: !!G.gameStarted,
          deckCount: G.deck.length,
          discardTop: topCard(G),
          currentPlayer: G.currentPlayer,
          direction: G.direction,
          currentColor: G.currentColor,
          winner: G.winner ? { name: G.winner.name } : null,
          myHand: (myPlayer || {}).hand || [],
          pendingWild: G.pendingWild,
          pairSelect: G.pairSelect,
          hasUno: !!(myPlayer || {}).hasUno,
          log: [...G.log],
          botChat: G.botChat,
          isMyTurn: isMyTurn(G),
          myIndex: idx
        }
      }));
    },
    [buildRoomPlayers]
  );

  const broadcastState = useCallback(
    (G) => {
      const type = G.gameStarted ? MSG.SYNC_STATE : MSG.ROOM_UPDATE;
      G.players.forEach((p, idx) => {
        if (p.isMe || idx === myIndex(G)) return;
        const payload = makeStatePayload(G, type, idx);
        if (p.conn && p.conn.open) {
          try {
            p.conn.send(payload);
          } catch (e) {}
        }
      });
    },
    []
  );

  /* ============ HOST: handle incoming data ============ */
  const handleHostData = useCallback(
    (conn, data) => {
      const G = GRef.current;
      if (!data || !data.type) return;

      switch (data.type) {
        case MSG.JOIN_ROOM: {
          const playerInfo = data.player || {};
          const resumeId = data.resumeId || null;
          let existing = G.players.find((p) => p.id === conn.peer);
          if (!existing && resumeId) existing = G.players.find((p) => p.id === resumeId);

          if (existing) {
            const wasBot = existing.isBot;
            existing.id = conn.peer;
            existing.conn = conn;
            existing.isBot = false;
            existing.name = playerInfo.name || existing.name;
            existing.avatar = playerInfo.avatar || existing.avatar;
            clearTimeout(existing.disconnectTimer);
            existing.disconnectTimer = null;
            if (wasBot) setToast(`${existing.name} kembali!`);
            if (G.gameStarted) {
              if (G.pendingWild !== null && existing === G.players[G.currentPlayer]) {
                try {
                  conn.send({ type: MSG.PENDING_WILD, cardIndex: G.pendingWild });
                } catch (e) {}
              }
              try {
                conn.send(makeStatePayload(G, MSG.SYNC_STATE, G.players.indexOf(existing)));
              } catch (e) {}
              return;
            }
            broadcastState(G);
            return;
          }

          if (G.gameStarted) {
            try {
              conn.send({ type: MSG.TOAST, message: 'Game sudah dimulai' });
            } catch (e) {}
            return;
          }
          if (G.players.length >= G.roomCapacity) {
            try {
              conn.send({ type: MSG.TOAST, message: 'Ruangan penuh' });
            } catch (e) {}
            return;
          }
          G.players.push({
            id: conn.peer,
            name: playerInfo.name || 'Pemain',
            avatar: playerInfo.avatar || '👤',
            isMe: false,
            isHost: false,
            isBot: false,
            conn,
            hand: [],
            hasUno: false
          });
          broadcastState(G);
          break;
        }

        case MSG.SYNC_REQ: {
          let idx = G.players.findIndex((p) => p.id === conn.peer);
          if (idx === -1) {
            G.players.push({
              id: conn.peer,
              name: (data.player && data.player.name) || 'Pemain',
              avatar: (data.player && data.player.avatar) || '👤',
              isMe: false,
              isHost: false,
              isBot: false,
              conn,
              hand: [],
              hasUno: false
            });
            idx = G.players.length - 1;
          }
          try {
            conn.send(makeStatePayload(G, G.gameStarted ? MSG.SYNC_STATE : MSG.ROOM_UPDATE, idx));
          } catch (e) {}
          break;
        }

case MSG.CHAT: {
          if (data.id && seenChatIdsRef.current.has(data.id)) break;
          if (data.id) seenChatIdsRef.current.add(data.id);
          const player = G.players.find((p) => p.id === conn.peer);
          const sender = player ? player.name : data.sender;
          const avatar = player ? player.avatar : data.avatar;
          const msg = { id: data.id, kind: data.kind || (data.emote ? 'emote' : 'msg'), sender, avatar, text: data.text, emote: data.emote };
          appendChat(msg);
          if (data.emote) sfx.emote(emoteSoundOf(data.emote));
          G.players.forEach((p) => {
            if (p.conn && p.conn.open && p.id !== conn.peer) {
              try {
                p.conn.send({ type: MSG.CHAT, ...msg });
              } catch (e) {}
            }
          });
          break;
        }

        case MSG.ACTION: {
          const idx = G.players.findIndex((p) => p.id === conn.peer);
          if (idx === -1) return;
          const { action, data: actionData } = data;
          runHostAction(G, idx, action, actionData);
          break;
        }

        default:
          break;
      }
    },
    [broadcastState, setToast, appendChat, sfx]
  );

  const runHostAction = useCallback(
    (G, idx, action, actionData) => {
      if (G.winner) return null;
      switch (action) {
        case 'PLAY_CARD': {
          const player = G.players[idx];
          const cardInHand = (player.hand || []).find((c) => c.id === actionData.cardId);
          const isWildCard = cardInHand && (cardInHand.value === 'wild' || cardInHand.value === 'wild4');
          if (isWildCard && !actionData.chosenColor) {
            G.pendingWild = actionData.cardId;
            broadcastState(G);
            const target = G.players[idx];
            if (target && target.conn && target.conn.open) {
              try {
                target.conn.send({ type: MSG.PENDING_WILD, cardIndex: actionData.cardId });
              } catch (e) {}
            }
            return { reason: 'wild' };
          }
          const res = playCard(G, idx, actionData.cardId, actionData.chosenColor);
          if (!res.ok) return res;
          G.pendingWild = null;
          G.pairSelect = null;
          if (res.winner) {
            const winnerName = G.winner.name;
            broadcastState(G);
            commitHost(G);
            setToast(`${winnerName} Menang!`);
            celebrateWinHost(G, res.effects.winnerIdx, winnerName);
            return;
          }
          afterHostChange(G);
          return res;
        }
        case 'SET_WILD_COLOR': {
          const cardId = G.pendingWild;
          if (!cardId) return null;
          const res = playCard(G, idx, cardId, actionData.color);
          G.pendingWild = null;
          G.pairSelect = null;
          if (res.winner) {
            const winnerName = G.winner.name;
            broadcastState(G);
            commitHost(G);
            setToast(`${winnerName} Menang!`);
            celebrateWinHost(G, res.effects.winnerIdx, winnerName);
            return res;
          }
          afterHostChange(G);
          return res;
        }
        case 'PLAY_PAIR': {
          const res = playPair(G, idx, actionData.idA, actionData.idB);
          if (!res.ok) return res;
          if (res.winner) {
            const winnerName = G.winner.name;
            broadcastState(G);
            commitHost(G);
            setToast(`${winnerName} Menang!`);
            celebrateWinHost(G, res.effects.winnerIdx, winnerName);
            return res;
          }
          afterHostChange(G);
          return res;
        }
        case 'DRAW': {
          const res = drawAndPass(G, idx);
          if (res.playable) {
            return runHostAction(G, idx, 'PLAY_CARD', { cardId: res.drawn.id });
          }
          broadcastState(G);
          commitHost(G);
          hostBotTurnLoop(G);
          return res;
        }
        case 'PASS': {
          pass(G, idx);
          broadcastState(G);
          commitHost(G);
          hostBotTurnLoop(G);
          return { ok: true };
        }
        case 'UNO': {
          G.players[idx].hasUno = true;
          broadcastState(G);
          commitHost(G);
          return { ok: true };
        }
        case 'NEW_ROUND': {
          startGame(G, { capacity: G.roomCapacity });
          broadcastState(G);
          commitHost(G);
          hostBotTurnLoop(G);
          return { ok: true };
        }
        default:
          return null;
      }
    },
    [broadcastState, commitHost, setToast]
  );

  const celebrateWinHost = useCallback(
    (G, winnerIdx, winnerName) => {
      showEmotion(winnerIdx, 'joy');
      G.players.forEach((p, i) => {
        if (p.isBot && i !== winnerIdx) showEmotion(i, 'cry', { sound: Math.random() < 0.5 });
        if (i === winnerIdx && p.isBot) botSpeak(i, 'win');
      });
      if (!G.players[winnerIdx] || !G.players[winnerIdx].isBot) {
        recordWin(winnerName, G.players[winnerIdx] && G.players[winnerIdx].avatar);
      }
    },
    [showEmotion, botSpeak, recordWin]
  );

  const afterHostChange = useCallback(
    (G) => {
      broadcastState(G);
      commitHost(G);
      if (!G.winner) hostBotTurnLoop(G);
    },
    [broadcastState, commitHost]
  );

  const hostBotTurnLoop = useCallback(
    (G) => {
      if (!G.isHost) return;
      if (G.winner) return;
      const cur = G.players[G.currentPlayer];
      if (!cur || !cur.isBot) return;
      clearTimeout(timersRef.current.bot);
      timersRef.current.bot = setTimeout(() => {
        if (G.winner) return;
        if (G.pendingWild !== null) {
          const color = botChooseColorFor(G, G.currentPlayer);
          const idx = G.currentPlayer;
          const cardId = G.pendingWild;
          const res = playCard(G, idx, cardId, color);
          G.pendingWild = null;
          G.pairSelect = null;
          if (res.winner) {
            const winnerName = G.winner.name;
            broadcastState(G);
            commitHost(G);
            setToast(`${winnerName} Menang!`);
            celebrateWinHost(G, res.effects.winnerIdx, winnerName);
            return;
          }
          afterHostChange(G);
          return;
        }
        const res = botTurnNow(G, G.currentPlayer);
        if (G.botChat && G.botChat.text === '🤔') G.botChat = null;
        if (res && res.winner) {
          const winnerName = G.winner.name;
          broadcastState(G);
          commitHost(G);
          setToast(`${winnerName} Menang!`);
          celebrateWinHost(G, G.currentPlayer, winnerName);
          return;
        }
        broadcastState(G);
        commitHost(G);
        hostBotTurnLoop(G);
      }, 750 + Math.random() * 550);
    },
    [broadcastState, commitHost, celebrateWinHost, setToast]
  );

  function botChooseColorFor(G, idx) {
    const bot = G.players[idx];
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    (bot.hand || []).forEach((c) => {
      if (c.color && counts[c.color] !== undefined) counts[c.color] += 1;
    });
    let best = 'red';
    let max = -1;
    for (const c of ['red', 'yellow', 'green', 'blue']) {
      if (counts[c] > max) {
        max = counts[c];
        best = c;
      }
    }
    return best;
  }

  /* ============ SOLO ============ */
  const startSolo = useCallback(
    (botCount) => {
      const G = GRef.current;
      G.isOnline = false;
      G.isHost = true;
      G.roomCode = 'SOLO';
      G.roomCapacity = 1 + botCount;
      G.isPublic = false;
      G.players = [
        { id: 'me', name: view.auth.username || 'Pemain', avatar: view.auth.avatar || '👤', isMe: true, isHost: true, isBot: false, hand: [], hasUno: false }
      ];
      for (let i = 0; i < botCount; i += 1) {
        const persona = pickBotPersona(G.players);
        G.players.push({
          id: `bot-${persona.name}-${Date.now()}`,
          name: persona.name,
          avatar: persona.avatar,
          isMe: false,
          isHost: false,
          isBot: true,
          hand: [],
          hasUno: false
        });
      }
      startGame(G, { capacity: G.players.length });
      commitHost(G);
      setToast(`Mode Solo — ${botCount} bot`);
      hostBotTurnLoop(G);
    },
    [view.auth.username, view.auth.avatar, commitHost, setToast]
  );

  /* ============ LOBBY PUBLIK ============ */
  const ensureLobby = useCallback(async () => {
    if (lobbyRef.current) return;
    try {
      const peer = await makePeer('uno-duel-lobby', { timeout: 12000 });
      lobbyRef.current = peer;
      peer.on('connection', (conn) => {
        conn.on('data', (data) => {
          if (!data || !data.type) return;
          if (data.type === MSG.LOBBY_LIST_REQ) {
            try {
              conn.send({ type: MSG.LOBBY_LIST, rooms: lobbyRoomsRef.current });
            } catch (e) {}
          }
        });
      });
      peer.on('error', () => {
        lobbyRef.current = null;
      });
      setServerStatus((s) => (s === 'offline' ? s : 'online'));
    } catch (e) {
      lobbyRef.current = null;
    }
  }, [makePeer]);

  const refreshRooms = useCallback(async () => {
    const peer = lobbyRef.current;
    if (!peer) {
      setServerStatus('connecting');
      await ensureLobby();
      setServerStatus((s) => (s === 'offline' ? s : 'online'));
      return;
    }
    try {
      const conn = peer.connect('uno-duel-lobby', { reliable: true });
      conn.on('open', () => {
        conn.send({ type: MSG.LOBBY_LIST_REQ });
      });
      conn.on('data', (data) => {
        if (data && data.type === MSG.LOBBY_LIST) {
          setView((v) => ({ ...v, publicRooms: data.rooms || [] }));
          const online = (data.rooms || []).filter((r) => r && r.players && r.players.length).flatMap((r) =>
            (r.players || []).map((p) => ({ name: p.name, avatar: p.avatar, roomCode: r.code }))
          );
          setView((v) => ({ ...v, onlineUsers: online }));
        }
        try {
          conn.close();
        } catch (e) {}
      });
      conn.on('error', () => {
        try {
          conn.close();
        } catch (e) {}
      });
    } catch (e) {}
  }, [ensureLobby]);

  const lobbyRegister = useCallback(
    (G) => {
      if (!lobbyRef.current || !G.isPublic) return;
      try {
        const conn = lobbyRef.current.connect('uno-duel-lobby', { reliable: true });
        conn.on('open', () => {
          conn.send({
            type: MSG.LOBBY_REGISTER,
            room: {
              code: G.roomCode,
              capacity: G.roomCapacity,
              started: !!G.gameStarted,
              players: G.players.map((p) => ({ name: p.name, avatar: p.avatar }))
            }
          });
        });
        conn.on('data', (data) => {
          if (data && data.type === MSG.LOBBY_LIST) {
            lobbyRoomsRef.current = data.rooms || [];
          }
        });
      } catch (e) {}
    },
    []
  );

  /* ============ ROOM HOST ============ */
  const createRoom = useCallback(
    async (isPublic, capacity) => {
      const G = GRef.current;
      const code = generateCode();
      G.isOnline = true;
      G.isHost = true;
      G.roomCode = code;
      G.roomCapacity = capacity;
      G.isPublic = isPublic;
      G.players = [
        { id: code, name: view.auth.username || 'Pemain', avatar: view.auth.avatar || '👤', isMe: true, isHost: true, isBot: false, hand: [], hasUno: false, conn: null }
      ];
      G.gameStarted = false;
      G.log = [];

      setView((v) => ({ ...v, room: { ...v.room, code, capacity, isPublic, isHost: true, isOnline: true, connected: false, players: G.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, isMe: true, isHost: true, isBot: false, hasUno: false, handCount: 0 })) } }));

      resetBrokerCounters();
      let peer = null;
      while (!peer) {
        try {
          peer = await makePeer(code, {
            onBrokerDown: () => {
              if (!brokerDown()) setToast('Semua broker sedang sibuk, coba lagi');
            }
          });
        } catch (e) {
          if (!brokerDown()) {
            setToast('Gagal membuat room: coba lagi');
            return;
          }
        }
      }
      peerRef.current = peer;
      G.players[0].isMe = true;
      G.players[0].conn = null;

      peer.on('connection', (conn) => {
        conn.on('data', (data) => handleHostData(conn, data));
        conn.on('open', () => {
          connectionsRef.current.push(conn);
        });
        conn.on('close', () => {
          handleClientDisconnect(G, conn);
        });
      });
      peer.on('disconnected', () => {
        try {
          peer.reconnect();
        } catch (e) {}
      });

      G.connected = true;
      setView((v) => ({ ...v, room: { ...v.room, connected: true }, screen: 'room' }));
      if (isPublic) lobbyRegister(G);
      setToast(`Room ${code} dibuat!`);
    },
    [view.auth.username, view.auth.avatar, makePeer, handleHostData, setToast, lobbyRegister]
  );

  const handleClientDisconnect = useCallback(
    (G, conn) => {
      const idx = G.players.findIndex((p) => p.conn === conn);
      if (idx === -1) return;
      const p = G.players[idx];
      if (p.isMe) return;
      clearTimeout(p.disconnectTimer);
      p.disconnectTimer = setTimeout(() => {
        const cur = G.players.findIndex((x) => x.conn === conn);
        if (cur === -1) return;
        const wasBot = G.players[cur].isBot;
        if (G.gameStarted && !wasBot) {
          const persona = pickBotPersona(G.players);
          G.players[cur] = {
            ...G.players[cur],
            name: G.players[cur].name,
            isBot: true,
            avatar: persona.avatar,
            conn: null
          };
          setToast(`${G.players[cur].name} keluar — digantikan bot 🤖`);
          if (G.pendingWild !== null && G.currentPlayer === cur) {
            const cardId = G.pendingWild;
            const color = botChooseColorFor(G, cur);
            const res = playCard(G, cur, cardId, color);
            G.pendingWild = null;
            G.pairSelect = null;
            if (res.winner) {
              broadcastState(G);
              commitHost(G);
              setToast(`${G.winner.name} Menang!`);
              celebrateWinHost(G, cur, G.winner.name);
              return;
            }
            afterHostChange(G);
            return;
          }
          broadcastState(G);
          commitHost(G);
          hostBotTurnLoop(G);
        } else if (!G.gameStarted) {
          G.players = G.players.filter((x) => x.conn !== conn);
          broadcastState(G);
          commitHost(G);
        }
      }, 8000);
    },
    [broadcastState, commitHost, celebrateWinHost, setToast]
  );

  const startOnlineGame = useCallback(() => {
    const G = GRef.current;
    if (!G.isHost) return;
    startGame(G, { capacity: G.roomCapacity });
    G.players.forEach((p) => {
      if (!p.isBot && p.conn) p.isMe = false;
    });
    broadcastState(G);
    commitHost(G);
    hostBotTurnLoop(G);
  }, [broadcastState, commitHost]);

  /* ============ CLIENT: apply state & handlers ============ */
  const applyStatePayload = useCallback((data) => {
    setView((v) => ({
      ...v,
      screen: data.started ? 'gameplay' : 'room',
      room: {
        ...v.room,
        code: data.roomCode,
        capacity: data.capacity,
        isPublic: data.isPublic,
        isHost: false,
        isOnline: true,
        connected: true,
        players: data.players || []
      },
      game: {
        started: !!data.started,
        deckCount: data.gameState ? data.gameState.deckCount : 0,
        discardTop: data.gameState ? data.gameState.discardTop : null,
        currentPlayer: data.gameState ? data.gameState.currentPlayer : 0,
        direction: data.gameState ? data.gameState.direction : 1,
        currentColor: data.gameState ? data.gameState.currentColor : null,
        winner: data.gameState ? data.gameState.winner : null,
        myHand: data.gameState ? data.gameState.myHand || [] : [],
        pendingWild: data.gameState && data.gameState.pendingWild !== undefined ? data.gameState.pendingWild : null,
        pairSelect: null,
        hasUno: !!((data.players || []).find((p) => p.isMe) || {}).hasUno,
        log: [],
        botChat: data.botChat,
        isMyTurn: data.gameState ? data.gameState.currentPlayer === data.gameState.playerIndex : false,
        myIndex: data.gameState ? data.gameState.playerIndex : 0
      },
      chat: v.chat
    }));
  }, []);

  /* ============ JOIN ============ */
  const leaveGame = useCallback(() => {
    const G = GRef.current;
    if (G.isOnline && G.isHost) {
      try {
        peerRef.current && peerRef.current.destroy();
      } catch (e) {}
    } else if (G.isOnline && !G.isHost) {
      try {
        connRef.current && connRef.current.close();
      } catch (e) {}
      try {
        peerRef.current && peerRef.current.destroy();
      } catch (e) {}
    }
    peerRef.current = null;
    connRef.current = null;
    connectionsRef.current = [];
    GRef.current = createGameState();
    setView((v) => ({
      ...v,
      screen: 'lobby',
      room: { code: null, capacity: 8, isPublic: false, isHost: false, isOnline: false, connected: false, players: [] },
      game: initialView.game,
      chat: { history: [], visible: v.chat.visible }
    }));
    setToast('Keluar dari room');
  }, [setToast]);

  const handleClientData = useCallback(
    (data) => {
      if (!data || !data.type) return;
      switch (data.type) {
        case MSG.TOAST:
          setToast(data.message);
          break;
        case MSG.PENDING_WILD:
          setView((v) => ({ ...v, game: { ...v.game, pendingWild: data.cardIndex } }));
          break;
        case MSG.CHAT:
          appendChat({ id: data.id, kind: data.kind || (data.emote ? 'emote' : 'msg'), sender: data.sender, avatar: data.avatar, text: data.text, emote: data.emote });
          break;
        case MSG.ROOM_UPDATE:
        case MSG.SYNC_STATE:
          applyStatePayload(data);
          break;
        default:
          break;
      }
    },
    [setToast, appendChat, applyStatePayload]
  );

  const joinRoom = useCallback(
    async (codeInput) => {
      const code = String(codeInput || '').trim().toUpperCase();
      if (code.length !== 6 || joiningRef.current) return;
      joiningRef.current = true;
      setView((v) => ({ ...v, room: { ...v.room, code, isOnline: true, isHost: false, connected: false, isPublic: false } }));

      const initialBroker = brokerForCode(code);
      resetBrokerCounters();
      let peer = null;
      let attempts = 0;
      while (!peer && attempts < 6) {
        attempts += 1;
        try {
          const brokerIdx = attempts === 1 ? initialBroker : brokerForCode(code);
          peer = await makePeer(null, {
            broker: brokerIdx,
            timeout: 8000,
            onBrokerDown: () => {}
          });
        } catch (e) {
          if (!brokerDown()) {
            setToast('Gagal terhubung, coba lagi');
            joiningRef.current = false;
            return;
          }
        }
      }
      if (!peer) {
        joiningRef.current = false;
        setToast('Room tidak ditemukan');
        setView((v) => ({ ...v, room: { ...v.room, connected: false } }));
        return;
      }
      peerRef.current = peer;

      const conn = peer.connect(code, { reliable: true });
      connRef.current = conn;

      const joinWatchdog = setTimeout(() => {
        if (!conn || !conn.open) {
          setToast('Koneksi terputus, mencoba lagi...');
          try {
            conn.close();
          } catch (e) {}
          try {
            peer.destroy();
          } catch (e) {}
          joiningRef.current = false;
          rejoinAttemptsRef.current = 0;
          joinRoom(codeInput);
        }
      }, 8000);

      conn.on('open', () => {
        clearTimeout(joinWatchdog);
        rejoinAttemptsRef.current = 0;
        try {
          conn.send({
            type: MSG.JOIN_ROOM,
            resumeId: null,
            player: { name: view.auth.username || 'Pemain', avatar: view.auth.avatar || '👤' }
          });
        } catch (e) {}
      });

      conn.on('data', (data) => handleClientData(data));
      conn.on('close', () => handleHostDisconnect());
      conn.on('error', () => handleHostDisconnect());
    },
    [makePeer, handleClientData, view.auth.username, view.auth.avatar, setToast]
  );

  const handleHostDisconnect = useCallback(() => {
    if (rejoinAttemptsRef.current >= 3) {
      joiningRef.current = false;
      setToast('Host tidak tersedia');
      leaveGame();
      return;
    }
    rejoinAttemptsRef.current += 1;
    setToast('Menghubungkan kembali...');
    const code = GRef.current.roomCode;
    setTimeout(() => {
      joiningRef.current = false;
      joinRoom(code);
    }, 1500);
  }, [setToast, leaveGame]);

  /* ============ ACTIONS (dipakai host & client) ============ */
  const sendAction = useCallback(
    (action, actionData) => {
      const G = GRef.current;
      if (G.isOnline && !G.isHost) {
        const conn = connRef.current;
        if (!conn || !conn.open) return;
        try {
          conn.send({ type: MSG.ACTION, action, data: actionData });
        } catch (e) {}
        return;
      }
      const idx = myIndex(G);
      const res = runHostAction(G, idx, action, actionData);
      if (res && (res.ok || res.reason === 'wild')) commitHost(G);
      return res;
    },
    [runHostAction, commitHost]
  );

  const playMyCard = useCallback(
    (cardId, chosenColor) => {
      sendAction('PLAY_CARD', { cardId, chosenColor });
    },
    [sendAction]
  );

  const playMyPair = useCallback(
    (idA, idB) => {
      sendAction('PLAY_PAIR', { idA, idB });
    },
    [sendAction]
  );

  const drawAction = useCallback(() => {
    sendAction('DRAW', {});
  }, [sendAction]);

  const passAction = useCallback(() => {
    sendAction('PASS', {});
  }, [sendAction]);

  const unoAction = useCallback(() => {
    sendAction('UNO', {});
  }, [sendAction]);

  const newRound = useCallback(() => {
    sendAction('NEW_ROUND', {});
  }, [sendAction]);

  const chooseWildColor = useCallback(
    (color) => {
      const G = GRef.current;
      const idx = myIndex(G);
      if (G.isOnline && !G.isHost) {
        const conn = connRef.current;
        if (conn && conn.open) {
          try {
            conn.send({ type: MSG.ACTION, action: 'SET_WILD_COLOR', data: { color } });
          } catch (e) {}
        }
        setView((v) => ({ ...v, game: { ...v.game, pendingWild: null } }));
        return;
      }
      const res = runHostAction(G, idx, 'SET_WILD_COLOR', { color });
      G.pendingWild = null;
      G.pairSelect = null;
      if (res && res.ok) commitHost(G);
    },
    [runHostAction, commitHost]
  );

  const selectPairCard = useCallback(
    (cardId) => {
      const G = GRef.current;
      G.pairSelect = cardId === G.pairSelect ? null : cardId;
      commitHost(G);
    },
    [commitHost]
  );

  /* ============ AUTH ============ */
  const persistAuth = useCallback((auth) => {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } catch (e) {}
  }, []);

  const restoreAuth = useCallback(async () => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        const auth = JSON.parse(raw);
        if (auth.token) {
          setView((v) => ({ ...v, auth: { ...v.auth, ...auth } }));
          const res = await api.me(auth.token);
          if (res.ok && res.data && res.data.user) {
            setView((v) => ({
              ...v,
              auth: { ...v.auth, username: res.data.user.username, avatar: res.data.user.avatar, serverOk: true },
              profile: res.data.me || null,
              screen: 'lobby'
            }));
          }
        }
      }
    } catch (e) {}
  }, []);

  const login = useCallback(
    async (username, password) => {
      const res = await api.login(username, password);
      if (!res.ok) {
        setToast(res.data && res.data.error ? res.data.error : 'Login gagal');
        return false;
      }
      const auth = { token: res.data.token, username: res.data.user.username, avatar: res.data.user.avatar, isGuest: false, serverOk: true, dbOk: true };
      setView((v) => ({ ...v, auth: { ...v.auth, ...auth }, screen: 'lobby' }));
      persistAuth(auth);
      setToast(`Selamat datang, ${auth.username}! 👋`);
      return true;
    },
    [setToast, persistAuth]
  );

  const register = useCallback(
    async (username, password, avatar) => {
      const res = await api.register(username, password, avatar);
      if (!res.ok) {
        setToast(res.data && res.data.error ? res.data.error : 'Registrasi gagal');
        return false;
      }
      const auth = { token: res.data.token, username: res.data.user.username, avatar: res.data.user.avatar, isGuest: false, serverOk: true, dbOk: true };
      setView((v) => ({ ...v, auth: { ...v.auth, ...auth }, screen: 'lobby' }));
      persistAuth(auth);
      setToast(`Akun dibuat! Selamat datang, ${auth.username}! 🎉`);
      return true;
    },
    [setToast, persistAuth]
  );

  const loginGuest = useCallback(() => {
    const name = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
    const auth = { token: null, username: name, avatar: '👻', isGuest: true, serverOk: true, dbOk: true };
    setView((v) => ({ ...v, auth: { ...v.auth, ...auth }, screen: 'lobby' }));
    persistAuth(auth);
    setToast('Masuk sebagai Guest 👻');
  }, [setToast, persistAuth]);

  const logoutUser = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch (e) {}
    destroyAll();
    peerRef.current = null;
    connRef.current = null;
    connectionsRef.current = [];
    GRef.current = createGameState();
    setView((v) => ({ ...initialView, auth: { ...v.auth, token: null, isGuest: false } }));
  }, [destroyAll]);

  /* ============ CHAT ============ */
  const sendChatMessage = useCallback(
    (text) => {
      const msgText = String(text || '').trim();
      if (!msgText) return;
      const G = GRef.current;
      const id = makeMsgId();
      const sender = view.auth.username || 'Pemain';
      const avatar = view.auth.avatar || '👤';
      const msg = { id, kind: 'msg', sender, avatar, text: msgText.slice(0, 160), emote: null };
      appendChat(msg);
      if (G.isOnline && G.isHost) {
        G.players.forEach((p) => {
          if (p.conn && p.conn.open && !p.isMe) {
            try {
              p.conn.send({ type: MSG.CHAT, ...msg });
            } catch (e) {}
          }
        });
      } else if (G.isOnline && !G.isHost) {
        const conn = connRef.current;
        if (conn && conn.open) {
          try {
            conn.send({ type: MSG.CHAT, ...msg });
          } catch (e) {}
        }
      } else if (G.players.some((p) => p.isBot)) {
        setTimeout(() => {
          const bots = G.players.map((p, i) => (p.isBot ? i : -1)).filter((i) => i !== -1);
          if (bots.length && Math.random() < 0.6) {
            const botIdx = bots[Math.floor(Math.random() * bots.length)];
            botSpeak(botIdx, ['play', 'greeting', 'draw2'][Math.floor(Math.random() * 3)]);
          }
        }, 900 + Math.random() * 1200);
      }
    },
    [view.auth.username, view.auth.avatar, appendChat, botSpeak]
  );

  const sendEmote = useCallback(
    (emote) => {
      const G = GRef.current;
      const id = makeMsgId();
      const sender = view.auth.username || 'Pemain';
      const avatar = view.auth.avatar || '👤';
      const msg = { id, kind: 'emote', sender, avatar, text: emote, emote };
      appendChat(msg);
      if (G.isOnline && G.isHost) {
        G.players.forEach((p) => {
          if (p.conn && p.conn.open && !p.isMe) {
            try {
              p.conn.send({ type: MSG.CHAT, ...msg });
            } catch (e) {}
          }
        });
      } else if (G.isOnline && !G.isHost) {
        const conn = connRef.current;
        if (conn && conn.open) {
          try {
            conn.send({ type: MSG.CHAT, ...msg });
          } catch (e) {}
        }
      }
    },
    [view.auth.username, view.auth.avatar, appendChat]
  );

  function makeMsgId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  /* ============ INIT ============ */
  useEffect(() => {
    const boot = async () => {
      const health = await api.health();
      if (health.ok) {
        setServerStatus(health.data && health.data.db ? 'online' : 'degraded');
        setView((v) => ({ ...v, auth: { ...v.auth, serverOk: true, dbOk: !!(health.data && health.data.db) } }));
      } else {
        setServerStatus('offline');
      }
      const lb = await api.leaderboard();
      if (lb.ok) setView((v) => ({ ...v, leaderboard: lb.data }));
      await restoreAuth();
      ensureLobby();
      refreshRooms();
      const interval = setInterval(() => {
        api.health().then((h) => {
          if (h.ok) setServerStatus(h.data && h.data.db ? 'online' : 'degraded');
          else setServerStatus('offline');
        });
        refreshRooms();
      }, 30000);
      return () => clearInterval(interval);
    };
    boot();
  }, []);

  const value = useMemo(
    () => ({
      view,
      serverStatus,
      setView,
      setToast,
      login,
      register,
      loginGuest,
      logoutUser,
      startSolo,
      createRoom,
      joinRoom,
      leaveGame,
      startOnlineGame,
      refreshRooms,
      playMyCard,
      playMyPair,
      drawAction,
      passAction,
      unoAction,
      newRound,
      chooseWildColor,
      selectPairCard,
      sendChatMessage,
      sendEmote,
      showEmotion,
      openSettings
    }),
    [
      view,
      serverStatus,
      setToast,
      login,
      register,
      loginGuest,
      logoutUser,
      startSolo,
      createRoom,
      joinRoom,
      leaveGame,
      startOnlineGame,
      refreshRooms,
      playMyCard,
      playMyPair,
      drawAction,
      passAction,
      unoAction,
      newRound,
      chooseWildColor,
      selectPairCard,
      sendChatMessage,
      sendEmote,
      showEmotion,
      openSettings
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame harus dipakai di dalam <GameProvider>');
  return ctx;
}

export { initialView as GAME_INITIAL };