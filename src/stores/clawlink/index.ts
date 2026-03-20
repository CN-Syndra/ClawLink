/**
 * ClawLink Store — main entry point
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SERVER_URL, DEFAULT_WS_URL } from './auth';
import { createAuthSlice } from './auth';
import { createFriendsSlice } from './friends';
import { createMessagesSlice } from './messages';
import { createSessionsSlice } from './sessions';
import { createTasksSlice } from './tasks';
import { createAutoReplySlice } from './auto-reply';
import type { ClawLinkState } from './types';

export type {
  User, Agent, Friend, Message, TaskResult,
  ClawLinkSession, UnreadSummary, PendingFriendRequest, ClawLinkState,
} from './types';

export const useClawLinkStore = create<ClawLinkState>()(
  persist(
    (set, get) => ({
      serverUrl: DEFAULT_SERVER_URL,
      wsUrl: DEFAULT_WS_URL,
      currentUser: null,
      currentAgent: null,
      apiKey: null,
      token: null,
      friends: [],
      currentChatAgent: null,
      currentChatUser: null,
      messages: [],
      wsConnected: false,
      ws: null,
      autoReplying: false,
      autoReplyStep: 'idle' as const,
      autoReplySteps: {},
      _pendingAIReplies: {},
      _pendingAIReply: null,
      autoReplyEnabled: true,
      autoReplyMode: 'auto' as const,
      sessionAutoReplyOverrides: {},
      customForbiddenRules: typeof localStorage !== 'undefined' ? (localStorage.getItem('clawlink:customForbiddenRules') || '').replace('__empty__', '') : '',
      customAuthRules: typeof localStorage !== 'undefined' ? (localStorage.getItem('clawlink:customAuthRules') || '').replace('__empty__', '') : '',
      pendingReviewReply: null,
      pendingOwnerRequest: null,
      sessionLocked: false,
      currentClawLinkSessionKey: null,
      taskResults: [],
      hasUnreadTaskResults: false,
      clawLinkSessions: [],
      lastProcessedMessageTimestamp: 0,

      ...createAuthSlice(set, get),
      ...createFriendsSlice(set, get),
      ...createMessagesSlice(set, get),
      ...createSessionsSlice(set, get),
      ...createTasksSlice(set, get),
      ...createAutoReplySlice(set, get),
    }),
    {
      name: 'clawlink-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentAgent: state.currentAgent,
        apiKey: state.apiKey,
        token: state.token,
      }),
    }
  )
);

// Post-hydration init (runs after zustand persist finishes restoring from localStorage)
// window-level flag to prevent duplicate init on HMR (module-level flag resets on HMR)
const _initDone = { get value() { return (window as any).__clawlink_init_done ?? false; }, set value(v: boolean) { (window as any).__clawlink_init_done = v; } };

function onStoreReady() {
  if (_initDone.value) return;
  _initDone.value = true;

  const store = useClawLinkStore.getState();

  if (store.serverUrl) {
    const wsUrl = store.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    useClawLinkStore.setState({ wsUrl });
  }

  if (!store.currentUser) return;

  // older persisted data may lack token; don't logout (API calls fail but login state preserved)
  // only logout on explicit 401

  if (store.currentAgent) {
    (async () => {
      try {
        // step 1: verify user still exists in DB via /api/me
        // covers case where JWT secret unchanged but DB was rebuilt
        // only logout on 401; degrade gracefully on other errors
        try {
          const { fetchWithAuth } = await import('./auth');
          const meRes = await fetchWithAuth(store.token, `${store.serverUrl}/api/me`);
          if (meRes.status === 401) {
            store.logout();
            return;
          }
        } catch {
          // network errors don't affect login, degrade gracefully
        }

        // step 2: load friends list
        const s = useClawLinkStore.getState();
        if (!s.currentAgent) return; // logout may have been triggered above
        const result = await s.loadFriends();
        const s2 = useClawLinkStore.getState();
        if (!s2.currentAgent) return;

        if (result === false) {
          s2.logout();
          return;
        }

        s2.connectWebSocket(s2.currentAgent.id);
        s2.startGlobalPolling();
      } catch { /* ignore */ }
    })();
  }
}

const checkHydrated = setInterval(() => {
  if ((useClawLinkStore as any).persist?.hasHydrated?.()) {
    clearInterval(checkHydrated);
    onStoreReady();
  }
}, 50);

setTimeout(() => { clearInterval(checkHydrated); onStoreReady(); }, 2000);
