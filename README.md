# UNO Duel

Game UNO-style dengan **React (Vite)** + P2P (PeerJS) untuk multiplayer online jarak jauh.

## Fitur
- **Multiplayer online antar perangkat** via WebRTC (PeerJS) — bikin room publik/privat, main bareng dari jarak jauh, + bot pengisi slot
- Room privat dengan kode 6 huruf, kapasitas 2–8 pemain, recovery otomatis saat halaman di-refresh
- Mode solo lawan bot dengan **persona manusiawi** (nama/avatar asli, kadang balas dendam, bisa **ngamuk** kalau berkali-kali kena +2/+4)
- **Ekspresi emosi + suara**: ngamuk 😡, nangis 😭, kemberut 😤, kaget 😱 saat kena +2/+4/skip atau menang/kalah
- **Karakter & emote pixel art** reaktif terhadap momen permainan
- **Musik latar generated** (lobby ceria + gameplay makin intens saat pemain makin sedikit), bisa di-on/off dari Pengaturan
- **BGM "Good Life"**: taruh file MP3 legal milikmu di `public/audio/good-life.mp3`, volume diatur dari Pengaturan. Jika file tidak ada, musik sintesis otomatis menggantikannya
- Efek suara kaya (klik kartu, throw, draw, shuffle, fanfare menang) — semuanya sintesis Web Audio
- **Kartu bergaya asli**: gradien, oval tengah, badge sudut lingkaran putih
- **Refill deck dari tumpukan buangan** saat kartu tengah habis (diacak ulang otomatis)
- Kartu aksi: skip, reverse, draw 2, wild, wild +4 + main **dobel kartu angka**
- Chat real-time + emote, bisa disembunyikan/ditampilkan
- Papan peringkat & pemain online via backend Vercel (Neon PostgreSQL)
- **Dioptimalkan untuk HP**: tabel compact, area aman layar (notch), anti zoom iOS, layout landscape pendek

## Cara jalankan lokal

```bash
npm install
npm run dev
```

Buka http://localhost:5173/

## Build untuk produksi

```bash
npm run build
```

Hasil build ada di folder `dist/` (siap di-deploy ke GitHub Pages karena `base: './'`).

## Deploy ke Vercel
1. Push project ke GitHub
2. Masuk ke Vercel
3. Import repository
4. Framework: Vite
5. Build command: `npm run build`
6. Output directory: `dist`

## Struktur project
```
src/
  api/          — client API (login, register, leaderboard, dll.)
  components/   — komponen UI (Auth, Lobby, WaitingRoom, GameRoom, Table, Seats, PlayerDock, Chat, Settings, dst.)
  components/fx — efek pixel art & animasi (PixelEmote, EmotionLayer, WildFlash, dst.)
  context/      — GameContext (state game + networking host-authoritative) & SettingsContext (preferensi audio)
  engine/       — logika murni: kartu, aturan, bot, state game, protokol PeerJS, audio sintesis, sprite pixel
  hooks/        — usePeer (koneksi + watchdog), useAudio (sinkron musik)
index.html      — entry Vite
public/audio/   — tempat meletakkan good-life.mp3 (opsional)
api/*.js        — backend serverless Vercel + Neon PostgreSQL (dipakai apa adanya)
```

## Catatan online
Multiplayer memakai WebRTC peer-to-peer lewat broker PeerJS publik dengan fallback multi-broker + ICE STUN/TURN, jadi bisa tembus NAT/CGNAT antar jaringan berbeda. Host server-authoritative: semua keputusan game dihitung di sisi host lalu disinkronkan. Backend Vercel dipakai untuk autentikasi, papan peringkat, dan daftar pemain online (bukan relay data game). 
