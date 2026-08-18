// Vercel Serverless Function: leaderboard UNO Duel (Neon PostgreSQL)
//
//   GET  /api/score           -> top 10 papan peringkat (array)
//   GET  /api/score?name=aku  -> { leaderboard: top10, me: { name, wins, rank } | null }
//   POST /api/score           -> body { name, avatar } (tambah 1 kemenangan)
//                                opsional Authorization: Bearer <token> -> pakai username akun
//   OPTIONS                   -> CORS 204
const { pool, ensureTables, verifyToken, json, cors, readBody } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return cors(res);

  try {
    if (!process.env.DATABASE_URL) return json(res, 500, { error: 'DATABASE_URL belum di-set di Vercel env' });
    await ensureTables();

    // --- GET: ambil top 10 (+ me jika ?name=) ---
    if (req.method === 'GET') {
      const url = new URL(req.url, 'https://localhost');
      const meName = (url.searchParams.get('name') || '').trim();
      const { rows } = await pool.query(
        'SELECT name, wins, avatar FROM leaderboard ORDER BY wins DESC, updated_at ASC LIMIT 10'
      );
      if (!meName) return json(res, 200, rows);

      let me = null;
      const mine = await pool.query('SELECT name, wins, avatar FROM leaderboard WHERE name = $1', [meName]);
      if (mine.rows.length) {
        const rk = await pool.query('SELECT COUNT(*)::int AS r FROM leaderboard WHERE wins > $1', [mine.rows[0].wins]);
        me = { ...mine.rows[0], rank: rk.rows[0].r + 1 };
      }
      return json(res, 200, { leaderboard: rows, me });
    }

    // --- POST: simpan/tambah skor ---
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      let name = String(body.name || '').trim().slice(0, 40);
      let avatar = String(body.avatar || '👤').slice(0, 8);

      // Jika ada token -> identitas dari akun (lebih aman)
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = verifyToken(token);
      if (payload && payload.username) {
        const u = await pool.query('SELECT username, avatar FROM users WHERE username = $1', [payload.username]);
        if (u.rows.length) {
          name = u.rows[0].username;
          avatar = u.rows[0].avatar || avatar;
        }
      }

      if (!name || name.toLowerCase() === 'bot') return json(res, 400, { error: 'nama pemain tidak valid' });

      const { rows } = await pool.query(
        `INSERT INTO leaderboard (name, wins, avatar)
         VALUES ($1, 1, $2)
         ON CONFLICT (name)
         DO UPDATE SET wins = leaderboard.wins + 1, avatar = EXCLUDED.avatar, updated_at = now()
         RETURNING name, wins, avatar`,
        [name, avatar]
      );
      return json(res, 200, rows[0]);
    }

    json(res, 405, { error: 'method tidak didukung' });
  } catch (err) {
    console.error('api/score error:', err);
    json(res, 500, { error: 'Database error' });
  }
};