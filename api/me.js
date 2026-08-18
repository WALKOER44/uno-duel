// GET /api/me  (Authorization: Bearer <token>)
// Mengembalikan user + statistik leaderboard miliknya (wins, rank).
const { pool, ensureTables, verifyToken, json, cors } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return cors(res);
  if (req.method !== 'GET') return json(res, 405, { error: 'method tidak didukung' });
  try {
    await ensureTables();
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = verifyToken(token);
    if (!payload) return json(res, 401, { error: 'sesi tidak valid / kedaluwarsa' });
    const u = await pool.query('SELECT username, avatar FROM users WHERE username = $1', [payload.username]);
    if (!u.rows.length) return json(res, 401, { error: 'akun tidak ditemukan' });
    const user = u.rows[0];
    const lb = await pool.query('SELECT name, wins, avatar FROM leaderboard WHERE name = $1', [user.username]);
    let me = null;
    if (lb.rows.length) {
      const rk = await pool.query('SELECT COUNT(*)::int AS r FROM leaderboard WHERE wins > $1', [lb.rows[0].wins]);
      me = { ...lb.rows[0], rank: rk.rows[0].r + 1 };
    }
    json(res, 200, { user, me });
  } catch (err) {
    console.error('me error:', err);
    json(res, 500, { error: 'Database error' });
  }
};