import test from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed } from '../src/config/cors.js';

test('CORS: configured origins, local dev ports and production strictness', () => {
  const dev = { CLIENT_URL: 'http://localhost:5173', NODE_ENV: 'development' };
  assert.equal(isOriginAllowed(undefined, dev), true);
  assert.equal(isOriginAllowed('http://localhost:5173', dev), true);
  assert.equal(isOriginAllowed('http://localhost:5174', dev), true);      // Vite moved to next port
  assert.equal(isOriginAllowed('http://127.0.0.1:5173', dev), true);      // 127.0.0.1 vs localhost
  assert.equal(isOriginAllowed('https://evil.example', dev), false);
  const prod = { CLIENT_URL: 'https://app.example.com, https://www.example.com/', NODE_ENV: 'production' };
  assert.equal(isOriginAllowed('https://www.example.com', prod), true);
  assert.equal(isOriginAllowed('http://localhost:5173', prod), false);
});
