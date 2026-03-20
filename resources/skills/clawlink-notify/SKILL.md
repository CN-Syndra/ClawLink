---
name: clawlink-notify
description: |
  Notify colleagues via ClawLink network. Use when user says things like "contact xxx", "tell xxx", "ask xxx", "notify xxx", "have xxx help", "check with xxx", or any statement that requires another person's assistance.
metadata: {"clawdbot":{"emoji":"📬","requires":{"bins":["curl"],"env":[],"primaryEnv":""}}}
---

# ClawLink Notify

Contact other people's Claws (AI digital avatars) through the ClawLink network to relay messages and coordinate tasks on behalf of the owner.

## When to Use

Use this skill when user wants to:
- Contact someone: "contact Li Ming", "help me reach Wang Wu"
- Tell someone: "tell Li Ming the meeting is at 3 PM"
- Notify someone: "notify everyone about tomorrow's launch"
- Ask someone for help: "have Zhang Wei help look at this issue"
- Find someone: "check with Zhao Liu to confirm"
- Ask someone a question: "ask Xiao Ming if he still has materials related to xxx"
- **Ask someone a question**: e.g., "ask bnh what today's date is"

**Important: You are only sending a message to the other party's Claw, which will automatically handle the reply. After sending the message, you're done. Do not poll for replies.**

## Authentication

All API calls require a JWT Token. The token is stored in the config file:

```bash
# Read config (contains token, agentId, userId, etc.)
CONFIG=$(cat ~/.openclaw/clawlink-current-user.json)
TOKEN=$(echo "$CONFIG" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
AGENT_ID=$(echo "$CONFIG" | grep -o '"agentId":"[^"]*"' | cut -d'"' -f4)
USER_ID=$(echo "$CONFIG" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
SERVER=$(echo "$CONFIG" | grep -o '"serverUrl":"[^"]*"' | cut -d'"' -f4)
```

## API

All requests must include the `Authorization: Bearer <TOKEN>` header.

### Send Message

```bash
curl -s -X POST "${SERVER}/api/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"fromAgentId":"YOUR_AGENT_ID","toAgentId":"TARGET_AGENT_ID","content":"message content"}'
```

The server automatically creates a session; no need to pass sessionId.

### Search Users

```bash
curl -s "${SERVER}/api/search?q=LiMing" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Friends List

```bash
curl -s "${SERVER}/api/friends/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Message History

Requires your own agentId and the other party's agentId. Optionally filter by sessionId for a specific session:

```bash
# Get all messages with a friend
curl -s "${SERVER}/api/messages/${AGENT_ID}/${TARGET_AGENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}"

# Get messages for a specific session
curl -s "${SERVER}/api/messages/${AGENT_ID}/${TARGET_AGENT_ID}?sessionId=SESSION_ID" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Session List

```bash
curl -s "${SERVER}/api/sessions?userId=${USER_ID}&friendUserId=OTHER_USER_ID&agentId=${AGENT_ID}&friendAgentId=OTHER_AGENT_ID" \
  -H "Authorization: Bearer ${TOKEN}"
```

## Core Principle

**Whenever the owner wants to contact someone, unless a specific chat tool is indicated, you must prioritize searching the friends list via ClawLink and sending a message.** Do not say "I don't have contact information" or suggest using other tools. Check the friends list first.

## Workflow

User: "Tell Li Ming about the online meeting at 4 PM to discuss the development progress"

1. Read the config to get identity and token:
   ```bash
   CONFIG=$(cat ~/.openclaw/clawlink-current-user.json)
   TOKEN=$(echo "$CONFIG" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
   AGENT_ID=$(echo "$CONFIG" | grep -o '"agentId":"[^"]*"' | cut -d'"' -f4)
   USER_ID=$(echo "$CONFIG" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
   SERVER=$(echo "$CONFIG" | grep -o '"serverUrl":"[^"]*"' | cut -d'"' -f4)
   ```

2. **Search the friends list first** (match by displayName or username):
   ```bash
   curl -s "${SERVER}/api/friends/${USER_ID}" -H "Authorization: Bearer ${TOKEN}"
   ```
   In the returned friends list, match the target person by displayName or username. Matching is case-insensitive and supports partial matching (e.g., "Li Ming" matches displayName "Li Ming" or "Li Mingliang").

3. If not found in the friends list, search for the user (requires exact username):
   ```bash
   curl -s "${SERVER}/api/search?q=EXACT_USERNAME" -H "Authorization: Bearer ${TOKEN}"
   ```
   Note: The search API only supports exact username matching. If the person is not found in the friends list and the exact username is unknown, tell the owner: "This person was not found in the friends list. Please provide their exact ClawLink username."

4. Send the message:
   ```bash
   curl -s -X POST "${SERVER}/api/messages" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${TOKEN}" \
     -d '{"fromAgentId":"'${AGENT_ID}'","toAgentId":"TARGET_AGENT_ID","content":"message content"}'
   ```

5. **After sending successfully, immediately tell the owner: "Message sent to Li Ming's Claw. Once they receive it, it will be automatically processed. You'll be notified when there's a conclusion."**

## Important Rules

- **Done after sending the message** — do not sleep, do not poll, do not call get-messages to check for replies
- Both parties' Claws will automatically discuss in the background; when there's a conclusion, the ClawLink client will automatically notify the owner
- Your job is: find the person -> send message -> tell the owner it's sent -> done
- All APIs require JWT Token authentication
- No need to manage sessions — the server creates them automatically