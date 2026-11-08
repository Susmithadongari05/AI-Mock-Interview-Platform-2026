// CORS origin rules (kept separate from app.js so they can be unit-tested).
// CLIENT_URL may hold several comma-separated origins. Outside production any
// localhost / 127.0.0.1 port is accepted too, because Vite silently moves to the
// next free port (5174, 5175 ...) and "localhost" vs "127.0.0.1" are different
// origins - a common cause of "Network Error" on login.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const isOriginAllowed = (origin, env = process.env) => {
  if (!origin) return true; // curl, server-to-server, same-origin
  const configured = String(env.CLIENT_URL || 'http://localhost:5173')
    .split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  if (configured.includes(origin)) return true;
  return env.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(origin);
};
