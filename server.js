// UNO Duel — server relay + frontend (1 folder full)
// Berjalan di root repo. Menyajikan:
//   1. Frontend statis (index.html, style.css, script.js)
//   2. PeerJS signaling  -> koneksi P2P stabil, status Online
//   3. Socket.io registry -> daftar room publik bisa diandalkan
//
// DEPLOY: Railway -> New Project -> Deploy from GitHub -> repo ini.
// package.json di root membuat Railway otomatis mendeteksi Node app.

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

// ---- 3. Frontend statis (folder repo ini) ----
app.use(express.static(__dirname));

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log('UNO Duel relay + frontend berjalan di :' + PORT);
});