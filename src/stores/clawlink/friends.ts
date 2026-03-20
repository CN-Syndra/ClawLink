/**
 * ClawLink Store - Friends Slice
 */
import { fetchWithAuth } from './auth';
import type { ClawLinkState, Friend } from './types';

type SetState = (partial: Partial<ClawLinkState> | ((state: ClawLinkState) => Partial<ClawLinkState>)) => void;
type GetState = () => ClawLinkState;

export function createFriendsSlice(set: SetState, get: GetState) {
  return {
    setFriends: (friends: Friend[]) => set({ friends }),

    addFriend: (friend: Friend) => set((state) => ({
      friends: [...state.friends, friend]
    })),

    updateFriend: (friendId: string, status: 'accepted' | 'rejected') => set((state) => ({
      friends: state.friends.map(f =>
        f.friend.id === friendId
          ? { ...f, friend: { ...f.friend, status } }
          : f
      )
    })),

    addFriendRequest: async (targetUsername: string) => {
      const { currentUser, serverUrl } = get();
      if (!currentUser) return false;

      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/friends`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            targetUsername
          })
        });
        const data = await res.json();
        if (data.success) {
          const friend = data.data.friend;
          const targetUser = data.data.targetUser;
          const targetAgents = data.data.targetAgents;

          // add to list temporarily (pending peer confirmation)
          get().addFriend({
            friend,
            user: targetUser,
            agents: targetAgents
          });
          return true;
        }
        console.error('Add friend failed:', data.error);
        return false;
      } catch (e) {
        console.error('Add friend error:', e);
        return false;
      }
    },

    loadFriends: async (): Promise<boolean | 'network_error'> => {
      const { currentUser, serverUrl } = get();
      if (!currentUser) return false;

      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/friends/${currentUser.id}`);
        if (res.status === 401) return false;
        const data = await res.json();
        if (data.success) {
          set({ friends: data.data });
          return true;
        }
        return 'network_error';
      } catch {
        return 'network_error';
      }
    },

    acceptFriend: async (friendId: string) => {
      const { serverUrl } = get();
      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/friends/${friendId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted' })
        });
        const data = await res.json();
        if (data.success) {
          get().updateFriend(friendId, 'accepted');
          return true;
        }
        return false;
      } catch (e) {
        console.error('Accept friend error:', e);
        return false;
      }
    },

    rejectFriend: async (friendId: string) => {
      const { serverUrl } = get();
      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/friends/${friendId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected' })
        });
        const data = await res.json();
        if (data.success) {
          get().updateFriend(friendId, 'rejected');
          return true;
        }
        return false;
      } catch (e) {
        console.error('Reject friend error:', e);
        return false;
      }
    },

    deleteFriend: async (friendId: string) => {
      const { serverUrl } = get();
      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/friends/${friendId}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) {
          set((state) => ({
            friends: state.friends.filter(f => f.friend.id !== friendId),
          }));
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    searchUsers: async (query: string) => {
      const { serverUrl } = get();
      try {
        const res = await fetchWithAuth(get().token, `${serverUrl}/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success) {
          return data.data.map((r: any) => r.user);
        }
        return [];
      } catch (e) {
        console.error('Search users error:', e);
        return [];
      }
    },
  };
}
