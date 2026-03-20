/**
 * ClawLink Store - Authentication Slice
 */
import { invokeIpc } from '@/lib/api-client';
import type { ClawLinkState } from './types';

// default server URLs
export const DEFAULT_SERVER_URL = 'https://api.clawlink.live';
export const DEFAULT_WS_URL = 'wss://api.clawlink.live/ws';

// Authenticated fetch helper - adds JWT Bearer token to requests
export function fetchWithAuth(token: string | null, url: string, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options?.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

// load prompts from config (re-read each time for hot-reload)
export async function loadPrompts(): Promise<any> {
  try {
    // always re-read, no cache
    const result = await invokeIpc('clawlink:getPrompts') as any;
    if (result.success && result.prompts) {
      return result.prompts;
    }
  } catch (e) {
    // silently fail
  }

  return null;
}

type SetState = (partial: Partial<ClawLinkState> | ((state: ClawLinkState) => Partial<ClawLinkState>)) => void;
type GetState = () => ClawLinkState;

export function createAuthSlice(set: SetState, get: GetState) {
  // add WS-pushed session to local list (no HTTP); normalize to current user's perspective
  const handleSessionCreated = (sessionData: any) => {
    if (!sessionData?.id) return;
    const existing = get().clawLinkSessions;
    if (existing.some(s => s.id === sessionData.id)) return; // skip if exists

    const myAgentId = get().currentAgent?.id;
    const myUserId = get().currentUser?.id;

    // normalize: ensure agentId is self, friendAgentId is peer
    let agentId = sessionData.agentId || sessionData.agent_id || '';
    let friendAgentId = sessionData.friendAgentId || sessionData.friend_agent_id || '';
    let userId = sessionData.userId || sessionData.user_id || '';
    let friendUserId = sessionData.friendUserId || sessionData.friend_user_id || '';

    // if agentId isn't ours, swap to normalize perspective
    if (myAgentId && agentId !== myAgentId) {
      [agentId, friendAgentId] = [friendAgentId, agentId];
      [userId, friendUserId] = [friendUserId, userId];
    }

    // find friend.id from friends list
    const friendInfo = get().friends.find(f => f.agents?.some(a => a.id === friendAgentId));
    const friendId = friendInfo?.friend?.id || friendUserId;

    const newSession = {
      id: sessionData.id,
      key: `clawlink:${friendId}:${friendAgentId}:${sessionData.id}`,
      userId: userId,
      friendUserId: friendUserId,
      agentId: agentId,
      friendAgentId: friendAgentId,
      name: sessionData.name || '',
      createdAt: sessionData.createdAt || sessionData.created_at || Date.now(),
      lastActivity: sessionData.lastActivity || sessionData.last_activity || Date.now(),
      openclawSessionKey: sessionData.openclawSessionKey || null,
      completed: sessionData.completed || false,
    };
    set({ clawLinkSessions: [newSession, ...existing] });
  };

  // handle session status updates (completed, etc.)
  // delay marking completed to allow conclusion messages and auto-reply to finish
  const _sessionUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const handleSessionUpdated = (data: any) => {
    if (!data?.id || !('completed' in data)) return;

    // cancel previous timer for this session
    const existing = _sessionUpdateTimers.get(data.id);
    if (existing) clearTimeout(existing);

    if (data.completed) {
      // delay marking completed so auto-reply has time to process conclusion and send reply
      const timer = setTimeout(() => {
        _sessionUpdateTimers.delete(data.id);
        const sessions = get().clawLinkSessions;
        const idx = sessions.findIndex(s => s.id === data.id);
        if (idx < 0) return;
        // check if auto-reply is still running
        const locks = (window as any).__clawlink_session_ar_locks as Map<string, number> | undefined;
        if (locks?.has(data.id)) {
          // still running, wait another 7s
          _sessionUpdateTimers.set(data.id, setTimeout(() => {
            _sessionUpdateTimers.delete(data.id);
            const s = get().clawLinkSessions;
            const i = s.findIndex(ss => ss.id === data.id);
            if (i >= 0) {
              const u = [...s];
              u[i] = { ...u[i], completed: true };
              set({ clawLinkSessions: u });
            }
          }, 7_000));
          return;
        }
        const updated = [...sessions];
        updated[idx] = { ...updated[idx], completed: true };
        set({ clawLinkSessions: updated });
      }, 7_000);
      _sessionUpdateTimers.set(data.id, timer);
    } else {
      // un-complete (reactivate), apply immediately
      const sessions = get().clawLinkSessions;
      const idx = sessions.findIndex(s => s.id === data.id);
      if (idx < 0) return;
      const updated = [...sessions];
      updated[idx] = { ...updated[idx], completed: false };
      set({ clawLinkSessions: updated });
    }
  };

  // reusable WebSocket connection function
  const connectWs = (agentId: string) => {
    const { wsUrl } = get();
    // close old connections (including stale HMR leftovers)
    const oldWs = get().ws;
    if (oldWs) {
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.close();
    }
    const globalOldWs = (window as any).__clawlink_ws;
    if (globalOldWs && globalOldWs !== oldWs) {
      globalOldWs.onclose = null;
      globalOldWs.onerror = null;
      globalOldWs.close();
    }

    const ws = new WebSocket(wsUrl);
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;

    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    };

    const cleanup = () => {
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
    };

    const reconnect = () => {
      const { currentAgent, wsUrl: reconnectWsUrl } = get();
      if (!currentAgent || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) { cleanup(); return; }
      reconnectAttempts++;

      const newWs = new WebSocket(reconnectWsUrl);
      newWs.onopen = () => {
        reconnectAttempts = 0;
        newWs.send(JSON.stringify({ type: 'register', agentId: currentAgent.id }));
        set({ wsConnected: true, ws: newWs });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(sendHeartbeat, 30000);
        // Catch-up after reconnect: load friends + check unread
        get().loadFriends();
        get().loadUnreadSummary().then(summaries => {
          if (!summaries?.length) return;
          for (const s of summaries) {
            if (s.lastMessage && s.lastMessage.fromAgentId === s.friendAgentId && !s.lastMessage.content?.includes('NO_REPLY')) {
              // handleAutoReply manages its own locking and queueing
              get().handleAutoReply(s.lastMessage.content, s.friendAgentId, undefined, s.lastMessage.sessionId);
            }
          }
        }).catch(() => {});
      };
      newWs.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'message') { get().handleIncomingMessage(msg.data); }
        else if (msg.type === 'friend_request' || msg.type === 'friend_update') { get().loadFriends(); }
        else if (msg.type === 'session_created') { handleSessionCreated(msg.data); }
        else if (msg.type === 'session_updated') { handleSessionUpdated(msg.data); }
      };
      newWs.onclose = () => {
        set({ wsConnected: false });
        if (get().currentAgent && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
          reconnectTimeout = setTimeout(reconnect, delay);
        }
      };
      newWs.onerror = () => { set({ wsConnected: false }); };
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', agentId: agentId }));
      set({ wsConnected: true });
      heartbeatInterval = setInterval(sendHeartbeat, 30000);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'message') { get().handleIncomingMessage(msg.data); }
      else if (msg.type === 'friend_request' || msg.type === 'friend_update') { get().loadFriends(); }
      else if (msg.type === 'session_created') { handleSessionCreated(msg.data); }
      else if (msg.type === 'session_updated') { handleSessionUpdated(msg.data); }
    };
    ws.onclose = () => {
      set({ wsConnected: false });
      cleanup();
      if (get().currentAgent) { reconnectTimeout = setTimeout(reconnect, 5000); }
    };
    ws.onerror = () => { set({ wsConnected: false }); };
    (window as any).__clawlink_ws = ws;
    set({ ws });
  };

  return {
    // exposed for rehydration
    connectWebSocket: (agentId: string) => connectWs(agentId),
    setServerUrl: (url: string) => {
      // strip trailing slash
      let httpUrl = url.replace(/\/$/, '');

      // WS uses same host, path /ws
      let wsUrl = httpUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';

      set({ serverUrl: httpUrl, wsUrl });
    },

    setCredentials: (user: ClawLinkState['currentUser'], agent: ClawLinkState['currentAgent'], apiKey: string) => {
      set({ currentUser: user, currentAgent: agent, apiKey });
    },

    clearCredentials: () => {
      set({
        currentUser: null,
        currentAgent: null,
        apiKey: null,
        token: null,
        friends: [],
        currentChatAgent: null,
        currentChatUser: null,
        messages: [],
        wsConnected: false,
      });
      const ws = get().ws;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      set({ ws: null });
    },

    logout: () => {
      // clear user state first so reconnect logic detects logout and stops
      set({
        currentUser: null,
        currentAgent: null,
        apiKey: null,
        token: null,
        friends: [],
        currentChatAgent: null,
        currentChatUser: null,
        messages: [],
        wsConnected: false,
      });
      // close WS (onclose won't reconnect since currentAgent is null)
      const ws = get().ws;
      if (ws) {
        ws.onclose = null; // prevent reconnect
        ws.onerror = null;
        ws.close();
      }
      set({ ws: null });
    },

    testConnection: async () => {
      const { serverUrl } = get();
      try {
        const res = await fetch(`${serverUrl}/health`);
        const data = await res.json();
        return data.status === 'ok';
      } catch {
        return false;
      }
    },

    register: async (username: string, displayName: string, company: string, bio: string, password: string, email?: string) => {
      const { serverUrl } = get();
      try {
        const res = await fetch(`${serverUrl}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, displayName, company, bio, password, email: email || '' })
        });
        const data = await res.json();
        if (data.success) {
          const { user, agent, apiKey, token } = data.data;
          set({ currentUser: user, currentAgent: agent, apiKey, token });

          // save user info locally for skill scripts
          invokeIpc('clawlink:saveCurrentUser', {
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            agentId: agent.id,
            agentName: agent.name,
            serverUrl,
            apiKey,
            token,
          }).catch((err: any) => {
            console.error('[ClawLink] Failed to save user info:', err);
          });

          // initialize prompts directory
          invokeIpc('clawlink:getPrompts').catch((err: any) => {
            console.error('[ClawLink] Failed to init prompts:', err);
          });

          connectWs(agent.id);
          get().loadFriends();
          get().startGlobalPolling();
          return true;
        }
        console.error('Register failed:', data.error);
        return false;
      } catch (e) {
        console.error('Register error:', e);
        return false;
      }
    },

    login: async (username: string, password: string) => {
      const { serverUrl } = get();
      try {
        const res = await fetch(`${serverUrl}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
          const { user, agents, apiKey, token } = data.data;
          const agent = agents[0];
          set({ currentUser: user, currentAgent: agent, apiKey, token });

          invokeIpc('clawlink:saveCurrentUser', {
            userId: user.id, username: user.username, displayName: user.displayName,
            agentId: agent.id, agentName: agent.name, serverUrl, apiKey, token,
          }).catch(() => {});

          invokeIpc('clawlink:getPrompts').catch(() => {});

          connectWs(agent.id);
          get().loadFriends();
          get().startGlobalPolling();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  };
}
