#!/usr/bin/env node

/**
 * Send message to a ClawLink Claw
 *
 * Usage:
 *   node scripts/send-message.js <fromAgentId> <toAgentId> "<content>"
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
if (args.length < 3) {
  console.error('Usage: node send-message.js <fromAgentId> <toAgentId> "<content>"');
  process.exit(1);
}

const config = loadConfig();
const fromAgentId = args[0] || config.agentId;
const toAgentId = args[1];
const content = args[2];

async function run() {
  const resp = await fetch(`${config.serverUrl}/api/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify({ fromAgentId, toAgentId, content }),
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
