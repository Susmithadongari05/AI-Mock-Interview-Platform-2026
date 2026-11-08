// ============================================
// app.js - Express Application Setup
// ============================================

import express from 'express';
import cors from 'cors';

import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { isOriginAllowed } from './config/cors.js';
import { createRateLimiter } from './middleware/rateLimit.middleware.js';

const app = express();

app.disable('x-powered-by');
// Behind a hosting proxy (Render, Railway, Heroku...) set TRUST_PROXY=1 so req.ip is the real client.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
});

// ---- CORS ---- (rules live in config/cors.js)
app.use(cors({
  origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
}));

app.use(express.json({ limit: '10mb' }));

// Liveness check (no database access, no secrets).
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

// Slow down password guessing on the public auth endpoints.
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30 });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
