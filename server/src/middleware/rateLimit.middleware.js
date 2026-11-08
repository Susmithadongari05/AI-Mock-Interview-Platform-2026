// Minimal in-memory rate limiter (no dependency). Fine for a single server instance;
// use a shared store (e.g. Redis) if you scale to several instances.
export const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 20, now = () => Date.now() } = {}) => {
  const hits = new Map(); // key -> { count, resetAt }

  const middleware = (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const time = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= time) hits.delete(k);

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - time) / 1000)));
      return res.status(429).json({ success: false, message: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    return next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
};
