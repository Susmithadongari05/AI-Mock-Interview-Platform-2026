import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/middleware/rateLimit.middleware.js';

const call = (limiter, ip) => {
  const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let passed = false;
  limiter({ ip }, res, () => { passed = true; });
  return { passed, res };
};

test('rate limiter blocks after max attempts per IP and recovers after the window', () => {
  let time = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => time });
  assert.ok(call(limiter, '1.1.1.1').passed);
  assert.ok(call(limiter, '1.1.1.1').passed);
  const blocked = call(limiter, '1.1.1.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.code, 429);
  assert.ok(blocked.res.headers['Retry-After']);
  assert.ok(call(limiter, '2.2.2.2').passed, 'other IPs are unaffected');
  time = 1500;
  assert.ok(call(limiter, '1.1.1.1').passed, 'window expired');
});
