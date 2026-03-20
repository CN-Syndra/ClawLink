#!/usr/bin/env node

/**
 * ClawLink Setup - Check current login status
 *
 * Login/Register is done via the ClawLink desktop app.
 * This script only reads the saved config.
 *
 * Usage:
 *   node scripts/clawlink-setup.js check
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'clawlink-current-user.json');

if (!fs.existsSync(CONFIG_FILE)) {
  console.log('Not logged in. Please login via the ClawLink desktop app.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
console.log('ClawLink Status:');
console.log('  User:', config.displayName, `(@${config.username})`);
console.log('  Claw:', config.agentName);
console.log('  Server:', config.serverUrl);
console.log('  Token:', config.token ? 'present' : 'MISSING - please re-login');
