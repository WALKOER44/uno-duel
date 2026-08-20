async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  health() {
    return request('/api/health');
  },
  login(username, password) {
    return request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  register(username, password, avatar) {
    return request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, avatar })
    });
  },
  me(token) {
    return request('/api/me', { headers: { Authorization: `Bearer ${token}` } });
  },
  leaderboard() {
    return request('/api/score');
  },
  score(name, avatar, token) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return request('/api/score', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, avatar })
    });
  }
};