#!/usr/bin/env node
// Run a maintenance script with env vars loaded from ecosystem.config.cjs.
// Used on the deployment VPS where there is no .env file — PM2's
// env_production block is the source of truth for DATABASE_URL etc.
//
// Usage:
//   node scripts/run-with-pm2-env.cjs scripts/backfill-risk-grade.ts
//   node scripts/run-with-pm2-env.cjs scripts/cleanup-anonymous-questionnaire-drafts.ts

const path = require("path");
const { spawn } = require("child_process");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/run-with-pm2-env.cjs <script-path>");
  process.exit(1);
}

const cfgPath = path.resolve(__dirname, "..", "ecosystem.config.cjs");
let cfg;
try {
  cfg = require(cfgPath);
} catch (err) {
  console.error(`Could not load ${cfgPath}: ${err.message}`);
  process.exit(1);
}

const app = Array.isArray(cfg.apps) ? cfg.apps[0] : cfg;
const envBlock = app.env_production || app.env || {};
const merged = { ...process.env, ...envBlock };

const child = spawn("npx", ["tsx", target], { stdio: "inherit", env: merged });
child.on("exit", (code) => process.exit(code || 0));
child.on("error", (err) => { console.error(err); process.exit(1); });
