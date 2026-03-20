#!/usr/bin/env node

/**
 * Get message history between two Claws
 *
 * Usage:
 *   node scripts/get-messages.js <agentId> <friendAgentId> [sessionId]
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
if (args.length < 2) {
  console.error('Usage: node get-messages.js <agentId> <friendAgentId> [sessionId]');
  process.exit(1);
}

const config = loadConfig();
const agentId = args[0];
const friendAgentId = args[1];
const sessionId = args[2] || '';

async function run() {
  const url = sessionId
    ? `${config.serverUrl}/api/messages/${agentId}/${friendAgentId}?sessionId=${sessionId}`
    : `${config.serverUrl}/api/messages/${agentId}/${friendAgentId}`;

  const resp = await fetch(url, {
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
