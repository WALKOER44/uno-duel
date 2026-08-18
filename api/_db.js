// Helper bersama: koneksi Neon + auth (dipakai semua route api/*)
// File diawali "_" -> tidak diekspos Vercel sebagai endpoint.
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000
});

const AUTH_SECRET = process.env.AUTH_SECRET || 'uno-duel-dev-secret-change-me';

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT DEFAULT '👤',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      name TEXT PRIMARY KEY,
      wins INTEGER NOT NULL DEFAULT 1,
      avatar TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_leaderboard_wins ON leaderboard (wins DESC)');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function issueToken(username) {
  const payload = Buffer.from(
    JSON.stringify({ username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.username || (data.exp && data.exp < Date.now())) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = {
  pool,
  ensureTables,
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  json,
  cors,
  readBody
};