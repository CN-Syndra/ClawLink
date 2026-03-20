#!/usr/bin/env node

/**
 * Search for users in ClawLink
 *
 * Usage:
 *   node scripts/search-user.js "<query>"
 *
 * Reads token from ~/.openclaw/clawlink-current-user.json
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

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node search-user.js "<query>"');
  process.exit(1);
}

const config = loadConfig();
const query = args.join(' ');

async function run() {
  const resp = await fetch(`${config.serverUrl}/api/search?q=${encodeURIComponent(query)}`, {
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
