/**
 * ClawLink Store - Type Definitions
 */

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  company: string;
  bio: string;
  avatar: string;
  createdAt: number;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  channels: string[];
  status: 'online' | 'offline';
  lastSeen: number;
}

export interface Friend {
  friend: {
    id: string;
    userId: string;
    friendUserId: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: number;
    updatedAt: number;
  };
  user: User;
  agents: Agent[];
}

export interface Message {
  id: string;
  sessionId?: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  type: 'text' | 'system' | 'action';
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read';
}

export interface TaskResult {
  id: string;
  friendId: string;
  friendName: string;
  friendAgentId: string;
  sessionId: string;          // for navigation
  sessionKey: string;         // local key for navigation
  originalMessage: string;    // original topic/message
  conclusion: string;
  timestamp: number;
  read: boolean;
}

// server-side ClawLink session
export interface ClawLinkSession {
  id: string;
  key: string;                 // local key: clawlink:{friendId}:{friendAgentId}:{sessionId}
  userId: string;
  friendUserId: string;
  agentId: string;
  friendAgentId: string;
  name: string;
  createdAt: number;
  lastActivity: number;
  openclawSessionKey: string | null;  // bound OpenCLAW session key
  completed: boolean;           // if true, no longer forwarded to AI
}

// unread message summary (from server)
export interface UnreadSummary {
  friendUserId: string;
  friendUser?: User;
  agentId: string;
  friendAgentId: string;
  sessionId: string;
  lastMessage?: Message;
  timestamp: number;
}

// pending friend request (from server)
export interface PendingFriendRequest {
  friendId: string;
  userId: string;
  friendUserId: string;
  friendUser?: User;
  status: string;
  createdAt: number;
}

export interface ClawLinkState {
  serverUrl: string;
  wsUrl: string;

  currentUser: User | null;
  currentAgent: Agent | null;
  apiKey: string | null;
  token: string | null;

  friends: Friend[];

  currentChatAgent: Agent | null;
  currentChatUser: User | null;
  messages: Message[];

  wsConnected: boolean;
  ws: WebSocket | null;

  autoReplying: boolean;
  // global auto-reply step (compat with legacy logic)
  autoReplyStep: 'idle' | 'received' | 'forwarding' | 'thinking' | 'replying' | 'reviewing';
  // per-session steps (key = sessionId or fromAgentId)
  autoReplySteps: Record<string, 'idle' | 'received' | 'forwarding' | 'thinking' | 'replying' | 'reviewing'>;
  // gateway-pushed AI replies (per-session, key = openclawSessionKey)
  _pendingAIReplies: Record<string, string>;
  // legacy compat
  _pendingAIReply: string | null;
  // global auto-reply toggle
  autoReplyEnabled: boolean;
  // global auto-reply mode
  autoReplyMode: 'auto' | 'review' | 'service';
  // per-session overrides (takes priority over global)
  sessionAutoReplyOverrides: Record<string, { enabled: boolean; mode: 'auto' | 'review' | 'service' }>;
  // custom forbidden rules (appended to system prompt)
  customForbiddenRules: string;
  // custom auth-required operations (appended to system prompt)
  customAuthRules: string;
  // pending review reply (review mode)
  pendingReviewReply: { content: string; fromAgentId: string; sessionId: string } | null;
  // AI requesting owner assistance (input or auth confirmation)
  pendingOwnerRequest: { question: string; friendName: string; fromAgentId: string; sessionId: string; openclawKey: string; lockKey: string; type: 'input' | 'auth' } | null;

  // prevents auto-reply from switching active session while user is interacting
  sessionLocked: boolean;

  currentClawLinkSessionKey: string | null;

  taskResults: TaskResult[];

  hasUnreadTaskResults: boolean;

  clawLinkSessions: ClawLinkSession[];

  lastProcessedMessageTimestamp: number;

  // Actions
  handleIncomingMessage: (data: Message) => void;
  loadClawLinkSessions: () => Promise<void>;
  createClawLinkSession: (friend: Friend) => Promise<ClawLinkSession>;
  switchClawLinkSession: (sessionKey: string) => void;
  deleteClawLinkSession: (sessionKey: string) => Promise<void>;
  updateClawLinkSessionName: (sessionKey: string, name: string) => void;
  updateClawLinkSessionOpenCLAWSessionKey: (sessionKey: string, openclawSessionKey: string) => Promise<void>;
  updateClawLinkSessionCompleted: (sessionKey: string, completed: boolean) => Promise<void>;

  // Actions
  connectWebSocket: (agentId: string) => void;
  setServerUrl: (url: string) => void;
  setCredentials: (user: User, agent: Agent, apiKey: string) => void;
  clearCredentials: () => void;
  logout: () => void;

  setFriends: (friends: Friend[]) => void;
  addFriend: (friend: Friend) => void;
  updateFriend: (friendId: string, status: 'accepted' | 'rejected') => void;

  setCurrentChat: (user: User, agent: Agent) => void;
  clearCurrentChat: () => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setSessionLocked: (locked: boolean) => void;

  setWsConnected: (connected: boolean) => void;
  setWs: (ws: WebSocket | null) => void;

  // API calls
  register: (username: string, displayName: string, company: string, bio: string, password: string, email?: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  addFriendRequest: (targetUsername: string) => Promise<boolean>;
  loadFriends: () => Promise<boolean | 'network_error'>;
  acceptFriend: (friendId: string) => Promise<boolean>;
  rejectFriend: (friendId: string) => Promise<boolean>;
  deleteFriend: (friendId: string) => Promise<boolean>;
  sendMessage: (content: string, sessionId?: string) => Promise<boolean>;
  loadMessages: (agentId: string, friendAgentId: string, sessionId?: string) => Promise<boolean>;
  loadUnreadSummary: () => Promise<UnreadSummary[]>;
  searchUsers: (query: string) => Promise<Friend['user'][]>;
  testConnection: () => Promise<boolean>;

  // Auto-reply
  handleAutoReply: (content: string, fromAgentId: string, originalSentContent?: string, incomingSessionId?: string) => Promise<void>;
  approveReviewReply: (editedContent?: string) => Promise<void>;
  rejectReviewReply: () => void;
  _sendAutoReply: (content: string, toAgentId: string, sessionId: string, clawLinkSession: any, friendInfo: any, friendName: string, allMessages: any[]) => Promise<boolean>;
  respondToOwnerRequest: (reply: string) => Promise<void>;
  skipOwnerRequest: () => Promise<void>;
  startGlobalPolling: () => void;
  stopGlobalPolling: () => void;

  // Task results
  addTaskResult: (result: Omit<TaskResult, 'id' | 'timestamp' | 'read'>) => Promise<TaskResult>;
  loadTaskResults: () => Promise<void>;
  markTaskResultRead: (id: string) => void;
  markAllTaskResultsRead: () => void;
}
