/**
 * Messages Page
 * Two-column layout: chat panel + right-side agent network
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useClawLinkStore, type Friend, type ClawLinkSession } from '@/stores/clawlink';
import { useSettingsStore } from '@/stores/settings';
import { fetchWithAuth } from '@/stores/clawlink/auth';
import { invokeIpc } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Send,

  Loader2,
  User,
  Users,
  Plus,
  History,
  PanelRightClose,
  Check,
  Square,
  Search,
  X,
  Share2,
  Copy,
  Image as ImageIcon,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { ChatMessage } from '@/pages/Chat/ChatMessage';
import { ChatInput } from '@/pages/Chat/ChatInput';
import { extractText, extractThinking, extractImages, extractToolUse } from '@/pages/Chat/message-utils';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoPng from '@/assets/logo.png';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RawMessage } from '@/stores/chat';

// Welcome Screen component
function WelcomeScreen({ onStartChat }: { onStartChat?: () => void }) {
  const { t } = useTranslation('clawlink');
  const chatSessions = useChatStore((s) => s.sessions);
  const chatSessionLabels = useChatStore((s) => s.sessionLabels);
  const chatSessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const chatSwitchSession = useChatStore((s) => s.switchSession);
  const chatLoadHistory = useChatStore((s) => s.loadHistory);

  // Most recent user conversation (excluding ClawLink auto-initiated sessions)
  const clawLinkOpenclawKeys = new Set(
    useClawLinkStore.getState().clawLinkSessions.map(s => s.openclawSessionKey).filter(Boolean)
  );
  const recentSession = [...chatSessions]
    .filter(s => !clawLinkOpenclawKeys.has(s.key))
    .filter(s => chatSessionLabels[s.key] || (chatSessionLastActivity[s.key] && chatSessionLastActivity[s.key] > 0))
    .sort((a, b) => (chatSessionLastActivity[b.key] || 0) - (chatSessionLastActivity[a.key] || 0))[0];

  const formatRecentTime = (ts: number) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('messages.justNow');
    if (mins < 60) return t('messages.minutesAgo', { count: mins });
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return t('messages.hoursAgo', { count: hours });
    return t('messages.daysAgo', { count: Math.floor(diff / 86400000) });
  };

  const handleResumeSession = () => {
    if (!recentSession) return;
    chatSwitchSession(recentSession.key);
    chatLoadHistory(true);
  };

  const quickActions = [
    { emoji: '💬', label: t('messages.quickActions.chat'), desc: t('messages.quickActions.chatDesc') },
    { emoji: '🤝', label: t('messages.quickActions.contactFriend'), desc: t('messages.quickActions.contactFriendDesc') },
    { emoji: '📝', label: t('messages.quickActions.writeCode'), desc: t('messages.quickActions.writeCodeDesc') },
    { emoji: '📊', label: t('messages.quickActions.analyzeData'), desc: t('messages.quickActions.analyzeDataDesc') },
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center h-full min-h-0 px-6">
      <img src={logoPng} alt="ClawLink" className="w-16 h-16 mb-5" />

      <h1 className="text-xl font-semibold tracking-tight mb-1.5">
        {t('messages.welcome.greeting')}
      </h1>
      <p className="text-[13px] text-muted-foreground mb-8">
        {t('messages.welcome.subtitle')}
      </p>

      {/* Recent AI conversation */}
      {recentSession && (
        <div className="w-full max-w-sm mb-6">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">{t('messages.welcome.continueSession')}</div>
          <button
            onClick={handleResumeSession}
            className="w-full text-left p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <img src={logoPng} alt="" className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground truncate">
                  {chatSessionLabels[recentSession.key] || t('messages.welcome.unnamedSession')}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {formatRecentTime(chatSessionLastActivity[recentSession.key] || 0)}
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5 max-w-sm w-full">
        {quickActions.map((action, i) => (
          <button
            key={i}
            className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
            onClick={onStartChat}
          >
            <span className="text-lg shrink-0">{action.emoji}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium">{action.label}</div>
              <div className="text-[11px] text-muted-foreground">{action.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Hexagon SVG path (center 12,12 radius 9)
const HEX_BASE_POINTS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  return { x: 12 + 9 * Math.cos(a), y: 12 + 9 * Math.sin(a) };
});

function hexPath(offsets: number[]): string {
  const pts = HEX_BASE_POINTS.map((p, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const r = 9 + offsets[i];
    return `${12 + r * Math.cos(a)},${12 + r * Math.sin(a)}`;
  });
  return `M${pts.join('L')}Z`;
}

const HEX_PATH = hexPath([0, 0, 0, 0, 0, 0]);

// Morphing spinning hexagon: randomly contracts 3 and extends 3 vertices
function SpinHex() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let angle = 0;
    let speed = 2;
    let targetSpeed = 2;
    let nextSpeedChange = Date.now() + 800;
    let nextMorph = Date.now() + 500;
    let raf: number;

    // Current and target offsets
    const current = [0, 0, 0, 0, 0, 0];
    const target = [0, 0, 0, 0, 0, 0];

    const randomizeMorph = () => {
      // Randomly pick 3 vertices to contract, 3 to extend
      const indices = [0, 1, 2, 3, 4, 5];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      for (let i = 0; i < 6; i++) {
        target[indices[i]] = i < 3
          ? -9                            // collapse to center
          : (1 + Math.random() * 2);      // extend 1~3
      }
    };

    const tick = () => {
      const now = Date.now();

      // Randomize rotation speed
      if (now >= nextSpeedChange) {
        targetSpeed = 1 + Math.random() * 6;
        nextSpeedChange = now + 400 + Math.random() * 1000;
      }
      speed += (targetSpeed - speed) * 0.08;
      angle += speed;

      // Morph
      if (now >= nextMorph) {
        randomizeMorph();
        nextMorph = now + 200 + Math.random() * 200;
      }

      // Smooth interpolation
      for (let i = 0; i < 6; i++) {
        current[i] += (target[i] - current[i]) * 0.06;
      }

      const d = hexPath(current);
      if (svgRef.current) svgRef.current.style.transform = `rotate(${angle}deg)`;
      if (pathRef.current) pathRef.current.setAttribute('d', d);
      if (glowRef.current) glowRef.current.setAttribute('d', d);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative flex items-center justify-center w-9 h-9">
      {/* Outer pulse glow */}
      <div className="absolute inset-0">
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full animate-ping" style={{ animationDuration: '2.5s' }}>
          <path d={HEX_PATH} stroke="currentColor" strokeWidth="0.8" className="text-teal-400/25" />
        </svg>
      </div>
      {/* Breathing layer */}
      <div className="absolute inset-0.5" style={{ animation: 'pulse 2s ease-in-out infinite' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
          <path ref={glowRef} d={HEX_PATH} stroke="currentColor" strokeWidth="1" className="text-teal-400/30" />
        </svg>
      </div>
      {/* Morphing hexagon */}
      <svg ref={svgRef} viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path ref={pathRef} d={HEX_PATH} fill="url(#hexGrad)" stroke="currentColor" strokeWidth="1.5" className="text-teal-500/60" />
        <defs>
          <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(20 184 166 / 0.6)" />
            <stop offset="100%" stopColor="rgb(6 182 212 / 0.4)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// Typing Indicator
function TypingIndicator() {
  const { t } = useTranslation('clawlink');
  return (
    <div className="flex items-center gap-2.5">
      <SpinHex />
      <span className="text-xs text-muted-foreground/70 font-medium tracking-wide">{t('messages.thinking')}</span>
    </div>
  );
}

// Activity Indicator
function ActivityIndicator() {
  const { t } = useTranslation('clawlink');
  return (
    <div className="flex items-center gap-2.5">
      <SpinHex />
      <span className="text-xs text-muted-foreground/70 font-medium tracking-wide">{t('messages.processing')}</span>
    </div>
  );
}

export function Messages() {
  const { t } = useTranslation('clawlink');
  const navigate = useNavigate();
  const {
    currentUser,
    currentAgent,
    friends,
    currentChatAgent,
    currentChatUser,
    messages,
    wsConnected,
    setCurrentChat,
    clearCurrentChat,
    sendMessage,
    loadMessages,
    clawLinkSessions,
    currentClawLinkSessionKey,
    loadClawLinkSessions,
    createClawLinkSession,
    switchClawLinkSession,
    updateClawLinkSessionName,
    updateClawLinkSessionCompleted,
    searchUsers,
    addFriendRequest,
    acceptFriend,
    rejectFriend,
    loadFriends,
    autoReplying,
    autoReplyStep: globalAutoReplyStep,
    autoReplySteps,
    autoReplyEnabled: globalAutoReplyEnabled,
    autoReplyMode: globalAutoReplyMode,
    sessionAutoReplyOverrides,
    pendingReviewReply,
    pendingOwnerRequest,
    respondToOwnerRequest,
    skipOwnerRequest,
  } = useClawLinkStore();

  // Per-session auto-reply settings (overrides global)
  const currentSessionId = currentClawLinkSessionKey
    ? clawLinkSessions.find(s => s.key === currentClawLinkSessionKey)?.id
    : undefined;
  const sessionOverride = currentSessionId ? sessionAutoReplyOverrides[currentSessionId] : undefined;
  const autoReplyEnabled = sessionOverride ? sessionOverride.enabled : globalAutoReplyEnabled;
  const autoReplyMode = sessionOverride ? sessionOverride.mode : globalAutoReplyMode;

  const setSessionAutoReply = (settings: { enabled: boolean; mode: 'auto' | 'review' | 'service' }) => {
    if (currentSessionId) {
      useClawLinkStore.setState((state) => ({
        sessionAutoReplyOverrides: { ...state.sessionAutoReplyOverrides, [currentSessionId]: settings },
      }));
    } else {
      // No active session — set global
      useClawLinkStore.setState({ autoReplyEnabled: settings.enabled, autoReplyMode: settings.mode });
    }
  };

  // Per-session autoReplyStep (isolated from other sessions)
  const autoReplyStep = (currentSessionId ? autoReplySteps[currentSessionId] : undefined) || 'idle';

  // Redirect to setup if not logged in
  useEffect(() => {
    if (!currentUser) {
      navigate('/clawlink-setup');
    }
  }, [currentUser, navigate]);

  // Chat store for creating new sessions and own agent chat
  const chatMessages = useChatStore((s) => s.messages);
  const chatSending = useChatStore((s) => s.sending);
  const chatStreaming = useChatStore((s) => s.streamingMessage);
  const chatStreamingTools = useChatStore((s) => s.streamingTools);
  const chatShowThinking = useChatStore((s) => s.showThinking);
  const showThinkingToggle = useSettingsStore((s) => s.showThinkingToggle);
  const chatPendingFinal = useChatStore((s) => s.pendingFinal);
  const chatLoading = useChatStore((s) => s.loading);
  const { newSession, sendMessage: chatSendMessage, loadHistory: chatLoadHistory, loadSessions: chatLoadSessions } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);

  // Show "my conversations" panel by default on page load
  const [showNewConversation, setShowNewConversation] = useState(true);

  // Guard to prevent useEffect from reloading messages during session creation
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Whether session list is ready (gateway running + sessions loaded)
  const [sessionsReady, setSessionsReady] = useState(false);

  // Right-side session history panel (collapsed by default)
  const [showHistory, setShowHistory] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [clawLinkSessionsCollapsed, setClawLinkSessionsCollapsed] = useState(true);
  const [myConversationsCollapsed, setMyConversationsCollapsed] = useState(false);
  const [clawLinkSessionLoadCount, setClawLinkSessionLoadCount] = useState(5);
  const [contactSearch, setContactSearch] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<any[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [addingFriend, setAddingFriend] = useState<string | null>(null);
  const [friendContextMenu, setFriendContextMenu] = useState<{ x: number; y: number; friendId: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ friendId: string; name: string } | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewEditContent, setReviewEditContent] = useState('');

  // First-message preview per session (for session list display)
  const [sessionFirstMessages, setSessionFirstMessages] = useState<Record<string, string>>({});
  const [loadedSessionCount, setLoadedSessionCount] = useState(30);

  // Chat store — session state
  const chatSessions = useChatStore((s) => s.sessions);
  const chatCurrentSessionKey = useChatStore((s) => s.currentSessionKey);
  const chatSessionLabels = useChatStore((s) => s.sessionLabels);
  const chatSessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const chatSwitchSession = useChatStore((s) => s.switchSession);

  const pendingFriends = friends.filter(f => f.friend.status === 'pending');
  const acceptedFriends = friends.filter(f => f.friend.status === 'accepted');

  // Load friends and sessions once on mount
  useEffect(() => {
    loadFriends();
    loadClawLinkSessions();
    if (!useClawLinkStore.getState().currentChatAgent) {
      setShowNewConversation(true);
    } else {
      setShowNewConversation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart scroll: only auto-scroll when user is near bottom or sent a message
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    // check BEFORE DOM updates with new message height
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    const isSentByMe = isNewMessage && messages.length > 0 &&
      messages[messages.length - 1].fromAgentId === currentAgent?.id;

    if (isNearBottom || isSentByMe) {
      // wait for DOM to render new message, then scroll
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, currentAgent?.id]);

  // Load message history
  useEffect(() => {
    // Skip loading while sending to avoid overwriting optimistic messages
    if (sending) {
      return;
    }
    if (isCreatingSession) return;
    if (!currentClawLinkSessionKey || currentClawLinkSessionKey.includes(':temp_')) return;
    if (!currentAgent || !currentChatAgent || showNewConversation) return;

    // Read sessions from store directly (not in deps to avoid redundant requests)
    const sessions = useClawLinkStore.getState().clawLinkSessions;
    const session = sessions.find(s => s.key === currentClawLinkSessionKey && s.friendAgentId === currentChatAgent.id);
    if (!session) return;

    loadMessages(currentAgent.id, currentChatAgent.id, session.id);
  }, [currentAgent, currentChatAgent, loadMessages, showNewConversation, currentClawLinkSessionKey, isCreatingSession]);

  // Default to welcome screen: load session list only, not history.
  // History loads when the user clicks a recent-session card.
  const gatewayStatus = useGatewayStore((s) => s.status);
  useEffect(() => {
    let cancelled = false;
    if (gatewayStatus.state === 'running') {
      setSessionsReady(false);
      const loadAll = async () => {
        await chatLoadSessions();
        if (cancelled) return;
        setSessionsReady(true);
      };
      loadAll();
    } else {
      setSessionsReady(false);
    }
    return () => { cancelled = true; };
  }, [gatewayStatus.state, chatLoadSessions]);

  // Auto-scroll to bottom in new-session mode
  useEffect(() => {
    if (showNewConversation && (chatMessages.length > 0 || chatSending || chatStreaming)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showNewConversation, chatMessages, chatSending, chatStreaming]);

  // Save first-message preview after loading messages
  useEffect(() => {
    if (!currentChatAgent || messages.length === 0) return;

    // Find the matching session
    const session = currentClawLinkSessionKey
      ? clawLinkSessions.find(s => s.key === currentClawLinkSessionKey && s.friendAgentId === currentChatAgent.id)
      : null;

    if (session) {
      // Use first message content as preview
      const firstMsg = messages[0];
      let preview = '';

      if (typeof firstMsg.content === 'string') {
        preview = firstMsg.content;
      } else if (Array.isArray(firstMsg.content)) {
        preview = firstMsg.content.join(' ');
      } else if (typeof firstMsg.content === 'object' && firstMsg.content !== null) {
        preview = (firstMsg.content as Record<string, unknown>).text as string ||
                  (firstMsg.content as Record<string, unknown>).content as string ||
                  JSON.stringify(firstMsg.content);
      }

      // Truncate preview text
      if (preview.length > 20) {
        preview = preview.substring(0, 20) + '...';
      }

      if (preview) {
        setSessionFirstMessages(prev => ({
          ...prev,
          [session.key]: preview
        }));
      }
    }
  }, [messages, currentChatAgent, currentClawLinkSessionKey, clawLinkSessions]);


  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    // In new-session view, use Chat store to send
    if (showNewConversation) {
      setSending(true);
      try {
        await chatSendMessage(inputValue);
        setInputValue('');
      } finally {
        setSending(false);
      }
      return;
    }

    // Friend chat — use ClawLink store
    setSending(true);
    // Lock session to prevent auto-reply from switching the active session
    useClawLinkStore.getState().setSessionLocked(true);

    // Only create temp session when no session exists; otherwise send directly
    if (!currentClawLinkSessionKey) {
      if (currentChatAgent && currentChatUser) {
        const friend = friends.find(f => f.agents[0]?.id === currentChatAgent.id);
        if (friend) {
          // Create temp session
          const tempSessionId = `temp_${Date.now()}`;
          const tempSessionKey = `clawlink:${friend.friend.id}:${friend.agents[0].id}:${tempSessionId}`;
          useClawLinkStore.getState().switchClawLinkSession(tempSessionKey);
        }
      }
    }

    // Capture pre-send session key (may be temp)
    const previousSessionKey = useClawLinkStore.getState().currentClawLinkSessionKey;
    const wasTempSession = previousSessionKey?.includes(':temp_');
    const inputContent = inputValue;

    try {
      // Get sessionId (may be undefined for unsaved temp sessions)
      const session = previousSessionKey
        ? clawLinkSessions.find(s => s.key === previousSessionKey)
        : null;

      await sendMessage(inputContent, session?.id);
      setInputValue('');

      // Extract preview (first 20 chars)
      const preview = inputContent.length > 20 ? inputContent.substring(0, 20) + '...' : inputContent;

      // If temp session was just promoted to a real session, save preview
      if (wasTempSession) {
        // Wait for sendMessage to finish session promotion
        await new Promise(r => setTimeout(r, 200));

        // Get updated store state
        const store = useClawLinkStore.getState();
        const newSessionKey = store.currentClawLinkSessionKey;
        const newSessions = store.clawLinkSessions;

        if (newSessionKey && !newSessionKey.includes(':temp_')) {
          // Find the corresponding session
          const newSession = newSessions.find(s => s.key === newSessionKey);

          // Save preview for session list
          setSessionFirstMessages(prev => ({
            ...prev,
            [newSessionKey]: preview
          }));

          // Save session name to server
          if (newSession && newSession.id) {
            updateClawLinkSessionName(newSessionKey, preview);
          }

          // No need to reload — sendMessage already added the message locally

        }
      } else if (session) {
        // Existing session — update name to preview
        updateClawLinkSessionName(session.key, preview);
      } else if (!previousSessionKey) {
        // First message from welcome screen — refresh session list
        await loadClawLinkSessions();

        // Check for the newly created session
        const updatedStore = useClawLinkStore.getState();
        const newSessionKey = updatedStore.currentClawLinkSessionKey;

        if (newSessionKey && !newSessionKey.includes(':temp_')) {
          const newSession = updatedStore.clawLinkSessions.find(s => s.key === newSessionKey);

          // Save preview
          setSessionFirstMessages(prev => ({
            ...prev,
            [newSessionKey]: preview
          }));

          if (newSession && newSession.id) {
            updateClawLinkSessionName(newSessionKey, preview);
          }

        }
      }

      // Refresh session list so the new session appears
      await loadClawLinkSessions();
    } finally {
      setSending(false);
      // Delay unlock to let session-load effects settle
      setTimeout(() => {
        useClawLinkStore.getState().setSessionLocked(false);
      }, 1000);
    }
  };

  // Select chat target — enter immediately, check history sessions async
  const [checkingHistory, setCheckingHistory] = useState(false);
  const [pendingSession, setPendingSession] = useState<ClawLinkSession | null>(null);

  const handleSelectChat = (friend: Friend) => {
    if (friend.agents.length === 0) return;

    // Enter immediately (no async wait)
    useClawLinkStore.setState({
      currentChatUser: friend.user,
      currentChatAgent: friend.agents[0],
      currentClawLinkSessionKey: null,
      messages: [],
      sessionLocked: false,
    });
    setShowNewConversation(false);
    setPendingSession(null);
    setCheckingHistory(true);

    // Background async check
    (async () => {
      await loadClawLinkSessions();
      const sessions = useClawLinkStore.getState().clawLinkSessions;
      const friendSessions = sessions
        .filter(s => s.friendAgentId === friend.agents[0].id)
        .sort((a, b) => b.lastActivity - a.lastActivity);

      const latest = friendSessions[0] || null;
      setCheckingHistory(false);

      if (latest && !latest.completed) {
        setPendingSession(latest);
      } else {
        setPendingSession(null);
      }
    })();
  };

  // Go to pending session
  const handleGoToPendingSession = () => {
    if (!pendingSession || !currentAgent) return;
    useClawLinkStore.setState({ currentClawLinkSessionKey: pendingSession.key });
    loadMessages(currentAgent.id, pendingSession.friendAgentId, pendingSession.id);
    setPendingSession(null);
  };

  // Select a ClawLink session
  const handleSelectClawLinkSession = (sessionKey: string) => {
    const session = clawLinkSessions.find(s => s.key === sessionKey);
    if (session) {
      switchClawLinkSession(sessionKey);

      // Unlock session for auto-reply
      useClawLinkStore.getState().setSessionLocked(false);

      // Find and switch to the friend
      const friend = friends.find(f => f.agents[0]?.id === session.friendAgentId);
      if (friend) {
        setShowNewConversation(false);
        setCurrentChat(friend.user, friend.agents[0]);
        // Load messages by sessionId
        if (currentAgent) {
          loadMessages(currentAgent.id, session.friendAgentId, session.id);

          // On enter: if incomplete + last msg is from peer + idle → trigger reply
          if (!session.completed && autoReplyEnabled) {
            (async () => {
              try {
                const store = useClawLinkStore.getState();
                const res = await fetchWithAuth(store.token, `${store.serverUrl}/api/messages/${currentAgent.id}/${session.friendAgentId}?sessionId=${session.id}`);
                const data = await res.json();
                const msgs = data.success ? (data.data || []) : [];
                if (msgs.length > 0 && msgs[msgs.length - 1].fromAgentId !== currentAgent.id) {
                  // Last message is from peer — trigger auto-reply
                  const lastMsg = msgs[msgs.length - 1];
                  store.handleAutoReply(lastMsg.content, session.friendAgentId, undefined, session.id);
                }
              } catch { /* ignore */ }
            })();
          }
        }
      }
    }
  };

  // Create new ClawLink session (only appears in list after first message)
  const handleNewClawLinkSession = async () => {
    if (currentChatAgent && currentChatUser) {
      const friend = friends.find(f => f.agents[0]?.id === currentChatAgent.id);
      if (friend) {
        // Set all state at once to avoid intermediate useEffect triggers
        const tempSessionId = `temp_${Date.now()}`;
        const tempSessionKey = `clawlink:${friend.friend.id}:${friend.agents[0].id}:${tempSessionId}`;

        useClawLinkStore.setState({
          currentClawLinkSessionKey: tempSessionKey,
          currentChatUser: friend.user,
          currentChatAgent: friend.agents[0],
          messages: [],
          sessionLocked: true,
        });
      }
    }
  };

  // Select session from list
  const handleSelectSession = (sessionKey: string) => {
    // switchSession internally calls loadHistory
    chatSwitchSession(sessionKey);
    setShowNewConversation(true);
  };

  // Select current user (show session history)
  const handleSelectCurrentUser = () => {
    clearCurrentChat();
    setShowNewConversation(true);
    // Load session list and history
    chatLoadSessions();
    chatLoadHistory(true);
  };

  // Focus input on Welcome button click
  const handleStartChat = () => {
    inputRef.current?.focus();
  };

  // Create new session
  const handleNewSession = () => {
    newSession();
    setInputValue('');
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Agent network stats
  const activeSessions = clawLinkSessions.filter(s => !s.completed).sort((a, b) => (b.lastActivity || b.createdAt) - (a.lastActivity || a.createdAt));

  // Stable color assignment per agent (hash-based)
  const agentColors = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-indigo-500 to-blue-600',
  ];
  const getAgentColor = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    return agentColors[Math.abs(hash) % agentColors.length];
  };

  const getFriendDisplayName = (friendAgentId: string) => {
    const friend = friends.find(f => f.agents?.some(a => a.id === friendAgentId));
    return friend?.user?.displayName || null;
  };

  // Header height constant (shared by left and right panels)
  const headerH = 'h-[57px]'; // py-3.5(14*2) + content ≈ 57px

  // Two-column layout: chat panel + agent network
  return (
    <div className="h-full flex relative">
      {/* Full-width header divider */}
      <div className={`absolute top-[57px] left-0 right-0 h-px bg-border z-[1]`} />

      {/* Center: Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat content */}
        {showNewConversation ? (
          <>
            {/* Header - {t('messages.header.myAgent')} */}
            <div className={`flex items-center gap-3 px-6 py-3.5 ${headerH}`}>
              <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#1a1a3e] to-[#2a1a4e] flex items-center justify-center shrink-0">
                <img src={logoPng} alt="" className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold">{currentAgent?.name || t('messages.header.myAgent')}</h3>
                {activeSessions.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('messages.header.activeTasks', { count: activeSessions.length })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {/* Back-to-chat button: shown when current OpenClaw session is linked to a ClawLink session */}
                {(() => {
                  const chatCurrentKey = useChatStore.getState().currentSessionKey;
                  const linkedSession = clawLinkSessions.find(s => s.openclawSessionKey === chatCurrentKey);
                  if (!linkedSession) return null;
                  const friend = friends.find(f => f.agents[0]?.id === linkedSession.friendAgentId);
                  return (
                    <button
                      onClick={() => {
                        if (friend) {
                          setShowNewConversation(false);
                          setCurrentChat(friend.user, friend.agents[0]);
                          switchClawLinkSession(linkedSession.key);
                          if (currentAgent) {
                            loadMessages(currentAgent.id, linkedSession.friendAgentId, linkedSession.id);
                          }
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
                    >
                      <MessageCircle className="h-3 w-3" />
                      {t('messages.header.backToChat', { name: friend?.user.displayName || 'Conversation' })}
                    </button>
                  );
                })()}
                <button
                  onClick={handleNewSession}
                  className="px-3 py-1.5 rounded-lg text-[11px] border border-border bg-transparent text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('messages.header.newSession')}
                </button>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border border-border bg-transparent transition-colors",
                    showHistory
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  {t('messages.header.sessionHistory')}
                </button>
              </div>
            </div>

            {/* Welcome Screen + Chat area */}
            <div className="flex-1 overflow-auto flex flex-col">
              {/* Show messages if any, otherwise Welcome */}
              {(() => {
                // Parse streaming message content (aligned with Chat page logic)
                const streamMsg = chatStreaming && typeof chatStreaming === 'object'
                  ? chatStreaming as unknown as { role?: string; content?: unknown; timestamp?: number }
                  : null;
                const streamText = streamMsg ? extractText(streamMsg) : (typeof chatStreaming === 'string' ? chatStreaming as string : '');
                const hasStreamText = streamText.trim().length > 0;
                const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
                const hasStreamThinking = chatShowThinking && !!streamThinking && streamThinking.trim().length > 0;
                const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
                const hasStreamTools = streamTools.length > 0;
                const streamImages = streamMsg ? extractImages(streamMsg) : [];
                const hasStreamImages = streamImages.length > 0;
                const hasStreamToolStatus = chatStreamingTools.length > 0;
                const shouldRenderStreaming = chatSending && (hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus);
                const hasAnyStreamContent = hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;

                return chatMessages.length > 0 || chatSending || chatStreaming || chatPendingFinal ? (
                <div className="flex-1 overflow-auto py-4 space-y-4 px-4">
                  {chatMessages.map((msg, idx) => (
                    <ChatMessage
                      key={msg.id || `msg-${idx}`}
                      message={msg}
                      showThinking={chatShowThinking}
                    />
                  ))}

                  {/* Streaming output (with live thinking) */}
                  {shouldRenderStreaming && (
                    <ChatMessage
                      message={(streamMsg
                        ? {
                            ...(streamMsg as Record<string, unknown>),
                            role: (typeof streamMsg.role === 'string' ? streamMsg.role : 'assistant') as RawMessage['role'],
                            content: streamMsg.content ?? streamText,
                            timestamp: streamMsg.timestamp ?? Date.now() / 1000,
                          }
                        : {
                            role: 'assistant' as const,
                            content: streamText,
                            timestamp: Date.now() / 1000,
                          }) as RawMessage}
                      showThinking={chatShowThinking}
                      isStreaming
                      streamingTools={chatStreamingTools}
                    />
                  )}

                  {/* Tool processing */}
                  {chatSending && chatPendingFinal && !shouldRenderStreaming && (
                    <ActivityIndicator />
                  )}

                  {/* Thinking animation — sending but no content yet */}
                  {chatSending && !chatPendingFinal && !hasAnyStreamContent && (
                    <TypingIndicator />
                  )}

                  <div ref={messagesEndRef} />
                </div>
              ) : chatLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                    <span className="text-sm text-muted-foreground">{t('messages.welcome.loadingSession')}</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <WelcomeScreen onStartChat={handleStartChat} />
                </div>
              );
              })()}

              {/* Chat input */}
              <ChatInput
                onSend={(text, attachments) => {
                  if (!text.trim() && (!attachments || attachments.length === 0)) return;
                  const mapped = attachments?.map(a => ({
                    fileName: a.fileName,
                    mimeType: a.mimeType,
                    fileSize: a.fileSize,
                    stagedPath: a.stagedPath,
                    preview: a.preview,
                  }));
                  chatSendMessage(text, mapped);
                }}
                sending={chatSending}
              />
            </div>
          </>
        ) : currentChatAgent ? (
          <>
            {/* Chat Header — friend chat */}
            <div className={`flex items-center gap-3 px-6 py-3.5 ${headerH}`}>
              <div className={cn("w-9 h-9 rounded-[10px] bg-gradient-to-br flex items-center justify-center shrink-0", getAgentColor(currentChatAgent?.id || ''))}>
                <span className="text-xs text-white font-bold">{currentChatUser?.displayName?.charAt(0) || '?'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold">{currentChatAgent?.name || currentChatUser?.displayName}</h3>
                <p className="text-[11px] text-muted-foreground">
                  @{currentChatUser?.username}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Terminate session button (only for active real sessions) */}
                {currentClawLinkSessionKey && !currentClawLinkSessionKey.includes(':temp_') && (() => {
                  const s = clawLinkSessions.find(x => x.key === currentClawLinkSessionKey);
                  return s && !s.completed;
                })() && (
                  <button
                    onClick={async () => {
                      if (!currentClawLinkSessionKey) return;
                      useClawLinkStore.setState({ autoReplying: false, autoReplyStep: 'idle' });
                      await updateClawLinkSessionCompleted(currentClawLinkSessionKey, true);
                      await loadClawLinkSessions();
                    }}
                    title={t('messages.header.terminateSession')}
                    className="px-3 py-1.5 rounded-lg text-[11px] border transition-all flex items-center gap-1.5"
                    style={{ borderColor: 'rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.04)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = 'rgba(239,68,68,0.85)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.04)'; e.currentTarget.style.color = 'rgba(239,68,68,0.6)'; }}
                  >
                    <Square className="h-3 w-3" />
                    {t('messages.header.terminateSession')}
                  </button>
                )}
                {/* View thinking process button (shown when enabled in settings and openclawSessionKey exists) */}
                {showThinkingToggle && (() => {
                  const s = currentClawLinkSessionKey ? clawLinkSessions.find(x => x.key === currentClawLinkSessionKey) : null;
                  return s?.openclawSessionKey ? (
                    <button
                      onClick={async () => {
                        const ock = s.openclawSessionKey!;
                        // Switch to linked OpenClaw session
                        const chatStore = useChatStore.getState();
                        chatStore.switchSession(ock);
                        // switchSession already triggers loadHistory internally.
                        // If it returns empty, try a direct RPC call (same as auto-reply uses).
                        await new Promise(r => setTimeout(r, 500)); // wait for loadHistory to complete
                        if (useChatStore.getState().messages.length === 0) {
                          try {
                            const gatewayRpc = useGatewayStore.getState().rpc;
                            const hist = await gatewayRpc<{ messages?: Array<Record<string, unknown>> }>('chat.history', { sessionKey: ock, limit: 200 }, 10_000);
                            const msgs = hist?.messages || [];
                            console.log(`[ViewThinking] Direct RPC chat.history for "${ock}": ${msgs.length} messages`);
                            if (msgs.length > 0) {
                              useChatStore.setState({ messages: msgs as any[], loading: false });
                            }
                          } catch (e) {
                            console.warn('[ViewThinking] Direct RPC failed:', e);
                          }
                        }
                        setShowNewConversation(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
                      title={t('messages.header.viewThinking')}
                    >
                      <Search className="h-3 w-3" />
                      {t('messages.header.viewThinking')}
                    </button>
                  ) : null;
                })()}
                <button
                  onClick={handleNewClawLinkSession}
                  className="px-3 py-1.5 rounded-lg text-[11px] border border-border bg-transparent text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('messages.header.newSessionFriend')}
                </button>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border border-border bg-transparent transition-colors",
                    showHistory
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  {t('messages.header.sessionHistory')}
                </button>
              </div>
            </div>

            {/* Message list */}
            <div ref={containerRef} className="flex-1 overflow-auto py-4 space-y-4 px-4">
              {/* Show messages if available, otherwise show welcome screen */}
              {((!currentClawLinkSessionKey || currentClawLinkSessionKey === '' || (currentClawLinkSessionKey && currentClawLinkSessionKey.includes(':temp_'))) && messages.length === 0) ? (
                <div className="flex flex-col items-center justify-center text-center h-full min-h-0 px-6">
                  <div className="text-4xl mb-4">🤝</div>
                  <h2 className="text-lg font-semibold mb-1">{t('messages.collaboration.title', { name: currentChatUser?.displayName })}</h2>
                  <p className="text-[13px] text-muted-foreground mb-5">{t('messages.collaboration.subtitle')}</p>

                  {/* History check status */}
                  {checkingHistory ? (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-card mb-5 max-w-xs w-full">
                      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                      <span className="text-[12px] text-muted-foreground">{t('messages.collaboration.checkingHistory')}</span>
                    </div>
                  ) : pendingSession ? (
                    <button
                      onClick={handleGoToPendingSession}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors mb-5 max-w-xs w-full text-left group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <MessageCircle className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium">{t('messages.collaboration.unfinishedSession')}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {pendingSession.name || t('messages.collaboration.ongoingChat')}
                        </div>
                      </div>
                      <span className="text-[11px] text-primary font-medium group-hover:translate-x-0.5 transition-transform">{t('messages.collaboration.goTo')}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card/50 mb-5 max-w-xs w-full">
                      <span className="text-[12px] text-muted-foreground/60">{t('messages.collaboration.noUnfinished')}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5 max-w-xs w-full">
                    {[
                      { emoji: '📋', label: t('messages.friendActions.coordinateTask'), desc: t('messages.friendActions.coordinateTaskDesc') },
                      { emoji: '📅', label: t('messages.friendActions.scheduleMeeting'), desc: t('messages.friendActions.scheduleMeetingDesc') },
                      { emoji: '❓', label: t('messages.friendActions.askQuestion'), desc: t('messages.friendActions.askQuestionDesc') },
                      { emoji: '📨', label: t('messages.friendActions.relayMessage'), desc: t('messages.friendActions.relayMessageDesc') },
                    ].map((action, i) => (
                      <button key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left" onClick={() => inputRef.current?.focus()}>
                        <span className="text-base shrink-0">{action.emoji}</span>
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium">{action.label}</div>
                          <div className="text-[10px] text-muted-foreground">{action.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* System message */}
                  <div className="text-center text-[11px] text-muted-foreground/60 py-2">
                    <span className="bg-card border border-border px-3 py-1 rounded-full">
                      {t('messages.collaboration.agentsConnected')}
                    </span>
                  </div>

              {messages.map((msg) => {
                const isMe = msg.fromAgentId === currentAgent?.id;
                const rawContent = (() => {
                  const c = msg.content as string | string[] | object | null | undefined;
                  if (!c) return '';
                  if (typeof c === 'string') return c;
                  if (Array.isArray(c)) return c.join(' ');
                  if (typeof c === 'object') {
                    const obj = c as Record<string, unknown>;
                    return String(obj.text || obj.content || JSON.stringify(c));
                  }
                  return String(c);
                })();

                // Parse file references [file: url | name | mime | size]
                const fileRegex = /\[file:\s*([^\s|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^\]]+)\]/g;
                const files: { url: string; name: string; mime: string; size: string }[] = [];
                let m: RegExpExecArray | null;
                while ((m = fileRegex.exec(rawContent)) !== null) {
                  files.push({ url: m[1].trim(), name: m[2].trim(), mime: m[3].trim(), size: m[4].trim() });
                }
                let textContent = rawContent.replace(fileRegex, '').trim();

                // format conclusion messages: each marker on its own line
                if (/【(?:Conclusion|结论|結論|결론)】/.test(textContent)) {
                  const markerRe = /[;；]?\s*(【(?:Conclusion|结论|結論|결론|Topic|话题|トピック|주제|Result|结果|結果|결과)】)/g;
                  textContent = textContent.replace(markerRe, (_m, marker) => '\n' + marker).trim();
                }

                return (
                  <div
                    key={msg.id}
                    className={cn("flex gap-2.5", isMe ? "flex-row-reverse" : "")}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "h-7 w-7 rounded-lg shrink-0 flex items-center justify-center mt-1",
                      isMe ? "bg-[var(--bubble-me-bg)]" : "bg-card border border-border"
                    )}>
                      {isMe
                        ? <img src={logoPng} alt="" className="w-4 h-4" />
                        : <span className="text-xs font-bold text-muted-foreground">{currentChatUser?.displayName?.charAt(0)}</span>
                      }
                    </div>
                    {/* Bubble + files */}
                    <div className={cn("flex flex-col max-w-[85%] gap-1.5", isMe ? "items-end" : "items-start")}>
                      {textContent && (
                        <div className={cn(
                          "px-3.5 py-2.5 text-[13px] leading-relaxed break-words",
                          isMe
                            ? "bg-[var(--bubble-me-bg)] text-[var(--bubble-me-text)] rounded-xl rounded-br-sm"
                            : "bg-card border border-border rounded-xl rounded-bl-sm",
                          "prose prose-sm dark:prose-invert max-w-none",
                          "[&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_pre]:my-1 [&_blockquote]:my-1"
                        )}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                        </div>
                      )}
                      {files.length > 0 && (
                        <div className={cn("flex flex-wrap gap-1.5", isMe ? "justify-end" : "justify-start")}>
                          {files.map((f, fi) => (
                            <FileCard key={fi} url={f.url} name={f.name} mime={f.mime} size={f.size} isMe={isMe} autoDownload={!isMe} />
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground/50 mt-0.5 px-1">
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* My agent processing indicator (current session only) */}
              {autoReplyStep !== 'idle'
                && autoReplyStep !== 'reviewing'
                && !showNewConversation
                && !clawLinkSessions.find(s => s.key === currentClawLinkSessionKey)?.completed
                && (
                <div className="flex gap-2.5 flex-row-reverse">
                  <div className="h-7 w-7 rounded-lg shrink-0 flex items-center justify-center mt-1 bg-[var(--bubble-me-bg)]">
                    <img src={logoPng} alt="" className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--bubble-me-bg)] rounded-xl rounded-br-sm">
                      <SpinHex />
                      <div className="flex flex-col">
                        <span className="text-xs text-[var(--bubble-me-text)]/70 font-medium tracking-wide">
                          {autoReplyStep === 'received' && t('messages.autoReplySteps.received')}
                          {autoReplyStep === 'forwarding' && t('messages.autoReplySteps.forwarding')}
                          {autoReplyStep === 'thinking' && t('messages.autoReplySteps.thinking')}
                          {autoReplyStep === 'replying' && t('messages.autoReplySteps.replying')}
                          {autoReplyStep === 'idle' && t('messages.autoReplySteps.thinking')}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                          {(['received', 'forwarding', 'thinking', 'replying'] as const).map((step, i) => (
                            <div key={step} className={cn(
                              "h-[3px] rounded-full transition-all duration-300",
                              i === 0 ? "w-4" : "w-6",
                              (['received', 'forwarding', 'thinking', 'replying'].indexOf(autoReplyStep) >= i)
                                ? "bg-primary/50"
                                : "bg-primary/10"
                            )} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Review mode: pending review reply */}
              {autoReplyStep === 'reviewing' && pendingReviewReply && !showNewConversation && (
                <div className="flex gap-2.5 flex-row-reverse">
                  <div className="h-7 w-7 rounded-lg shrink-0 flex items-center justify-center mt-1 bg-[var(--bubble-me-bg)]">
                    <img src={logoPng} alt="" className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col items-end max-w-[85%]">
                    <div className="text-[10px] text-amber-400/70 mb-1 px-1">{t('messages.autoReplySteps.reviewing')}</div>
                    {reviewEditing ? (
                      <div className="w-full">
                        <textarea
                          className="w-full min-h-[80px] px-3.5 py-2.5 bg-[var(--bubble-me-bg)] border border-amber-500/30 rounded-xl rounded-br-sm text-[13px] leading-relaxed text-[var(--bubble-me-text)] resize-none focus:outline-none focus:border-amber-500/50"
                          value={reviewEditContent}
                          onChange={(e) => setReviewEditContent(e.target.value)}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={() => { setReviewEditing(false); setReviewEditContent(''); }}
                            className="px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground/80 hover:text-foreground/70 transition-colors"
                          >
                            {t('profile.cancel')}
                          </button>
                          <button
                            onClick={async () => {
                              setReviewEditing(false);
                              await useClawLinkStore.getState().approveReviewReply(reviewEditContent);
                              setReviewEditContent('');
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                          >
                            {t('messages.autoReply.reviewApprove')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="px-3.5 py-2.5 bg-[var(--bubble-me-bg)] border border-amber-500/20 rounded-xl rounded-br-sm">
                          <div className="text-[13px] leading-relaxed text-[var(--bubble-me-text)] whitespace-pre-wrap break-words">
                            {pendingReviewReply.content}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => useClawLinkStore.getState().rejectReviewReply()}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <X className="h-3 w-3" />
                            {t('messages.autoReply.reviewReject')}
                          </button>
                          <button
                            onClick={() => {
                              setReviewEditContent(pendingReviewReply.content);
                              setReviewEditing(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground/80 hover:bg-accent transition-colors"
                          >
                            {t('messages.autoReply.reviewEdit')}
                          </button>
                          <button
                            onClick={() => useClawLinkStore.getState().approveReviewReply()}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                          >
                            <Check className="h-3 w-3" />
                            {t('messages.autoReply.reviewApprove')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Waiting for peer reply indicator (last msg is ours + session active + not auto-replying) */}
              {!showNewConversation
                && autoReplyStep === 'idle'
                && messages.length > 0
                && messages[messages.length - 1].fromAgentId === currentAgent?.id
                && !clawLinkSessions.find(s => s.key === currentClawLinkSessionKey)?.completed
                && (
                <div className="flex gap-2.5">
                  <div className="h-7 w-7 rounded-lg shrink-0 flex items-center justify-center mt-1 bg-card border border-border">
                    <span className="text-xs font-bold text-muted-foreground">{currentChatUser?.displayName?.charAt(0)}</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-card border border-border rounded-xl rounded-bl-sm">
                    <SpinHex />
                    <span className="text-xs text-muted-foreground font-medium">
                      {t('messages.autoReplySteps.thinking')}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
              </>
              )}
            </div>

            {/* Input area + auto-reply indicator */}
            {(() => {
              const currentSession = clawLinkSessions.find(s => s.key === currentClawLinkSessionKey);
              const isCompleted = currentSession?.completed;
              return isCompleted ? (
                <div className="p-4 border-t">
                  <div className="text-center text-sm text-muted-foreground py-2 space-y-2">
                    <div>
                      <Check className="h-4 w-4 inline-block mr-1 text-green-500" />
                      {t('messages.sessionEnded')}
                    </div>
                    {currentSession?.openclawSessionKey && (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
                        <span>{t('messages.rememberHint')}</span>
                        <button
                          onClick={async () => {
                            const ock = currentSession.openclawSessionKey;
                            if (!ock) return;
                            try {
                              const gatewayRpc = useGatewayStore.getState().rpc;
                              // Use the existing openclawSessionKey to send in the original AI session
                              await gatewayRpc('chat.send', {
                                sessionKey: ock,
                                message: 'Please review this entire conversation and save the important information to your memory files. Include key facts, decisions, agreements, preferences, and any action items that might be useful in future conversations.',
                                idempotencyKey: crypto.randomUUID(),
                              }, 120_000);
                              toast.success(t('messages.rememberSent'));
                            } catch {
                              toast.error(t('messages.rememberFailed'));
                            }
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                        >
                          {t('messages.rememberButton')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Mode selector: hidden when auto-mode overlay is active */}
                  {currentChatAgent && !(autoReplyEnabled && autoReplyMode === 'auto' && messages.length > 0) && (
                    <div className="absolute -top-5 right-8 z-10 flex items-center gap-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-foreground/70">
                        <span className={cn("w-1.5 h-1.5 rounded-full", autoReplyEnabled ? "bg-green-500" : "bg-foreground/20")} />
                        {autoReplyEnabled
                          ? t('messages.autoReply.agentActive', { name: currentAgent?.name || 'Claw' })
                          : t('messages.autoReply.agentPaused')}
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setShowModeDropdown(!showModeDropdown)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border border-foreground/[0.08] text-muted-foreground hover:text-foreground/70 hover:border-foreground/[0.15] transition-colors"
                        >
                          {!autoReplyEnabled
                            ? t('messages.autoReply.modePaused')
                            : autoReplyMode === 'auto'
                              ? t('messages.autoReply.modeAuto')
                              : autoReplyMode === 'service'
                                ? t('messages.autoReply.modeService')
                                : t('messages.autoReply.modeReview')}
                          <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showModeDropdown && "rotate-180")} />
                        </button>
                        {showModeDropdown && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setShowModeDropdown(false)} />
                            <div className="absolute bottom-full right-0 mb-1 z-30 min-w-[190px] py-1 bg-[var(--bubble-me-bg)] border border-foreground/[0.08] rounded-lg shadow-2xl">
                              {([
                                { key: 'auto', label: t('messages.autoReply.modeAuto'), color: 'bg-green-500' },
                                { key: 'review', label: t('messages.autoReply.modeReview'), color: 'bg-amber-500' },
                                { key: 'service', label: t('messages.autoReply.modeService'), color: 'bg-blue-500' },
                                { key: 'paused', label: t('messages.autoReply.modePaused'), color: 'bg-foreground/20' },
                              ] as const).map(({ key, label }) => {
                                const isActive = key === 'paused' ? !autoReplyEnabled : (autoReplyEnabled && autoReplyMode === key);
                                return (
                                  <button
                                    key={key}
                                    onClick={() => {
                                      setShowModeDropdown(false);
                                      if (currentClawLinkSessionKey) {
                                        const sessions = useClawLinkStore.getState().clawLinkSessions;
                                        const updated = sessions.map(s =>
                                          s.key === currentClawLinkSessionKey ? { ...s, openclawSessionKey: null } : s
                                        );
                                        useClawLinkStore.setState({ clawLinkSessions: updated });
                                      }
                                      if (key === 'paused') {
                                        setSessionAutoReply({ enabled: false, mode: autoReplyMode });
                                      } else {
                                        setSessionAutoReply({ enabled: true, mode: key });
                                      }
                                    }}
                                    className={cn(
                                      "w-full px-3 py-2 text-left text-[11px] transition-colors flex items-center gap-2",
                                      isActive ? "text-primary bg-primary/10" : "text-foreground/60 hover:bg-accent"
                                    )}
                                  >
                                    <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-green-500" : "bg-foreground/20")} />
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Input always rendered (disabled under auto-mode overlay) */}
                  <ChatInput
                    disabled={!!(currentChatAgent && autoReplyEnabled && autoReplyMode === 'auto' && messages.length > 0)}
                    onSend={async (text, attachments) => {
                      if (!text.trim() && (!attachments || attachments.length === 0)) return;
                      setSending(true);
                      useClawLinkStore.getState().setSessionLocked(true);

                      try {
                        let finalText = text;

                        // Upload attachments via IPC (main process reads local files to bypass renderer file:// restrictions)
                        if (attachments && attachments.length > 0) {
                          const store = useClawLinkStore.getState();
                          const uploadedRefs: string[] = [];

                          for (const a of attachments) {
                            try {
                              const result = await invokeIpc('clawlink:uploadFile', {
                                filePath: a.stagedPath,
                                fileName: a.fileName,
                                mimeType: a.mimeType,
                                serverUrl: store.serverUrl,
                                token: store.token,
                              }) as any;

                              if (result?.success && result.url) {
                                const fileUrl = `${store.serverUrl}${result.url}`;
                                uploadedRefs.push(`[file: ${fileUrl} | ${a.fileName} | ${a.mimeType} | ${a.fileSize}]`);
                              } else {
                                console.error('File upload failed:', a.fileName, result?.error);
                              }
                            } catch (e) {
                              console.error('File upload failed:', a.fileName, e);
                            }
                          }

                          if (uploadedRefs.length > 0) {
                            finalText = finalText ? `${finalText}\n${uploadedRefs.join('\n')}` : uploadedRefs.join('\n');
                          }
                        }

                        const session = clawLinkSessions.find(s => s.key === currentClawLinkSessionKey);
                        await sendMessage(finalText, session?.id);
                      } finally {
                        setSending(false);
                        setInputValue('');
                        setTimeout(() => useClawLinkStore.getState().setSessionLocked(false), 1000);
                      }
                    }}
                    sending={sending}
                  />
                  {/* Auto mode + session started: semi-transparent overlay on input */}
                  {currentChatAgent && autoReplyEnabled && autoReplyMode === 'auto' && messages.length > 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[20px] bg-background/80 backdrop-blur-[2px]">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[11px] text-foreground/60">
                          {t('messages.autoReply.agentActive', { name: currentAgent?.name || 'Claw' })}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <div className="relative">
                          <button
                            onClick={() => setShowModeDropdown(!showModeDropdown)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border border-foreground/[0.08] text-green-400/70 hover:text-green-400 hover:border-foreground/[0.15] transition-colors"
                          >
                            {t('messages.autoReply.modeAuto')}
                            <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showModeDropdown && "rotate-180")} />
                          </button>
                          {showModeDropdown && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setShowModeDropdown(false)} />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 min-w-[190px] py-1 bg-[var(--bubble-me-bg)] border border-foreground/[0.08] rounded-lg shadow-2xl">
                                {([
                                  { key: 'auto', label: t('messages.autoReply.modeAuto') },
                                  { key: 'review', label: t('messages.autoReply.modeReview') },
                                  { key: 'service', label: t('messages.autoReply.modeService') },
                                  { key: 'paused', label: t('messages.autoReply.modePaused') },
                                ] as const).map(({ key, label }) => {
                                  const isActive = key === 'paused' ? !autoReplyEnabled : (autoReplyEnabled && autoReplyMode === key);
                                  return (
                                    <button
                                      key={key}
                                      onClick={() => {
                                        setShowModeDropdown(false);
                                        if (currentClawLinkSessionKey) {
                                          const sessions = useClawLinkStore.getState().clawLinkSessions;
                                          const updated = sessions.map(s =>
                                            s.key === currentClawLinkSessionKey ? { ...s, openclawSessionKey: null } : s
                                          );
                                          useClawLinkStore.setState({ clawLinkSessions: updated });
                                        }
                                        if (key === 'paused') {
                                          setSessionAutoReply({ enabled: false, mode: autoReplyMode });
                                        } else {
                                          setSessionAutoReply({ enabled: true, mode: key });
                                        }
                                      }}
                                      className={cn(
                                        "w-full px-3 py-2 text-left text-[11px] transition-colors flex items-center gap-2",
                                        isActive ? "text-primary bg-primary/10" : "text-foreground/60 hover:bg-accent"
                                      )}
                                    >
                                      <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-green-500" : "bg-foreground/20")} />
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        ) : (
          /* Empty state when no chat selected */
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>{t('messages.welcome.unnamedSession')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: ClawLink panel */}
      <div className="w-[300px] border-l border-border flex flex-col shrink-0 relative z-[15] bg-background">
        {/* Header */}
        <div className={`px-4 py-3.5 flex items-center justify-between ${headerH}`}>
          <div>
            <div className="text-[13px] font-semibold">ClawLink</div>
            <div className="text-[11px] text-muted-foreground">
              {activeSessions.length > 0 ? t('messages.tasksInProgress', { count: activeSessions.length }) : t('tasks.noTasks')}
            </div>
          </div>
          <button
            onClick={() => { setShowContacts(true); useClawLinkStore.getState().loadFriends(); }}
            className="relative flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap"
          >
            <Users className="h-3.5 w-3.5" />
            {t('contacts.title')}
            {friends.some(f => f.friend.status === 'pending' && f.friend.friendUserId === currentUser?.id) && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        </div>

        {/* Top/bottom 50:50 split */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* ── Top half: Running tasks ── */}
          <div className="flex-1 min-h-0 border-b border-border flex flex-col">
            <div className="pt-3 pb-1.5 px-4">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground" style={{ letterSpacing: '0.05em' }}>{t('tasks.tabs.running')}</span>
            </div>
            <div className="flex-1 overflow-auto">
            {activeSessions.length > 0 ? (
              <div>
                {activeSessions.map(session => {
                  const friend = friends.find(f => f.agents[0]?.id === session.friendAgentId);
                  if (!friend) return null;
                  const isActive = currentClawLinkSessionKey === session.key && !showNewConversation;
                  return (
                    <button
                      key={session.key}
                      onClick={() => handleSelectClawLinkSession(session.key)}
                      className={cn(
                        "w-[calc(100%-24px)] mx-3 mb-2 text-left bg-card border border-border rounded-[10px] px-3 py-2.5 transition-colors",
                        isActive ? "border-primary/50" : "hover:border-muted-foreground/20"
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span>🌐↔🧠</span>
                        <span className="font-medium truncate flex-1">× {friend.user.displayName}'s Agent</span>
                        <span className="ml-auto shrink-0 text-muted-foreground text-[10px]">{formatTime(session.lastActivity)}</span>
                      </div>
                      <div className="text-xs truncate mt-1 text-muted-foreground/70">
                        {sessionFirstMessages[session.key] || session.name || t('messages.header.newSession')}
                      </div>
                      <div className="mt-1 text-[10px] text-primary">
                        ● {t('tasks.negotiating')}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-[11px] text-center text-muted-foreground/40">{t('tasks.noTasks')}</div>
              </div>
            )}
          </div>
          </div>

          {/* ── Bottom half: Agent list ── */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="pt-3 pb-1.5 px-4">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground" style={{ letterSpacing: '0.05em' }}>{t('contacts.myFriends')}</span>
            </div>
            <div className="flex-1 overflow-auto">
              <div>
                {/* My agent — always pinned to top */}
                {currentAgent && (
                  <div
                    className="flex items-center gap-2.5 mx-2 px-2 py-2 cursor-pointer rounded-lg hover:bg-accent transition-colors group"
                    onClick={() => { clearCurrentChat(); setShowNewConversation(true); chatLoadSessions(); chatLoadHistory(true); }}
                  >
                    <div className="shrink-0">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: '#1a1a3e' }}>
                        <img src={logoPng} alt="" className="w-4.5 h-4.5" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{currentAgent.name}</div>
                      <div className="text-[10px] truncate text-muted-foreground">@{currentUser?.username}{currentUser?.bio ? ` · ${currentUser.bio}` : ''}</div>
                    </div>
                  </div>
                )}

                {acceptedFriends.map(friend => {
                  const agentId = friend.agents[0]?.id || '';
                  return (
                    <div
                      key={friend.friend.id}
                      className="flex items-center gap-2.5 mx-2 px-2 py-2 cursor-pointer rounded-lg hover:bg-accent transition-colors group"
                      onClick={() => handleSelectChat(friend)}
                    >
                      <div className="shrink-0">
                        <div className={cn("h-8 w-8 rounded-lg bg-gradient-to-br flex items-center justify-center", getAgentColor(agentId))}>
                          <span className="text-xs text-white font-bold">{friend.user.displayName.charAt(0)}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{friend.agents[0]?.name || friend.user.displayName}</div>
                        <div className="text-[10px] truncate text-muted-foreground">@{friend.user.username}{friend.user.bio ? ` · ${friend.user.bio}` : ''}</div>
                      </div>
                      <span className="text-base opacity-0 group-hover:opacity-60 transition-opacity cursor-pointer">💬</span>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Session history drawer — slides left from behind the right panel */}
      <div
        className={cn("absolute inset-0 bg-black/30 transition-opacity duration-300", showHistory ? "opacity-100 z-[14]" : "opacity-0 pointer-events-none z-0")}
        onClick={() => setShowHistory(false)}
      />
      <div className={cn(
        "absolute top-1.5 bottom-3 w-[280px] bg-background border border-border rounded-2xl flex flex-col shadow-2xl transition-all duration-300 ease-out overflow-hidden",
        showHistory ? "right-[304px] z-[14]" : "right-[4px] z-[11]"
      )}>
        {/* Header */}
        <div className="px-4 py-3.5 flex items-center justify-between border-b border-border">
          <div className="text-[14px] font-semibold">
            {showNewConversation ? t('messages.header.sessionHistory') : (currentChatAgent ? t('messages.header.sessionHistory') : t('contacts.title'))}
          </div>
          <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {showNewConversation ? (
            !sessionsReady ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
                <span className="text-sm text-muted-foreground">{t('messages.welcome.loadingSession')}</span>
              </div>
            ) : chatSessions.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-muted-foreground">{t('messages.noSessions')}</div>
            ) : (
              (() => {
                // Separate ClawLink auto-initiated sessions from manual ones
                const clawLinkKeys = new Set(clawLinkSessions.map(s => s.openclawSessionKey).filter(Boolean));
                const sorted = [...chatSessions].sort((a, b) => (chatSessionLastActivity[b.key] ?? 0) - (chatSessionLastActivity[a.key] ?? 0));
                const manualSessions = sorted.filter(s => !clawLinkKeys.has(s.key));
                const autoSessions = sorted.filter(s => clawLinkKeys.has(s.key));

                const renderSession = (session: typeof chatSessions[0]) => {
                  const isAuto = clawLinkKeys.has(session.key);
                  // Find linked ClawLink session for friend name
                  const linkedClawSession = isAuto ? clawLinkSessions.find(s => s.openclawSessionKey === session.key) : null;
                  const friendName = linkedClawSession ? getFriendDisplayName(linkedClawSession.friendAgentId) : null;

                  return (
                    <button
                      key={session.key}
                      onClick={() => { handleSelectSession(session.key); setShowHistory(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5",
                        chatCurrentSessionKey === session.key
                          ? "bg-primary/10"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn("h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-[10px]",
                          isAuto ? "bg-cyan-500/10 text-cyan-400" : "bg-primary/10 text-primary"
                        )}>
                          {isAuto ? '🤝' : '💬'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">
                            {chatSessionLabels[session.key] || t('messages.header.newSession')}
                          </div>
                          {isAuto && friendName && (
                            <div className="text-[10px] text-cyan-400/60 truncate">
                              ClawLink · {friendName}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                };

                return (
                  <div className="p-2">
                    {/* ClawLink sessions — on top, collapsed by default */}
                    {autoSessions.length > 0 && (
                      <div className="mb-2">
                        <button
                          onClick={() => setClawLinkSessionsCollapsed(!clawLinkSessionsCollapsed)}
                          className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
                        >
                          <ChevronDown className={cn("h-3 w-3 transition-transform", clawLinkSessionsCollapsed && "-rotate-90")} />
                          <span>ClawLink ({autoSessions.length})</span>
                        </button>
                        {!clawLinkSessionsCollapsed && (
                          <>
                            {autoSessions.slice(0, clawLinkSessionLoadCount).map(renderSession)}
                            {autoSessions.length > clawLinkSessionLoadCount && (
                              <button
                                onClick={() => setClawLinkSessionLoadCount(prev => prev + 5)}
                                className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                              >
                                <ChevronDown className="h-3 w-3" />
                                {t('messages.loadMore', { count: autoSessions.length - clawLinkSessionLoadCount })}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* My Conversations — always expanded */}
                    {manualSessions.length > 0 && (
                      <div>
                        <button
                          onClick={() => setMyConversationsCollapsed(!myConversationsCollapsed)}
                          className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
                        >
                          <ChevronDown className={cn("h-3 w-3 transition-transform", myConversationsCollapsed && "-rotate-90")} />
                          <span>{t('messages.myConversations')} ({manualSessions.length})</span>
                        </button>
                        {!myConversationsCollapsed && (
                          <>
                            {manualSessions.slice(0, loadedSessionCount).map(renderSession)}
                            {manualSessions.length > loadedSessionCount && (
                              <button
                                onClick={() => setLoadedSessionCount(prev => prev + 10)}
                                className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                              >
                                <ChevronDown className="h-3 w-3" />
                                {t('messages.loadMore', { count: manualSessions.length - loadedSessionCount })}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            )
          ) : currentChatAgent ? (
            (() => {
              const friendSessions = clawLinkSessions.filter(s => s.friendAgentId === currentChatAgent.id);
              return friendSessions.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-muted-foreground">{t('messages.noSessions')}</div>
              ) : (
                <div className="p-2">
                  {friendSessions.map((session) => (
                    <button
                      key={session.key}
                      onClick={() => { handleSelectClawLinkSession(session.key); setShowHistory(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5",
                        currentClawLinkSessionKey === session.key
                          ? "bg-primary/10" : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                          session.completed ? "bg-green-500/10" : "bg-primary/10"
                        )}>
                          {session.completed ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">
                            {sessionFirstMessages[session.key] || session.name || t('messages.header.newSession')}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {formatTime(session.lastActivity)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()
          ) : (
            acceptedFriends.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-muted-foreground">{t('contacts.noFriends')}</div>
            ) : (
              <div className="p-2">
                {acceptedFriends.map((friend) => (
                  <button
                    key={friend.friend.id}
                    onClick={() => { handleSelectChat(friend); setShowHistory(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5",
                      currentChatAgent?.id === friend.agents[0]?.id ? "bg-primary/10" : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", getAgentColor(friend.agents[0]?.id || ''))}>
                        <span className="text-[10px] text-white font-bold">{friend.user.displayName[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{friend.user.displayName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {friend.agents[0]?.name || '@' + friend.user.username}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Contacts drawer */}
      {/* Overlay */}
      <div
        className={cn("absolute inset-0 bg-black/30 z-20 transition-opacity duration-300", showContacts ? "opacity-100" : "opacity-0 pointer-events-none")}
        onClick={() => setShowContacts(false)}
      />
      {/* Drawer */}
      <div className={cn(
        "absolute top-1.5 right-3 bottom-3 w-[300px] bg-background border border-border rounded-2xl z-30 flex flex-col shadow-2xl transition-transform duration-300 ease-out overflow-hidden",
        showContacts ? "translate-x-0" : "translate-x-[calc(100%+12px)]"
      )}>
            {/* Header */}
            <div className={`px-4 py-3.5 flex items-center justify-between ${headerH}`}>
              <div className="text-[14px] font-semibold">{t('contacts.title')}</div>
              <button onClick={() => setShowContacts(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="absolute top-[57px] left-0 right-0 h-px bg-border" />

            {/* Search */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-[10px] focus-within:border-primary transition-colors">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    className="flex-1 bg-transparent border-none outline-none text-[13px] placeholder:text-muted-foreground/40"
                    placeholder={t('contacts.searchPlaceholder')}
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && contactSearch.trim()) {
                        setContactSearching(true);
                        searchUsers(contactSearch).then(results => {
                          setContactSearchResults(results.filter((u: any) => u.id !== currentUser?.id));
                          setContactSearching(false);
                        });
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    if (!contactSearch.trim()) return;
                    setContactSearching(true);
                    searchUsers(contactSearch).then(results => {
                      setContactSearchResults(results.filter((u: any) => u.id !== currentUser?.id));
                      setContactSearching(false);
                    });
                  }}
                  className="px-3 py-2 rounded-[10px] bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  {t('contacts.search', 'Search')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {/* {t('contacts.searchResults')} */}
              {contactSearchResults.length > 0 && (
                <div className="px-3 pb-3">
                  <div className="px-1 pb-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground" style={{ letterSpacing: '0.05em' }}>{t('contacts.searchResults')}</span>
                  </div>
                  {contactSearchResults.map((user: any) => {
                    const friendRecord = friends.find(f => f.user.id === user.id);
                    const friendStatus = friendRecord?.friend?.status; // 'accepted' | 'pending' | undefined
                    return (
                      <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors">
                        <div className="h-9 w-9 rounded-[10px] bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0">
                          <span className="text-xs text-white font-bold">{user.displayName?.charAt(0) || '?'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium">{user.displayName}</div>
                          <div className="text-[11px] text-muted-foreground">@{user.username}</div>
                        </div>
                        {friendStatus === 'accepted' ? (
                          <span className="text-[11px] text-muted-foreground/60">{t('contacts.alreadyFriend')}</span>
                        ) : friendStatus === 'pending' ? (
                          <span className="text-[11px] text-primary/60">{t('contacts.requestSent')}</span>
                        ) : (
                          <button
                            onClick={async () => {
                              setAddingFriend(user.id);
                              await addFriendRequest(user.username);
                              await loadFriends();
                              setAddingFriend(null);
                            }}
                            disabled={addingFriend === user.id}
                            className="px-3 py-1 rounded-lg text-[11px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {addingFriend === user.id ? t('contacts.adding') : `+ ${t('contacts.add')}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {contactSearching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Pending friend requests */}
              {(() => {
                const pending = friends.filter(f => f.friend.status === 'pending' && f.friend.friendUserId === currentUser?.id);
                if (pending.length === 0) return null;
                return (
                  <div className="px-3 pb-3">
                    <div className="px-1 pb-2 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground" style={{ letterSpacing: '0.05em' }}>{t('contacts.pendingRequests')}</span>
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-medium">{pending.length}</span>
                    </div>
                    {pending.map(friend => (
                      <div key={friend.friend.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-card border border-border mb-2">
                        <div className="h-9 w-9 rounded-[10px] bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                          <span className="text-xs text-white font-bold">{friend.user.displayName.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium">{friend.user.displayName}</div>
                          <div className="text-[11px] text-muted-foreground">@{friend.user.username}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={async () => { await acceptFriend(friend.friend.id); await loadFriends(); }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-green-500 border border-green-500/30 hover:bg-green-500/10 transition-colors"
                          >
                            {t('contacts.accept')}
                          </button>
                          <button
                            onClick={async () => { await rejectFriend(friend.friend.id); await loadFriends(); }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                          >
                            {t('contacts.reject')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Friend list */}
              <div className="px-3">
                <div className="px-1 pb-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground" style={{ letterSpacing: '0.05em' }}>{t('contacts.myFriends')} ({acceptedFriends.length})</span>
                </div>
                {acceptedFriends.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground/40 text-[12px]">{t('contacts.findFriends')}</div>
                ) : (
                  acceptedFriends.map(friend => {
                    const agentId = friend.agents[0]?.id || '';
                    return (
                      <div
                        key={friend.friend.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                        onClick={() => { handleSelectChat(friend); setShowContacts(false); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setFriendContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            friendId: friend.friend.id,
                            name: friend.agents[0]?.name || friend.user.displayName,
                          });
                        }}
                      >
                        <div className="shrink-0">
                          <div className={cn("h-9 w-9 rounded-[10px] bg-gradient-to-br flex items-center justify-center", getAgentColor(agentId))}>
                            <span className="text-xs text-white font-bold">{friend.user.displayName.charAt(0)}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium">{friend.agents[0]?.name || friend.user.displayName}</div>
                          <div className="text-[11px] text-muted-foreground">@{friend.user.username}{friend.user.bio ? ` · ${friend.user.bio}` : ''}</div>
                        </div>
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleSelectChat(friend); setShowContacts(false); }}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* My Agent footer */}
            {currentUser && currentAgent && (
              <div className="shrink-0 px-4 py-3 border-t border-border">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <img src={logoPng} alt="" className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{currentAgent.name}</div>
                    <div className="text-[10px] text-muted-foreground">@{currentUser.username}</div>
                  </div>
                  <button
                    onClick={() => setShareCardOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Share2 className="h-3 w-3" />
                    Share
                  </button>
                </div>
              </div>
            )}
          </div>

      {/* Friend context menu */}
      {friendContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setFriendContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[140px] py-1 bg-[var(--bubble-me-bg)] border border-foreground/[0.08] rounded-lg shadow-2xl backdrop-blur-sm"
            style={{ left: friendContextMenu.x, top: friendContextMenu.y }}
          >
            <button
              className="w-full px-3 py-2 text-left text-[12px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              onClick={() => {
                setDeleteConfirm({ friendId: friendContextMenu.friendId, name: friendContextMenu.name });
                setFriendContextMenu(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
              {t('contacts.delete')}
            </button>
          </div>
        </>
      )}

      {/* Delete friend confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 w-[320px] bg-card border border-border rounded-2xl shadow-2xl p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-[15px] font-semibold text-foreground mb-1.5">{t('contacts.delete')}</h3>
              <p className="text-[12px] text-muted-foreground/80 leading-relaxed">
                {t('contacts.confirmDelete', { name: deleteConfirm.name })}
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-muted/60 text-foreground/60 hover:bg-accent transition-colors"
              >
                {t('profile.cancel')}
              </button>
              <button
                onClick={async () => {
                  const { friendId, name } = deleteConfirm;
                  setDeleteConfirm(null);
                  const ok = await useClawLinkStore.getState().deleteFriend(friendId);
                  if (ok) {
                    toast.success(t('contacts.deleteSuccess', { name }));
                    if (currentChatAgent && friends.find(f => f.friend.id === friendId)?.agents?.some(a => a.id === currentChatAgent.id)) {
                      clearCurrentChat();
                      setShowNewConversation(true);
                      useClawLinkStore.setState({ currentClawLinkSessionKey: undefined });
                    }
                  } else {
                    toast.error(t('contacts.deleteFailed'));
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              >
                {t('contacts.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Card Modal */}
      {shareCardOpen && currentUser && currentAgent && (
        <ShareCardModal user={currentUser} agent={currentAgent} onClose={() => setShareCardOpen(false)} />
      )}

      {/* Owner assistance request dialog */}
      {pendingOwnerRequest && (
        <OwnerRequestToast
          question={pendingOwnerRequest.question}
          friendName={pendingOwnerRequest.friendName}
          type={pendingOwnerRequest.type}
          onReply={respondToOwnerRequest}
          onSkip={skipOwnerRequest}
        />
      )}
    </div>
  );
}

// ── Share Card Modal ──
// Canvas rendering for "copy image" to produce a pixel-perfect card
function renderCardToCanvas(
  user: { displayName: string; username: string; bio: string; company: string },
  agent: { name: string },
  i18n: { slogan: string; searchText: string; tagAssistant: string },
  isDark = true,
): HTMLCanvasElement {
  const W = 960;
  const hasBio = !!user.bio;
  const H = hasBio ? 440 : 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (isDark) {
    bg.addColorStop(0, '#0c0c1f');
    bg.addColorStop(0.4, '#151538');
    bg.addColorStop(1, '#0a1a2e');
  } else {
    bg.addColorStop(0, '#f4f4fb');
    bg.addColorStop(0.4, '#eaedff');
    bg.addColorStop(1, '#edf2ff');
  }
  ctx.fillStyle = bg;
  ctx.beginPath();
  // Rounded rect
  const r = 32;
  ctx.moveTo(r, 0); ctx.lineTo(W - r, 0); ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.fill(); ctx.clip();

  // Decorative circles
  const drawGlow = (x: number, y: number, rad: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  drawGlow(730, 85, 170, 'rgba(99,102,241,0.08)');
  drawGlow(620, 200, 85, 'rgba(34,211,238,0.06)');
  drawGlow(140, 540, 110, 'rgba(139,92,246,0.05)');

  ctx.textAlign = 'left'; ctx.textBaseline = 'top';

  // Avatar box (left)
  const ax = 64, ay = 64, as = 120;
  const ag = ctx.createLinearGradient(ax, ay, ax + as, ay + as);
  ag.addColorStop(0, 'rgba(99,102,241,0.25)'); ag.addColorStop(1, 'rgba(139,92,246,0.15)');
  ctx.fillStyle = ag;
  ctx.beginPath();
  const ar = 28;
  ctx.moveTo(ax + ar, ay); ctx.lineTo(ax + as - ar, ay); ctx.quadraticCurveTo(ax + as, ay, ax + as, ay + ar);
  ctx.lineTo(ax + as, ay + as - ar); ctx.quadraticCurveTo(ax + as, ay + as, ax + as - ar, ay + as);
  ctx.lineTo(ax + ar, ay + as); ctx.quadraticCurveTo(ax, ay + as, ax, ay + as - ar);
  ctx.lineTo(ax, ay + ar); ctx.quadraticCurveTo(ax, ay, ax + ar, ay);
  ctx.closePath(); ctx.fill();
  // Agent initial
  ctx.font = 'bold 48px -apple-system, "SF Pro Display", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(99,102,241,0.7)';
  ctx.fillText(agent.name[0] || 'C', ax + as / 2, ay + as / 2 + 2);
  // Online dot
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.arc(ax + as - 6, ay + as - 6, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isDark ? '#0c0c1f' : '#f4f4fb';
  ctx.beginPath(); ctx.arc(ax + as - 6, ay + as - 6, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.arc(ax + as - 6, ay + as - 6, 7, 0, Math.PI * 2); ctx.fill();

  // Name (next to avatar)
  const nameX = ax + as + 28;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const textPrimary = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(15,15,30,0.88)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,15,30,0.45)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,15,30,0.15)';
  const textQuaternary = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,15,30,0.25)';

  ctx.font = 'bold 42px -apple-system, "SF Pro Display", "Segoe UI", sans-serif';
  ctx.fillStyle = textPrimary;
  ctx.fillText(agent.name, nameX, ay + 12);

  // @username · company
  ctx.font = '24px -apple-system, "SF Pro Text", sans-serif';
  ctx.fillStyle = textSecondary;
  ctx.fillText(`@${user.username} · ${user.company || 'ClawLink'}`, nameX, ay + 68);

  // Slogan (top right)
  ctx.textAlign = 'right';
  ctx.font = '500 16px -apple-system, "SF Pro Text", sans-serif';
  ctx.fillStyle = textTertiary;
  ctx.fillText('CLAWLINK', W - 64, ay + 12);
  ctx.font = 'italic 500 22px -apple-system, "SF Pro Text", sans-serif';
  ctx.fillStyle = textQuaternary;
  ctx.fillText('AI Agent Network', W - 64, ay + 38);
  ctx.textAlign = 'left';

  // Bio
  let nextY = ay + as + 28;
  if (user.bio) {
    ctx.font = 'italic 24px -apple-system, "SF Pro Text", sans-serif';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,15,30,0.3)';
    ctx.fillText(`"${user.bio}"`, 64, nextY);
    nextY += 48;
  }

  // Tags
  const tags = [
    { text: 'AI Agent', bg: 'rgba(99,102,241,0.15)', fg: 'rgba(129,140,248,0.8)' },
    { text: 'ClawLink', bg: 'rgba(34,211,238,0.1)', fg: 'rgba(34,211,238,0.7)' },
    { text: i18n.tagAssistant, bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,15,30,0.05)', fg: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,15,30,0.4)' },
  ];
  let tx = 64;
  const ty = nextY;
  ctx.font = '500 24px -apple-system, "SF Pro Text", sans-serif';
  for (const tag of tags) {
    const tw = ctx.measureText(tag.text).width + 36;
    ctx.fillStyle = tag.bg;
    ctx.beginPath();
    const tr = 24;
    ctx.moveTo(tx + tr, ty); ctx.lineTo(tx + tw - tr, ty); ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + tr);
    ctx.lineTo(tx + tw, ty + 46 - tr); ctx.quadraticCurveTo(tx + tw, ty + 46, tx + tw - tr, ty + 46);
    ctx.lineTo(tx + tr, ty + 46); ctx.quadraticCurveTo(tx, ty + 46, tx, ty + 46 - tr);
    ctx.lineTo(tx, ty + tr); ctx.quadraticCurveTo(tx, ty, tx + tr, ty);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = tag.fg;
    ctx.fillText(tag.text, tx + 18, ty + 10);
    tx += tw + 12;
  }

  // Divider line
  const dy = ty + 70;
  const dg = ctx.createLinearGradient(64, dy, W - 64, dy);
  dg.addColorStop(0, 'transparent'); dg.addColorStop(0.5, isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,15,30,0.08)'); dg.addColorStop(1, 'transparent');
  ctx.fillStyle = dg;
  ctx.fillRect(64, dy, W - 128, 1);

  // Bottom section
  ctx.font = '500 18px -apple-system, "SF Pro Text", sans-serif';
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,15,30,0.2)';
  ctx.textAlign = 'left';
  ctx.fillText(i18n.slogan, 64, dy + 28);
  ctx.font = '24px -apple-system, "SF Pro Text", sans-serif';
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,15,30,0.5)';
  ctx.fillText(i18n.searchText, 64, dy + 62);

  // ClawLink logo
  ctx.font = 'bold 30px -apple-system, sans-serif';
  ctx.fillStyle = isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.4)';
  ctx.textAlign = 'right';
  ctx.letterSpacing = '2px';
  ctx.fillText('ClawLink', W - 64, dy + 50);

  return c;
}

function ShareCardModal({ user, agent, onClose }: { user: { displayName: string; username: string; bio: string; company: string }; agent: { name: string }; onClose: () => void }) {
  const { t: tShare } = useTranslation('clawlink');
  const handleCopyId = async () => {
    try { await navigator.clipboard.writeText(user.username); toast.success(tShare('shareCard.usernameCopied')); }
    catch { toast.error(tShare('shareCard.copyFailed')); }
  };

  const handleCopyImage = async () => {
    try {
      const isDark = document.documentElement.classList.contains('dark');
      const canvas = renderCardToCanvas(user, agent, {
        slogan: tShare('shareCard.slogan'),
        searchText: tShare('shareCard.searchToAdd', { username: user.username }),
        tagAssistant: tShare('shareCard.tagAssistant'),
      }, isDark);
      canvas.toBlob(async (blob) => {
        if (!blob) { toast.error(tShare('shareCard.imageFailed')); return; }
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast.success(tShare('shareCard.imageCopied')); }
        catch { toast.error(tShare('shareCard.imageFailed')); }
      }, 'image/png');
    } catch { toast.error(tShare('shareCard.imageFailed')); }
  };

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="fixed inset-0 z-[200] bg-white/70 dark:bg-black/70 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
      <div className="flex flex-col items-center gap-5" onClick={e => e.stopPropagation()}>
        {/* Visual card (display only, canvas handles export) */}
        <div className="w-[480px] rounded-2xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/40 bg-gradient-to-br from-[#f4f4fb] via-[#eaedff] to-[#edf2ff] dark:from-[#0c0c1f] dark:via-[#151538] dark:to-[#0a1a2e]">
          {/* Top */}
          <div className="relative px-8 pt-7 pb-7">
            {/* Glows */}
            <div className="absolute top-4 right-6 w-32 h-32 rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
            <div className="absolute top-20 right-20 w-16 h-16 rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }} />
            <div className="absolute bottom-0 left-10 w-20 h-20 rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }} />

            {/* Avatar + Name + Slogan row */}
            <div className="flex items-start gap-4 mb-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-[72px] h-[72px] rounded-xl bg-gradient-to-br from-primary/25 to-violet-500/15 flex items-center justify-center border border-foreground/[0.06]">
                  <img src={logoPng} alt="" className="w-9 h-9" />
                </div>
              </div>
              {/* Name */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="text-[24px] font-bold text-foreground tracking-tight leading-tight">{agent.name}</div>
                <div className="text-[14px] text-muted-foreground mt-1">@{user.username} · {user.company || 'ClawLink'}</div>
              </div>
              {/* Slogan (right side) */}
              <div className="shrink-0 text-right pt-1">
                <div className="text-[11px] text-muted-foreground/40 tracking-[0.12em] leading-tight">{tShare('shareCard.sloganLine1')}</div>
                <div className="text-[14px] font-medium text-muted-foreground/60 mt-0.5 italic">{tShare('shareCard.sloganLine2')}</div>
              </div>
            </div>

            {user.bio && (
              <div className="text-[14px] text-muted-foreground leading-relaxed mb-4 italic">"{user.bio}"</div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5">
              <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-primary/15 text-primary/80">AI Agent</span>
              <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-cyan-500/10 text-cyan-400/70">ClawLink</span>
              <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-muted text-muted-foreground">{tShare('shareCard.tagAssistant')}</span>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
          </div>

          {/* Bottom */}
          <div className="px-8 py-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-muted-foreground/60 tracking-[0.15em] mb-1">{tShare('shareCard.slogan')}</div>
              <div className="text-[14px] text-muted-foreground">{tShare('shareCard.searchToAdd', { username: user.username })}</div>
            </div>
            <div className="text-[18px] font-bold text-primary/30 tracking-wider">ClawLink</div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button onClick={handleCopyId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 border border-black/10 dark:border-white/10 text-[12px] text-foreground/80 hover:text-foreground transition-all">
            <Copy className="h-3.5 w-3.5" />{tShare('shareCard.copyUsername')}
          </button>
          <button onClick={handleCopyImage}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/20 text-[12px] text-primary transition-all">
            <ImageIcon className="h-3.5 w-3.5" />{tShare('shareCard.copyCard')}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[12px] text-muted-foreground hover:text-foreground transition-all">
            {tShare('shareCard.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Owner Request Toast (input type + auth type) ──
function OwnerRequestToast({ question, friendName, type, onReply, onSkip }: {
  question: string;
  friendName: string;
  type: 'input' | 'auth';
  onReply: (reply: string) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation('clawlink');
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isAuth = type === 'auth';

  useEffect(() => { if (!isAuth) inputRef.current?.focus(); }, [isAuth]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onReply(input.trim());
    setInput('');
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200] w-[380px]">
      <div className="rounded-2xl overflow-hidden shadow-2xl relative bg-card border border-border">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${isAuth ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.3)'}, transparent)` }} />
        <div className="px-5 pt-4 pb-3">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: isAuth ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <span className="text-[8px] font-black text-white">{isAuth ? '!' : 'CL'}</span>
            </div>
            <span className="text-[12px] font-semibold text-foreground/80">
              {isAuth ? t('messages.ownerRequest.titleAuth') : t('messages.ownerRequest.title')}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground/60 mb-3">{t('messages.ownerRequest.from', { friend: friendName })}</div>

          {/* Question */}
          <div className="px-3 py-2.5 rounded-xl mb-3 text-[13px] leading-relaxed text-foreground/70" style={{ background: isAuth ? 'rgba(245,158,11,0.06)' : 'rgba(99,102,241,0.06)', border: `1px solid ${isAuth ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)'}` }}>
            {question}
          </div>

          {isAuth ? (
            /* Auth type: Approve / Reject buttons */
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => onReply('Approve')}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:-translate-y-px"
                style={{ background: '#22c55e', boxShadow: '0 2px 12px rgba(34,197,94,0.2)' }}
              >
                {t('messages.ownerRequest.approve')}
              </button>
              <button
                onClick={onSkip}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition-all hover:-translate-y-px"
                style={{ background: 'rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.8)', border: '1px solid rgba(239,68,68,0.1)' }}
              >
                {t('messages.ownerRequest.reject')}
              </button>
            </div>
          ) : (
            /* Input type: text input + send */
            <>
              <div className="flex gap-2 mb-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit(); }}
                  placeholder={t('messages.ownerRequest.placeholder')}
                  className="flex-1 px-3 py-2 rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 bg-muted border border-border"
                />
                <button
                  onClick={() => onReply('你自己决定')}
                  className="px-3 py-2 rounded-lg text-[12px] font-semibold transition-all hover:-translate-y-px"
                  style={{ background: 'rgba(245,158,11,0.15)', color: 'rgba(245,158,11,0.9)', border: '1px solid rgba(245,158,11,0.1)' }}
                >
                  {t('messages.ownerRequest.youDecide', '你自己决定')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all disabled:opacity-30"
                  style={{ background: '#6366f1' }}
                >
                  {t('messages.ownerRequest.send')}
                </button>
              </div>
              <button onClick={onSkip} className="w-full text-center text-[10px] text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors pb-1">
                {t('messages.ownerRequest.skip')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── File Card with auto-download + smart click ──
function FileCard({ url, name, mime, size, isMe, autoDownload }: { url: string; name: string; mime: string; size: string; isMe: boolean; autoDownload?: boolean }) {
  const { t } = useTranslation('clawlink');
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [localPath, setLocalPath] = useState<string | null>(null);
  const downloadedRef = useRef(false);

  const isImage = mime.startsWith('image/');
  const sizeNum = parseInt(size, 10);
  const sizeStr = sizeNum > 0 ? (sizeNum < 1024 ? `${sizeNum} B` : sizeNum < 1048576 ? `${(sizeNum/1024).toFixed(1)} KB` : `${(sizeNum/1048576).toFixed(1)} MB`) : '';

  const doDownload = useCallback(async (reveal: boolean) => {
    if (downloadedRef.current && localPath) {
      // Already downloaded — just reveal
      if (reveal) invokeIpc('shell:showItemInFolder', localPath);
      return;
    }
    if (downloadState === 'downloading') return;
    setDownloadState('downloading');
    try {
      const result = await invokeIpc('clawlink:downloadAndReveal', { url, fileName: name }) as any;
      if (result?.success) {
        setDownloadState('done');
        setLocalPath(result.path);
        downloadedRef.current = true;
        // Auto-download: don't open Finder; only open on click
        if (reveal) invokeIpc('shell:showItemInFolder', result.path);
      } else {
        setDownloadState('error');
      }
    } catch {
      setDownloadState('error');
    }
  }, [url, name, downloadState, localPath]);

  // Auto-download on mount (for received files)
  useEffect(() => {
    if (autoDownload && !downloadedRef.current) {
      doDownload(false);
    }
  }, []);

  const handleClick = () => {
    if (downloadedRef.current && localPath) {
      invokeIpc('shell:showItemInFolder', localPath);
    } else {
      doDownload(true);
    }
  };

  return (
    <div className={cn("rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity", isMe ? "border-foreground/[0.06]" : "border-border")} onClick={handleClick} title={downloadedRef.current ? t('messages.clickToOpenFile') : t('messages.clickToDownload')}>
      {isImage ? (
        <img src={url} alt={name} className="max-w-[200px] max-h-[160px] object-cover" />
      ) : (
        <div className={cn("flex items-center gap-2.5 px-3 py-2.5", isMe ? "bg-[var(--bubble-me-bg)]" : "bg-muted/50")}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isMe ? 'rgba(99,102,241,0.15)' : 'var(--surface-hover)' }}>
            {downloadState === 'downloading' ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            ) : downloadState === 'done' ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 overflow-hidden">
            <p className={cn("text-[12px] font-medium truncate max-w-[180px]", isMe ? "text-[var(--bubble-me-text)]" : "")}>{name}</p>
            <p className="text-[10px] text-muted-foreground">
              {downloadState === 'downloading' ? t('messages.downloading') : downloadState === 'done' ? t('messages.downloaded') : sizeStr}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
