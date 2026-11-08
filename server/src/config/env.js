// ============================================
// env.js - Environment loading (single source of truth)
// ============================================
// Why this file exists:
//   `import "dotenv/config"` reads ".env" from the CURRENT WORKING DIRECTORY and,
//   by default, never overrides variables that already exist in the OS/shell
//   environment. Two classic consequences:
//     1. Starting the server from the wrong folder -> the .env file is not found
//        and code silently falls back to its hard-coded defaults.
//     2. A stale Windows/User/shell variable (e.g. GEMINI_MODEL) silently beats
//        whatever you wrote in .env.
//   This loader reads server/.env by ABSOLUTE path (independent of cwd), lets the
//   file win over stale shell variables outside production, and records exactly
//   where each important value came from so the startup log can show it.
//   It never logs secret values.
// ============================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_FILE = path.join(SERVER_ROOT, '.env');

// Variables whose origin we report (names only, never values of secrets).
const TRACKED = ['GEMINI_MODEL', 'MONGODB_URI', 'MONGODB_DB_NAME', 'PORT', 'CLIENT_URL'];

export const envReport = {
  serverRoot: SERVER_ROOT,
  envFile: ENV_FILE,
  envFileFound: false,
  cwd: process.cwd(),
  sources: {},        // name -> 'env-file' | 'shell-environment' | 'unset'
  shadowed: [],       // names where a shell variable differed from the .env file
};

export const loadEnv = ({ file = ENV_FILE, processEnv = process.env } = {}) => {
  envReport.envFile = file;
  envReport.envFileFound = fs.existsSync(file);
  envReport.shadowed = [];

  let fileValues = {};
  if (envReport.envFileFound) {
    fileValues = dotenv.parse(fs.readFileSync(file));
  }

  const isProduction = processEnv.NODE_ENV === 'production';
  for (const [key, value] of Object.entries(fileValues)) {
    const existing = processEnv[key];
    if (existing !== undefined && existing !== value) {
      envReport.shadowed.push(key);
      // Outside production the .env file wins, so editing it always takes effect.
      if (!isProduction) processEnv[key] = value;
    } else if (existing === undefined) {
      processEnv[key] = value;
    }
  }

  for (const name of TRACKED) {
    if (processEnv[name] === undefined || processEnv[name] === '') envReport.sources[name] = 'unset';
    else if (name in fileValues && processEnv[name] === fileValues[name]) envReport.sources[name] = 'env-file';
    else envReport.sources[name] = 'shell-environment';
  }
  return envReport;
};

/**
 * Check that mandatory settings exist. Returns a list of human-readable problems.
 * (Gemini/AssemblyAI/Murf keys are checked when used, so the app can still start
 * and show a precise error for just that feature.)
 */
export const validateRequiredEnv = (env = process.env) => {
  const problems = [];
  if (!env.MONGODB_URI) problems.push('MONGODB_URI is missing.');
  if (!env.JWT_SECRET) problems.push('JWT_SECRET is missing.');
  else if (env.JWT_SECRET.length < 16) problems.push('JWT_SECRET is too short (use 32+ random characters).');
  return problems;
};

/** Redacts credentials from a MongoDB URI for safe logging. */
export const describeMongoUri = (uri = '') => {
  try {
    const url = new URL(uri);
    const dbName = decodeURIComponent(url.pathname.replace(/^\//, '')) || null;
    return { scheme: url.protocol.replace(':', ''), host: url.host, dbInUri: dbName };
  } catch {
    return { scheme: 'unknown', host: 'unparseable URI', dbInUri: null };
  }
};

loadEnv();
