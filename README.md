# UNO Duel

Game UNO-style sederhana yang dibuat dengan Vite + JavaScript vanilla.

## Fitur
- Mode lawan bot
- Mode 2 player lokal di device yang sama
- Tumpukan draw/discard
- Kartu warna dan aksi seperti skip, reverse, draw 2, wild, wild +4
- Log ronde dan sistem menang otomatis

## Cara jalankan lokal

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

Buka:
- http://localhost:4173/

## Build untuk produksi

```bash
npm run build
```

## Deploy ke Vercel
1. Push project ke GitHub
2. Masuk ke Vercel
3. Import repository
4. Framework: Vite
5. Build command: `npm run build`
6. Output directory: `dist`

## Catatan
Versi ini masih bersifat lokal dan bot single-device. Kalau mau versi online antar teman via browser berbeda, kita perlu menambahkan backend realtime (misalnya Socket.IO). 
