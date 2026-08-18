// GET /api/health -> status server (Vercel) + koneksi DB (Neon)
const { pool, ensureTables, json, cors } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return cors(res);
  try {
    await ensureTables();
    await pool.query('SELECT 1');
    json(res, 200, { ok: true, db: true, time: Date.now() });
  } catch (err) {
    console.error('health error:', err);
    json(res, 200, { ok: true, db: false, time: Date.now() });
  }
};