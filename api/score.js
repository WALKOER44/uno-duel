// Vercel Serverless Function: leaderboard UNO Duel (Neon PostgreSQL)
//
//   GET  /api/score  -> top 10 papan peringkat
//   POST /api/score  -> body: { "name": "<nama pemain>" } (tambah 1 kemenangan)
//
// Persyaratan di Vercel (Dashboard -> Project -> Settings -> Environment Variables):
//   DATABASE_URL = postgresql://user:pass@host.neon.tech/dbname?sslmode=require

const { Pool } = require('pg');

// Pool dibagikan antar-request. Vercel akan reuse koneksi di cold start.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000
});

// Pastikan tabel ada (dijalankan saat function pertama kali dipanggil)
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      name  TEXT PRIMARY KEY,
      wins  INTEGER NOT NULL DEFAULT 1,
      avatar TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  try {
    if (!process.env.DATABASE_URL) {
      json(res, 500, { error: 'DATABASE_URL belum di-set di Vercel env' });
      return;
    }

    await ensureTable();

    // --- GET: ambil top 10 ---
    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'SELECT name, wins, avatar FROM leaderboard ORDER BY wins DESC, updated_at ASC LIMIT 10'
      );
      json(res, 200, rows);
      return;
    }

    // --- POST: simpan/tambah skor ---
    if (req.method === 'POST') {
      const body = JSON.parse(readBody(req) || '{}');
      const name = String(body.name || '').trim().slice(0, 40);
      const avatar = String(body.avatar || '👤').slice(0, 8);
      if (!name || name.toLowerCase() === 'bot') {
        json(res, 400, { error: 'nama pemain tidak valid' });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO leaderboard (name, wins, avatar)
         VALUES ($1, 1, $2)
         ON CONFLICT (name)
         DO UPDATE SET wins = leaderboard.wins + 1, avatar = EXCLUDED.avatar, updated_at = now()
         RETURNING name, wins, avatar`,
        [name, avatar]
      );
      json(res, 200, rows[0]);
      return;
    }

    json(res, 405, { error: 'method tidak didukung' });
  } catch (err) {
    console.error('api/score error:', err);
    json(res, 500, { error: 'Database error: ' + (err.message || 'unknown') });
  }
};