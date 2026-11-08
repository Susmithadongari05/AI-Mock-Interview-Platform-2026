import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { askGemini, getGeminiModel, DEFAULT_GEMINI_MODEL, __setGeminiClientFactory } from '../src/services/geminiService.js';

const original = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, fallback: process.env.GEMINI_FALLBACK_MODEL };
beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; delete process.env.GEMINI_MODEL; delete process.env.GEMINI_FALLBACK_MODEL; });
afterEach(() => {
  __setGeminiClientFactory(null);
  if (original.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original.key;
  if (original.model === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = original.model;
  if (original.fallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL; else process.env.GEMINI_FALLBACK_MODEL = original.fallback;
});

const fakeClient = (handler) => () => ({ models: { generateContent: handler } });

test('model comes from GEMINI_MODEL and defaults to a currently supported model', () => {
  assert.equal(getGeminiModel({}), DEFAULT_GEMINI_MODEL);
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.8-flash');
  assert.equal(getGeminiModel({ GEMINI_MODEL: '  gemini-custom ' }), 'gemini-custom');
});

test('askGemini sends the configured model and JSON mime type, and returns the text', async () => {
  process.env.GEMINI_MODEL = 'gemini-test-model';
  let seen;
  __setGeminiClientFactory(fakeClient(async (args) => { seen = args; return { text: '{"ok":true}' }; }));
  const out = await askGemini('hello', { json: true });
  assert.equal(out, '{"ok":true}');
  assert.equal(seen.model, 'gemini-test-model');
  assert.equal(seen.contents, 'hello');
  assert.equal(seen.config.responseMimeType, 'application/json');
});

test('a rejected model is reported with the real error and an actionable hint (no silent fallback)', async () => {
  let calls = 0;
  __setGeminiClientFactory(fakeClient(async () => {
    calls += 1;
    throw Object.assign(new Error('This model models/gemini-2.5-flash is no longer available to new users.'), { status: 404 });
  }));
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  await assert.rejects(askGemini('x'), (error) => {
    assert.match(error.message, /gemini-2\.5-flash/);
    assert.match(error.message, /HTTP 404/);
    assert.match(error.message, /GEMINI_MODEL/);
    assert.equal(error.statusCode, 502);
    return true;
  });
  assert.equal(calls, 1, '404 must not be retried');
});

test('transient 503 errors are retried and then succeed', async () => {
  let calls = 0;
  __setGeminiClientFactory(fakeClient(async () => {
    calls += 1;
    if (calls < 2) throw Object.assign(new Error('overloaded'), { status: 503 });
    return { text: 'done' };
  }));
  assert.equal(await askGemini('x', { retryBaseMs: 5 }), 'done');
  assert.equal(calls, 2);
});

test('missing API key, empty prompt and empty responses fail clearly', async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(askGemini('x'), /GEMINI_API_KEY is missing/);
  process.env.GEMINI_API_KEY = 'k';
  await assert.rejects(askGemini('   '), /prompt cannot be empty/);
  __setGeminiClientFactory(fakeClient(async () => ({ text: '', candidates: [{ finishReason: 'SAFETY' }] })));
  await assert.rejects(askGemini('x'), /empty response.*SAFETY/);
});

const overloaded = () => Object.assign(new Error('The model is overloaded. Please try again later.'), { status: 503 });

test('a Gemini 503 that never clears becomes a friendly 503 (not a raw API error) after bounded retries', async () => {
  let calls = 0;
  __setGeminiClientFactory(fakeClient(async () => { calls += 1; throw overloaded(); }));
  await assert.rejects(askGemini('x', { retryBaseMs: 5, maxAttempts: 3 }), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'GEMINI_OVERLOADED');
    assert.match(error.message, /busy right now/);
    assert.doesNotMatch(error.message, /overloaded|models\//i, 'raw provider text must not reach the user');
    return true;
  });
  assert.equal(calls, 3);
});

test('a Gemini request that never answers fails with a 504 timeout instead of hanging', async () => {
  __setGeminiClientFactory(fakeClient(() => new Promise(() => {})));
  const started = Date.now();
  await assert.rejects(askGemini('x', { timeoutMs: 40, maxAttempts: 2, retryBaseMs: 5 }), (error) => {
    assert.equal(error.statusCode, 504);
    assert.equal(error.code, 'GEMINI_TIMEOUT');
    return true;
  });
  assert.ok(Date.now() - started < 1500);
});

test('the overall deadline bounds total waiting even with many slow attempts', async () => {
  __setGeminiClientFactory(fakeClient(() => new Promise(() => {})));
  const started = Date.now();
  await assert.rejects(askGemini('x', { timeoutMs: 300, deadlineMs: 700, maxAttempts: 10, retryBaseMs: 10 }), /took too long/);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test('the abort signal is passed to the client so a timed-out request is really cancelled', async () => {
  let signal;
  __setGeminiClientFactory(fakeClient((args) => { signal = args.config.abortSignal; return new Promise(() => {}); }));
  await assert.rejects(askGemini('x', { timeoutMs: 30, maxAttempts: 1 }));
  assert.equal(signal.aborted, true);
});

test('GEMINI_FALLBACK_MODEL is used only when the main model stays overloaded', async () => {
  process.env.GEMINI_MODEL = 'main-model';
  process.env.GEMINI_FALLBACK_MODEL = 'backup-model';
  const models = [];
  __setGeminiClientFactory(fakeClient(async (args) => {
    models.push(args.model);
    if (args.model === 'main-model') throw overloaded();
    return { text: '{"ok":true}' };
  }));
  assert.equal(await askGemini('x', { retryBaseMs: 5, maxAttempts: 2 }), '{"ok":true}');
  assert.deepEqual(models, ['main-model', 'main-model', 'backup-model']);
});

test('the fallback model is NOT used for permanent errors such as an unknown model or bad key', async () => {
  process.env.GEMINI_FALLBACK_MODEL = 'backup-model';
  const models = [];
  __setGeminiClientFactory(fakeClient(async (args) => { models.push(args.model); throw Object.assign(new Error('not found'), { status: 404 }); }));
  await assert.rejects(askGemini('x', { retryBaseMs: 5 }), /HTTP 404/);
  assert.deepEqual(models, [DEFAULT_GEMINI_MODEL]);
});

test('429 becomes a friendly rate-limit message', async () => {
  __setGeminiClientFactory(fakeClient(async () => { throw Object.assign(new Error('quota'), { status: 429 }); }));
  await assert.rejects(askGemini('x', { retryBaseMs: 5, maxAttempts: 2 }), (error) => error.statusCode === 429 && /rate limit/i.test(error.message));
});
