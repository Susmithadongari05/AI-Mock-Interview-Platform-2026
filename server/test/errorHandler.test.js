import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/error.middleware.js';

const run = (err) => {
  const res = { headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const origError = console.error; const origWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { errorHandler(err, {}, res, () => {}); } finally { console.error = origError; console.warn = origWarn; }
  return res;
};

test('error handler maps known error types to proper status codes and keeps the real message', () => {
  assert.equal(run(Object.assign(new Error('Gemini broke'), { statusCode: 502 })).code, 502);
  assert.equal(run(Object.assign(new Error('x'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' })).code, 413);
  assert.equal(run(Object.assign(new Error('x'), { type: 'entity.parse.failed' })).code, 400);
  assert.equal(run(Object.assign(new Error('dup'), { code: 11000 })).code, 409);
  assert.equal(run(Object.assign(new Error('bad id'), { name: 'CastError', path: '_id' })).code, 400);
  assert.equal(run(new Error('boom')).code, 500);
  assert.equal(run(Object.assign(new Error('Only PDF'), { statusCode: 400 })).body.message, 'Only PDF');
});

test('in production, unexpected 500 errors do not leak their message; deliberate ones do', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(run(new Error('connection string mongodb://secret')).body.message, 'Something went wrong on the server. Please try again.');
    assert.equal(run(Object.assign(new Error('Gemini quota'), { statusCode: 502 })).body.message, 'Gemini quota');
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});
