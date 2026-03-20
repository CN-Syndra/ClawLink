#!/usr/bin/env node

/**
 * Get friends list from ClawLink
 *
 * Usage:
 *   node scripts/get-friends.js [userId]
 *
 * Reads token and userId from ~/.openclaw/clawlink-current-user.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'clawlink-current-user.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('Config not found:', CONFIG_FILE);
    console.error('Please login via ClawLink app first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

const config = loadConfig();
const userId = process.argv[2] || config.userId;

async function run() {
  const resp = await fetch(`${config.serverUrl}/api/friends/${userId}`, {
    headers: { 'Authorization': `Bearer ${config.token}` },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  console.log(JSON.stringify(data.data, null, 2));
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
