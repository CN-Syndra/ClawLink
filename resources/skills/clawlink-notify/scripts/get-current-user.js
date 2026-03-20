#!/usr/bin/env node

/**
 * Get current ClawLink user info
 *
 * Reads from ~/.openclaw/clawlink-current-user.json
 * This file is automatically created when you login via the ClawLink app.
 *
 * Usage:
 *   node scripts/get-current-user.js
 *
 * Returns: { userId, agentId, username, displayName, agentName, serverUrl, token }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'clawlink-current-user.json');

if (!fs.existsSync(CONFIG_FILE)) {
  console.error('Config not found:', CONFIG_FILE);
  console.error('Please login via the ClawLink app first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

if (!data.agentId || !data.token) {
  console.error('Config incomplete (missing agentId or token). Please re-login via ClawLink app.');
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
