/**
 * ClawLink Store - Messages Slice
 */
import { fetchWithAuth } from './auth';
import type { ClawLinkState, ClawLinkSession, Message, User, Agent, UnreadSummary } from './types';

type SetState = (partial: Partial<ClawLinkState> | ((state: ClawLinkState) => Partial<ClawLinkState>)) => void;
type GetState = () => ClawLinkState;

// cross-HMR message dedup (window-level, survives module reload)
const _processedMsgIds: Set<string> = (window as any).__clawlink_processed_msgs ??= new Set<string>();


export function createMessagesSlice(set: SetState, get: GetState) {
  return {
    setCurrentChat: (user: User, agent: Agent) => set({
      currentChatUser: user,
      currentChatAgent: agent,
      messages: []
    }),

    clearCurrentChat: () => set({
      currentChatUser: null,
      currentChatAgent: null,
      messages: []
    }),

    setMessages: (messages: Message[]) => set({ messages }),

    addMessage: (message: Message) => set((state) => {
      // dedup by id
      if (message.id && state.messages.some(m => m.id === message.id)) return {};
      return { messages: [...state.messages, message] };
    }),

    setSessionLocked: (locked: boolean) => set({ sessionLocked: locked }),

    setWsConnected: (connected: boolean) => set({ wsConnected: connected }),

    setWs: (ws: WebSocket | null) => set({ ws }),

    // handle incoming WebSocket message (unified entry point)
    handleIncomingMessage: (data: Message) => {
      // cross-HMR dedup: process each message only once
      if (data.id) {
        if (_processedMsgIds.has(data.id)) return;
        _processedMsgIds.add(data.id);
        // prevent memory leak, keep last 200
        if (_processedMsgIds.size > 200) {
          const arr = [..._processedMsgIds];
          for (let i = 0; i < arr.length - 100; i++) _processedMsgIds.delete(arr[i]);
        }
      }

      const currentAgentId = get().currentAgent?.id;
      const currentAgent = get().currentAgent;
      const serverUrl = get().serverUrl;
      const currentChatAgentId = get().currentChatAgent?.id;
      const isFromOther = data.fromAgentId !== currentAgentId;

      // only process if message belongs to the currently viewed conversation
      const isFromCurrentChat = data.fromAgentId === currentChatAgentId || data.toAgentId === currentChatAgentId;
      const currentSessionKey = get().currentClawLinkSessionKey;
      const currentSession = currentSessionKey
        ? get().clawLinkSessions.find(s => s.key === currentSessionKey)
        : null;

      if (isFromCurrentChat) {
        if (data.sessionId && currentSession) {
          if (data.sessionId === currentSession.id) {
            get().addMessage(data);
          }
        }
      }

      // update session lastActivity (only if delta > 5s to reduce re-renders)
      if (data.sessionId) {
        const sessions = get().clawLinkSessions;
        const idx = sessions.findIndex(s => s.id === data.sessionId);
        if (idx >= 0) {
          const existing = sessions[idx];
          const newTs = data.timestamp || Date.now();
          if (newTs - (existing.lastActivity || 0) > 5000) {
            const updated = [...sessions];
            updated[idx] = { ...updated[idx], lastActivity: newTs };
            set({ clawLinkSessions: updated });
          }
        } else if (isFromOther) {
          // session not found locally; construct one from message data
          const friendInfo = get().friends.find(f => f.agents?.some(a => a.id === data.fromAgentId));
          if (friendInfo) {
            const newSession = {
              id: data.sessionId,
              key: `clawlink:${friendInfo.friend.id}:${data.fromAgentId}:${data.sessionId}`,
              userId: currentAgentId ? (get().currentUser?.id || '') : '',
              friendUserId: friendInfo.user.id,
              agentId: currentAgentId || '',
              friendAgentId: data.fromAgentId,
              name: (data.content || '').slice(0, 20) || 'New session',
              createdAt: data.timestamp || Date.now(),
              lastActivity: data.timestamp || Date.now(),
              openclawSessionKey: null,
              completed: false,
            };
            set((state) => ({
              clawLinkSessions: [newSession, ...state.clawLinkSessions],
            }));
          }
        }
      }

      // if from peer (ignore NO_REPLY and file-only messages)
      const contentStr = typeof data.content === 'string' ? data.content : '';
      const isFileOnly = /^\s*\[file:\s*[^\]]+\]\s*$/.test(contentStr);
      if (isFromOther && data.content && !contentStr.includes('NO_REPLY') && !isFileOnly) {
        // check session-level or global auto-reply toggle
        const sessionOverride = data.sessionId ? get().sessionAutoReplyOverrides[data.sessionId] : undefined;
        const isAutoReplyEnabled = sessionOverride ? sessionOverride.enabled : get().autoReplyEnabled;
        if (currentAgent && serverUrl && isAutoReplyEnabled) {
          const sessions = get().clawLinkSessions;
          const session = data.sessionId
            ? sessions.find(s => s.id === data.sessionId)
            : sessions.filter(s => s.friendAgentId === data.fromAgentId && !s.completed)
                .sort((a, b) => (b.lastActivity || b.createdAt) - (a.lastActivity || a.createdAt))[0];
          if (session?.completed) return;

          get().handleAutoReply(data.content, data.fromAgentId, undefined, data.sessionId);
        }
      }
    },

    sendMessage: async (content: string, sessionId?: string) => {
      const { currentAgent, currentChatAgent, currentClawLinkSessionKey, friends, serverUrl } = get();
      if (!currentAgent || !currentChatAgent) return false;

      // ensure a session exists: create server-side session if temp or missing
      let actualSessionId = sessionId;
      const needsSession = !actualSessionId && (
        !currentClawLinkSessionKey ||
        (currentClawLinkSessionKey.startsWith('clawlink:') && currentClawLinkSessionKey.includes(':temp_'))
      );

      if (needsSession) {
        // find friend info
        const friendAgentId = currentChatAgent.id;
        const friend = friends.find(f => f.agents?.some(a => a.id === friendAgentId));
        if (friend) {
          try {
            const sessionName = content.length > 20 ? content.substring(0, 20) + '...' : content;
            const res = await fetchWithAuth(get().token, `${serverUrl}/api/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: currentAgent.userId,
                friendUserId: friend.user.id,
                agentId: currentAgent.id,
                friendAgentId,
                name: sessionName,
              }),
            });
            const data = await res.json();
            if (data.success && data.data) {
              actualSessionId = data.data.id;
              const newKey = `clawlink:${friend.friend.id}:${friendAgentId}:${data.data.id}`;
              const newSession: ClawLinkSession = {
                id: data.data.id,
                key: newKey,
                userId: data.data.userId,
                friendUserId: data.data.friendUserId,
                agentId: data.data.agentId,
                friendAgentId: data.data.friendAgentId,
                name: data.data.name || 'New session',
                createdAt: data.data.createdAt,
                lastActivity: data.data.lastActivity,
                openclawSessionKey: data.data.openclawSessionKey || null,
                completed: data.data.completed || false,
              };
              set((state) => ({
                clawLinkSessions: [newSession, ...state.clawLinkSessions],
                currentClawLinkSessionKey: newKey,
              }));
            }
          } catch (e) {
            console.error('[ClawLink] Failed to create server session:', e);
          }
        }
      }

      // send via HTTP
      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromAgentId: currentAgent.id,
            toAgentId: currentChatAgent.id,
            content,
            sessionId: actualSessionId || ''
          })
        });
        const data = await res.json();
        if (data.success) {
          // add to local message list
          get().addMessage(data.data);
          return true;
        }
        return false;
      } catch (e) {
        console.error('Send message error:', e);
        return false;
      }
    },

    loadMessages: async (agentId: string, friendAgentId: string, sessionId?: string) => {
      const { serverUrl } = get();
      try {
        const url = sessionId
          ? `${serverUrl}/api/messages/${agentId}/${friendAgentId}?sessionId=${sessionId}`
          : `${serverUrl}/api/messages/${agentId}/${friendAgentId}`;
        const res = await fetchWithAuth(get().token, url);
        const data = await res.json();
        if (data.success) {
          set({ messages: data.data });

          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    // load unread summary via /api/unread; returns UnreadSummary[] for backward compat
    loadUnreadSummary: async () => {
      const { currentUser, serverUrl } = get();
      if (!currentUser || !serverUrl) return [];

      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/unread?userId=${currentUser.id}`);
        const data = await res.json();
        if (data.success && data.messages) {
          return data.messages as UnreadSummary[];
        }
        return [];
      } catch (e) {
        console.error('[ClawLink] Failed to load unread summary:', e);
        return [];
      }
    },
  };
}
