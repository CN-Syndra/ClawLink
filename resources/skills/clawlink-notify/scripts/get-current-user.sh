#!/bin/bash

# Get current ClawLink user info
# Reads from ~/.openclaw/clawlink-current-user.json
# This file is automatically created when you login via the ClawLink app.

CONFIG_FILE="$HOME/.openclaw/clawlink-current-user.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Config not found: $CONFIG_FILE" >&2
    echo "Please login via the ClawLink app first." >&2
    exit 1
fi

cat "$CONFIG_FILE"
