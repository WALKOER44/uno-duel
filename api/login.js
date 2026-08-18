// POST /api/login  { username, password }
const { pool, ensureTables, verifyPassword, issueToken, json, cors, readBody } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return cors(res);
  if (req.method !== 'POST') return json(res, 405, { error: 'method tidak didukung' });
  try {
    if (!process.env.DATABASE_URL) return json(res, 500, { error: 'DATABASE_URL belum di-set' });
    await ensureTables();
    const body = JSON.parse(await readBody(req) || '{}');
    const username = String(body.username || '').trim().slice(0, 40);
    const password = String(body.password || '');
    if (!username || !password) return json(res, 400, { error: 'Username dan password wajib diisi' });
    const { rows } = await pool.query('SELECT username, password_hash, avatar FROM users WHERE username = $1', [username]);
    if (!rows.length) return json(res, 401, { error: 'Username / password salah' });
    const user = rows[0];
    if (!verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'Username / password salah' });
    const token = issueToken(user.username);
    json(res, 200, { token, user: { username: user.username, avatar: user.avatar } });
  } catch (err) {
    console.error('login error:', err);
    json(res, 500, { error: 'Database error' });
  }
};