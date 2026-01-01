// scripts/gen-firebase-config.js
// Generates assets/firebase-runtime-config.js from environment variables.
// Usage: NODE_ENV=production node scripts/gen-firebase-config.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env when running locally (try to import dotenv if available)
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readEnv(prefix, key) {
  return process.env[`${prefix}${key}`] || '';
}

function buildConfig(target) {
  const p = target === 'dev' ? 'FIREBASE_DEV_' : 'FIREBASE_PROD_';
  const keys = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  const cfg = {};
  keys.forEach(k => { cfg[k] = readEnv(p, k); });
  return { env: target, config: cfg };
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function main() {
  // Only use FIREBASE_TARGET ('dev' or 'prod'). Default to 'prod' when not set.
  const env = process.env;
  const target = (env.FIREBASE_TARGET === 'dev' || env.FIREBASE_TARGET === 'prod') ? env.FIREBASE_TARGET : 'dev';
  const outObj = buildConfig(target);
  const outJsonPath = path.join(__dirname, '..', 'assets', 'firebase-runtime-config.json');
  ensureDir(path.dirname(outJsonPath));
  try {
    fs.writeFileSync(outJsonPath, JSON.stringify(outObj, null, 2), 'utf8');
    console.log('Wrote', outJsonPath, 'with env=', outObj.env);
  } catch (e) {
    console.warn('Failed to write json runtime config', e);
  }
}

main();
