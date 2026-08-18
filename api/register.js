// POST /api/register  { username, password, avatar }
const { pool, ensureTables, hashPassword, issueToken, json, cors, readBody } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return cors(res);
  if (req.method !== 'POST') return json(res, 405, { error: 'method tidak didukung' });
  try {
    if (!process.env.DATABASE_URL) return json(res, 500, { error: 'DATABASE_URL belum di-set' });
    await ensureTables();
    const body = JSON.parse(await readBody(req) || '{}');
    const username = String(body.username || '').trim().slice(0, 40);
    const password = String(body.password || '');
    const avatar = String(body.avatar || '👤').slice(0, 8);
    if (username.length < 3) return json(res, 400, { error: 'Username minimal 3 karakter' });
    if (password.length < 4) return json(res, 400, { error: 'Password minimal 4 karakter' });
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length) return json(res, 409, { error: 'Username sudah dipakai' });
    await pool.query(
      'INSERT INTO users (username, password_hash, avatar) VALUES ($1, $2, $3)',
      [username, hashPassword(password), avatar]
    );
    const token = issueToken(username);
    json(res, 200, { token, user: { username, avatar } });
  } catch (err) {
    console.error('register error:', err);
    json(res, 500, { error: 'Database error' });
  }
};