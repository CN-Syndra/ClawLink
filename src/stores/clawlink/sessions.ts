/**
 * ClawLink Store - Sessions Slice
 */
import { fetchWithAuth } from './auth';
import type { ClawLinkState, ClawLinkSession, Friend } from './types';

type SetState = (partial: Partial<ClawLinkState> | ((state: ClawLinkState) => Partial<ClawLinkState>)) => void;
type GetState = () => ClawLinkState;

export function createSessionsSlice(set: SetState, get: GetState) {
  return {
    // load sessions from server
    loadClawLinkSessions: async () => {
      const { currentUser, currentAgent, serverUrl } = get();
      if (!currentUser || !currentAgent) return;

      try {
        // fetch sessions by iterating all friends
        const friends = get().friends;
        const allSessions: ClawLinkSession[] = [];

        for (const friend of friends) {
          if (friend.friend.status !== 'accepted' || friend.agents.length === 0) continue;

          const friendUserId = friend.user.id;
          const friendAgentId = friend.agents[0].id;

          const res = await fetchWithAuth(get().token,
            `${serverUrl}/api/sessions?userId=${currentUser.id}&friendUserId=${friendUserId}&agentId=${currentAgent.id}&friendAgentId=${friendAgentId}`
          );
          const data = await res.json();

          if (data.success && data.data && data.data.length > 0) {
            // convert to local format (normalized to current user's perspective)
            for (const session of data.data) {
              // dedup by sessionId
              if (allSessions.some(s => s.id === session.id)) continue;
              allSessions.push({
                id: session.id,
                key: `clawlink:${friend.friend.id}:${friendAgentId}:${session.id}`,
                // normalize: always from current user's perspective regardless of creator
                userId: currentUser.id,
                friendUserId: friendUserId,
                agentId: currentAgent.id,
                friendAgentId: friendAgentId,
                name: session.name || 'New session',
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                openclawSessionKey: session.openclawSessionKey || null,
                completed: session.completed || false,
              });
            }
          }
        }

        // merge instead of replace: preserve local state not yet synced to server
        set((state) => {
          const localMap = new Map(state.clawLinkSessions.map(s => [s.id, s]));
          const merged = allSessions.map(s => {
            const local = localMap.get(s.id);
            if (!local) return s;
            return {
              ...s,
              // preserve local openclawSessionKey (may not be synced yet)
              openclawSessionKey: local.openclawSessionKey || s.openclawSessionKey,
              // preserve local completed state
              completed: local.completed || s.completed,
            };
          });
          return { clawLinkSessions: merged };
        });
      } catch (e) {
        console.error('[ClawLink] Failed to load sessions:', e);
      }
    },

    // create new session via server API
    createClawLinkSession: async (friend: Friend) => {
      const { currentUser, currentAgent, serverUrl } = get();
      if (!currentUser || !currentAgent) {
        throw new Error('Not logged in');
      }

      const friendUserId = friend.user.id;
      const friendAgentId = friend.agents[0]?.id;
      if (!friendAgentId) {
        throw new Error('Friend has no AI agent');
      }

      try {
        // call server API to create session
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            friendUserId: friendUserId,
            agentId: currentAgent.id,
            friendAgentId: friendAgentId,
          }),
        });
        const data = await res.json();

        if (data.success && data.data) {
          const serverSession = data.data;
          const newSession: ClawLinkSession = {
            id: serverSession.id,
            key: `clawlink:${friend.friend.id}:${friendAgentId}:${serverSession.id}`,
            userId: serverSession.userId,
            friendUserId: serverSession.friendUserId,
            agentId: serverSession.agentId,
            friendAgentId: serverSession.friendAgentId,
            name: serverSession.name || 'New session',
            createdAt: serverSession.createdAt,
            lastActivity: serverSession.lastActivity,
            openclawSessionKey: serverSession.openclawSessionKey || null,
            completed: serverSession.completed || false,
          };

          set((state) => ({
            clawLinkSessions: [newSession, ...state.clawLinkSessions],
            currentClawLinkSessionKey: newSession.key,
          }));

          return newSession;
        } else {
          throw new Error(data.error || 'Failed to create session');
        }
      } catch (e) {
        console.error('[ClawLink] Failed to create session:', e);
        throw e;
      }
    },

    // switch active session
    switchClawLinkSession: (sessionKey: string) => {
      const state = get();
      const session = state.clawLinkSessions.find(s => s.key === sessionKey);

      if (session) {
        const updatedSessions = state.clawLinkSessions.map(s =>
          s.key === sessionKey ? { ...s, lastActivity: Date.now() } : s
        );
        set({
          currentClawLinkSessionKey: sessionKey,
          clawLinkSessions: updatedSessions,
        });
      } else if (sessionKey.includes(':temp_')) {
        // temp session (not yet saved to server)
        set({ currentClawLinkSessionKey: sessionKey });
      }
    },

    // delete session via server API
    deleteClawLinkSession: async (sessionKey: string) => {
      const { serverUrl } = get();
      const state = get();
      const session = state.clawLinkSessions.find(s => s.key === sessionKey);
      if (!session) return;

      try {
        // delete via server API using sessionId in path
        const res = await fetchWithAuth(get().token,
          `${serverUrl}/api/sessions/${session.id}`,
          { method: 'DELETE' }
        );
        const data = await res.json();

        if (data.success) {
          set((state) => {
            const newSessions = state.clawLinkSessions.filter(s => s.key !== sessionKey);
            const newCurrentKey = state.currentClawLinkSessionKey === sessionKey
              ? (newSessions[0]?.key || null)
              : state.currentClawLinkSessionKey;
            return {
              clawLinkSessions: newSessions,
              currentClawLinkSessionKey: newCurrentKey,
            };
          });
        }
      } catch (e) {
        console.error('[ClawLink] Failed to delete session:', e);
      }
    },

    // update session name (also syncs to server)
    updateClawLinkSessionName: async (sessionKey: string, name: string) => {
      const { serverUrl, clawLinkSessions } = get();
      const session = clawLinkSessions.find(s => s.key === sessionKey);

      set((state) => ({
        clawLinkSessions: state.clawLinkSessions.map(s =>
          s.key === sessionKey ? { ...s, name } : s
        )
      }));

      // sync to server if session has server ID
      if (session?.id && serverUrl) {
        try {
          const res = await fetchWithAuth(get().token, `${serverUrl}/api/sessions/${session.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          });
          const data = await res.json();
          if (!data.success) {
            console.error('[ClawLink] Failed to save session name:', data.error);
          }
        } catch (e) {
          console.error('[ClawLink] Failed to sync session name to server:', e);
        }
      }
    },

    // update OpenCLAW session binding
    updateClawLinkSessionOpenCLAWSessionKey: async (sessionKey: string, openclawSessionKey: string) => {
      const { serverUrl, clawLinkSessions } = get();
      const session = clawLinkSessions.find(s => s.key === sessionKey);

      set((state) => ({
        clawLinkSessions: state.clawLinkSessions.map(s =>
          s.key === sessionKey ? { ...s, openclawSessionKey } : s
        )
      }));

      // sync to server if session has server ID
      if (session?.id && serverUrl) {
        try {
          const res = await fetchWithAuth(get().token, `${serverUrl}/api/sessions/${session.id}/openclaw`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ openclawSessionKey })
          });
          const data = await res.json();
          if (!data.success) {
            console.error('[ClawLink] Failed to save OpenCLAW binding:', data.error);
          }
        } catch (e) {
          console.error('[ClawLink] Failed to sync OpenCLAW binding to server:', e);
        }
      }
    },

    // update session completed status
    updateClawLinkSessionCompleted: async (sessionKey: string, completed: boolean) => {
      const { serverUrl, clawLinkSessions } = get();
      const session = clawLinkSessions.find(s => s.key === sessionKey);

      set((state) => ({
        clawLinkSessions: state.clawLinkSessions.map(s =>
          s.key === sessionKey ? { ...s, completed } : s
        ),
      }));

      // sync to server if session has server ID
      if (session?.id && serverUrl) {
        try {
          const res = await fetchWithAuth(get().token, `${serverUrl}/api/sessions/${session.id}/completed`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
          });
          const data = await res.json();
          if (!data.success) {
            console.error('[ClawLink] Failed to save session completed status:', data.error);
          }
        } catch (e) {
          console.error('[ClawLink] Failed to sync completed status to server:', e);
        }
      }
    },
  };
}
