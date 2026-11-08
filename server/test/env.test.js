import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv, validateRequiredEnv, describeMongoUri } from '../src/config/env.js';

const writeEnv = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envtest-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, content);
  return file;
};

test('the .env file value beats a stale shell variable outside production, and the override is reported', () => {
  const file = writeEnv('GEMINI_MODEL=gemini-3.8-flash\n');
  const env = { GEMINI_MODEL: 'gemini-2.5-flash', NODE_ENV: 'development' };
  const report = loadEnv({ file, processEnv: env });
  assert.equal(env.GEMINI_MODEL, 'gemini-3.8-flash');
  assert.deepEqual(report.shadowed, ['GEMINI_MODEL']);
  assert.equal(report.sources.GEMINI_MODEL, 'env-file');
});

test('in production, platform-provided variables are kept', () => {
  const file = writeEnv('GEMINI_MODEL=from-file\n');
  const env = { GEMINI_MODEL: 'from-platform', NODE_ENV: 'production' };
  loadEnv({ file, processEnv: env });
  assert.equal(env.GEMINI_MODEL, 'from-platform');
});

test('a missing .env file is reported, not fatal', () => {
  const report = loadEnv({ file: path.join(os.tmpdir(), 'does-not-exist', '.env'), processEnv: {} });
  assert.equal(report.envFileFound, false);
});

test('validateRequiredEnv and describeMongoUri', () => {
  assert.equal(validateRequiredEnv({ MONGODB_URI: 'x', JWT_SECRET: 'a'.repeat(32) }).length, 0);
  assert.equal(validateRequiredEnv({}).length, 2);
  assert.match(validateRequiredEnv({ MONGODB_URI: 'x', JWT_SECRET: 'short' })[0], /too short/);
  const withDb = describeMongoUri('mongodb+srv://user:secret@cluster0.abc.mongodb.net/mydb?retryWrites=true');
  assert.equal(withDb.dbInUri, 'mydb');
  assert.equal(withDb.host, 'cluster0.abc.mongodb.net');
  assert.ok(!JSON.stringify(withDb).includes('secret'));
  assert.equal(describeMongoUri('mongodb+srv://user:secret@cluster0.abc.mongodb.net/?x=1').dbInUri, null);
});
