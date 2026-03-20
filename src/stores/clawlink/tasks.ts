/**
 * ClawLink Store - Tasks Slice
 */
import { fetchWithAuth } from './auth';
import type { ClawLinkState, TaskResult } from './types';

type SetState = (partial: Partial<ClawLinkState> | ((state: ClawLinkState) => Partial<ClawLinkState>)) => void;
type GetState = () => ClawLinkState;

export function createTasksSlice(set: SetState, get: GetState) {
  return {
    // add task result/conclusion (saves to server)
    addTaskResult: async (result: Omit<TaskResult, 'id' | 'timestamp' | 'read'>) => {
      const { currentUser, serverUrl } = get();
      const newResult: TaskResult = {
        ...result,
        id: `task-${Date.now()}`,
        timestamp: Date.now(),
        read: false,
      };
      // add locally first
      set((state) => ({
        taskResults: [newResult, ...state.taskResults],
        hasUnreadTaskResults: true,
      }));
      // persist to server
      if (currentUser && serverUrl) {
        fetchWithAuth(get().token, `${serverUrl}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newResult.id,
            userId: currentUser.id,
            friendId: result.friendId,
            friendName: result.friendName,
            friendAgentId: result.friendAgentId,
            sessionId: result.sessionId,
            sessionKey: result.sessionKey,
            originalMessage: result.originalMessage,
            conclusion: result.conclusion,
            createdAt: newResult.timestamp,
          }),
        }).catch(e => console.error('[ClawLink] Failed to save task result:', e));
      }
      return newResult;
    },

    // load task results from server
    loadTaskResults: async () => {
      const { currentUser, serverUrl } = get();
      if (!currentUser || !serverUrl) return;
      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/tasks?userId=${currentUser.id}`);
        const data = await res.json();
        if (data.success && data.data) {
          const results: TaskResult[] = data.data.map((r: any) => ({
            id: r.id,
            friendId: r.friendId,
            friendName: r.friendName,
            friendAgentId: r.friendAgentId,
            sessionId: r.sessionId,
            sessionKey: r.sessionKey,
            originalMessage: r.originalMessage,
            conclusion: r.conclusion,
            timestamp: r.createdAt,
            read: true, // server-side items are considered read
          }));
          set({ taskResults: results });
        }
      } catch (e) {
        console.error('[ClawLink] Failed to load task results:', e);
      }
    },

    // mark task result as read (local only)
    markTaskResultRead: (id: string) => {
      set((state) => {
        const updated = state.taskResults.map((t) =>
          t.id === id ? { ...t, read: true } : t
        );
        const hasUnread = updated.some((t) => !t.read);
        return { taskResults: updated, hasUnreadTaskResults: hasUnread };
      });
    },

    // mark all task results as read
    markAllTaskResultsRead: () => {
      set((state) => ({
        taskResults: state.taskResults.map((t) => ({ ...t, read: true })),
        hasUnreadTaskResults: false,
      }));
    },
  };
}
