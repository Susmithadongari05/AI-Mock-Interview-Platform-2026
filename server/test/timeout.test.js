import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestTimeout } from '../src/middleware/timeout.middleware.js';

const fakeRes = () => {
  const res = new EventEmitter();
  res.headersSent = false;
  res.sent = [];
  res.status = function (code) { this.code = code; return this; };
  res.json = function (body) { this.headersSent = true; this.sent.push([this.code, body]); return this; };
  res.send = function () { return this; };
  return res;
};

test('requestTimeout answers 504 JSON when the handler is too slow and ignores its late reply', async () => {
  const res = fakeRes();
  requestTimeout(30, 'too slow')({ method: 'POST', originalUrl: '/api/interview/start' }, res, () => {});
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(res.sent.length, 1);
  assert.equal(res.sent[0][0], 504);
  assert.equal(res.sent[0][1].message, 'too slow');
  assert.equal(res.sent[0][1].success, false);
  res.status(201).json({ late: true }); // handler finishing late must not send or throw
  assert.equal(res.sent.length, 1);
});

test('requestTimeout does nothing when the handler answers in time', async () => {
  const res = fakeRes();
  requestTimeout(30)({ method: 'POST', originalUrl: '/x' }, res, () => { res.status(200).json({ ok: true }); res.emit('finish'); });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(res.sent.length, 1);
  assert.equal(res.sent[0][0], 200);
});
