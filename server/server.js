// UNO Duel - Relay server
// Hosting: GitHub Pages hanya bisa file statis. Server ini menangani:
//   1. PeerJS signaling (custom PeerServer) -> koneksi player stabil, status Online
//   2. Socket.io room registry       -> daftar room publik bisa diandalkan
//
// DEPLOY (gratis):
//   - Render : https://dashboard.render.com -> "New" -> "Web Service"
//       Build: npm install   Start: node server.js   (Render otomatis isi PORT)
//       Setelah deploy, salin URL mis. https://uno-duel-relay.onrender.com
//   - Railway : https://railway.app -> New Project -> Deploy from repo
//   - Glitch  : https://glitch.com -> import this folder
// Lalu di script.js frontend ubah:
//   const RELAY = { enabled: true, host: 'YOUR-APP.onrender.com', port: 443, path: '/peerjs', secure: true };

const express = require('express');
const http = require('http');
const { ExpressPeerServer } = require('peer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// ---- 1. PeerJS signaling server ----
// JANGAN isi opsi `path` di sini. Di peer v1, endpoint WebSocket otomatis
// menjadi `${mountPath}/${WS_PATH}` = "/peerjs/peerjs".
// Di frontend, klien peerjs menambahkan sendiri "peerjs" ke path-nya,
// jadi RELAY.path cukup "/peerjs" -> konek ke "/peerjs/peerjs" (cocok).
const peerServer = ExpressPeerServer(server, {
  allow_discovery: true,
  proxied: true
});
app.use('/peerjs', peerServer);

// ---- 2. Socket.io room registry ----
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map(); // code -> roomInfo

io.on('connection', (socket) => {
  socket.on('rooms.get', () => {
    socket.emit('rooms.update', [...rooms.values()]);
  });

  socket.on('room.register', (info) => {
    if (!info || !info.code) return;
    info.socketId = socket.id;
    info.ts = Date.now();
    rooms.set(info.code, info);
    io.emit('rooms.update', [...rooms.values()]);
  });

  socket.on('room.unregister', (code) => {
    if (rooms.delete(code)) {
      io.emit('rooms.update', [...rooms.values()]);
    }
  });

  socket.on('disconnect', () => {
    // Hapus room milik socket yang putus agar tidak jadi "hantu"
    let changed = false;
    for (const [code, r] of rooms) {
      if (r.socketId === socket.id) {
        rooms.delete(code);
        changed = true;
      }
    }
    if (changed) io.emit('rooms.update', [...rooms.values()]);
  });
});

app.get('/status', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, ts: Date.now() });
});
app.get('/', (_req, res) => {
  res.send('UNO Duel relay online. Rooms aktif: ' + rooms.size);
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log('UNO Duel relay berjalan di :' + PORT);
});
