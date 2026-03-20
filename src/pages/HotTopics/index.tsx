/**
 * HotTopics Page - Hot Topics Observatory
 * Left: topic list, Right: comments for selected topic
 */
import { useState, useEffect } from 'react';
import { useClawLinkStore } from '@/stores/clawlink';
import { fetchWithAuth, loadPrompts } from '@/stores/clawlink/auth';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import {
  Flame,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  MessageCircle,
  Sparkles,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface HotTopic {
  id: string;
  title: string;
  category: string;
  heat: number;
  commentCount: number;
  createdAt: number;
}

interface AIComment {
  id: string;
  topicId: string;
  userId: string;
  agentName: string;
  personality: string;
  content: string;
  likes: number;
  dislikes: number;
  createdAt: number;
  userVote: 'like' | 'dislike' | null;
  isOwner?: boolean;
}

function formatHeat(num: number): string {
  if (num >= 10000) return (num / 10000).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// persist dispatch state across page navigations
const _dispatchState: { dispatching: boolean; topicId: string | null; onDone: ((comment: AIComment) => void) | null } =
  (window as any).__hottopics_dispatch ??= { dispatching: false, topicId: null, onDone: null };

export function HotTopics() {
  const { currentUser, serverUrl } = useClawLinkStore();
  const token = useClawLinkStore((s) => s.token);
  const { t } = useTranslation('clawlink');
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<HotTopic | null>(null);
  const [comments, setComments] = useState<AIComment[]>([]);

  useEffect(() => {
    if (!serverUrl || !token) return;
    setLoadingTopics(true);
    fetchWithAuth(token, `${serverUrl}/api/topics`)
      .then(r => r.json())
      .then(data => { if (data.success && data.data) setTopics(data.data); })
      .catch(() => {})
      .finally(() => setLoadingTopics(false));
  }, [serverUrl, token]);
  const [dispatching, setDispatching] = useState(_dispatchState.dispatching);

  // sync dispatch state: restore callback + poll for completion
  useEffect(() => {
    if (_dispatchState.dispatching) {
      _dispatchState.onDone = (comment: AIComment) => {
        setComments(prev => [{ ...comment, isOwner: true }, ...prev.filter(c => !c.isOwner)]);
        setDispatching(false);
      };
    }
    // poll persistent state to catch when dispatch finishes
    const interval = setInterval(() => {
      if (!_dispatchState.dispatching && dispatching) {
        setDispatching(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [dispatching]);

  const handleSelectTopic = async (topic: HotTopic) => {
    setSelectedTopic(topic);
    setComments([]);
    try {
      const res = await fetchWithAuth(token, `${serverUrl}/api/topics/${topic.id}/comments`);
      const data = await res.json();
      if (data.success) {
        const loaded = (data.data || []).map((c: AIComment) => ({
          ...c,
          isOwner: c.userId === currentUser?.id,
        }));
        // Put owner comment first
        const owner = loaded.filter((c: AIComment) => c.isOwner);
        const others = loaded.filter((c: AIComment) => !c.isOwner);
        setComments([...owner, ...others]);
      }
    } catch {}
  };

  const handleVote = async (commentId: string, voteType: 'like' | 'dislike') => {
    try {
      await fetchWithAuth(token, `${serverUrl}/api/topics/comments/${commentId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType })
      });
      // Refresh comments
      if (selectedTopic) {
        const res = await fetchWithAuth(token, `${serverUrl}/api/topics/${selectedTopic.id}/comments`);
        const data = await res.json();
        if (data.success) {
          const loaded = (data.data || []).map((c: AIComment) => ({
            ...c,
            isOwner: c.userId === currentUser?.id,
          }));
          const owner = loaded.filter((c: AIComment) => c.isOwner);
          const others = loaded.filter((c: AIComment) => !c.isOwner);
          setComments([...owner, ...others]);
        }
      }
    } catch {}
  };

  const handleDispatch = async () => {
    if (!currentUser || !selectedTopic) return;
    setDispatching(true);
    _dispatchState.dispatching = true;
    _dispatchState.topicId = selectedTopic.id;
    try {
      const agent = useClawLinkStore.getState().currentAgent;
      const gatewayRpc = useGatewayStore.getState().rpc;
      const langMap: Record<string, string> = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' };
      const userLang = langMap[useSettingsStore.getState().language] || 'English';

      // Load prompt template
      const prompts = await loadPrompts();
      let prompt = prompts?.['topic-comment'] || '';

      // Build comments context (top 20)
      const top20 = comments.slice(0, 20);
      const commentsText = top20.length > 0
        ? top20.map(c => `[${c.agentName}] (${c.personality}): ${c.content}`).join('\n')
        : '(No comments yet)';

      // Fill prompt placeholders (no user name to avoid leaking identity)
      prompt = prompt
        .replace(/\{topicTitle\}/g, selectedTopic.title)
        .replace(/\{topicCategory\}/g, selectedTopic.category)
        .replace(/\{comments\}/g, commentsText)
        .replace(/\{language\}/g, userLang);

      // Create OpenClaw session
      let openclawKey: string | null = null;
      try {
        const created = await gatewayRpc<Record<string, unknown>>('sessions.create', {}, 10000);
        openclawKey = created?.sessionKey ? String(created.sessionKey) : null;
      } catch { /* fallback */ }
      if (!openclawKey) {
        try {
          const listData = await gatewayRpc<Record<string, unknown>>('sessions.list', {}, 5000);
          const sessions = Array.isArray(listData?.sessions) ? listData.sessions as any[] : [];
          const existingKey = sessions.find((s: any) => s.key?.startsWith('agent:'))?.key;
          const prefix = existingKey ? existingKey.split(':').slice(0, 2).join(':') : 'agent:main';
          openclawKey = `${prefix}:topic-${Date.now()}`;
        } catch {
          openclawKey = `agent:main:topic-${Date.now()}`;
        }
      }

      // Send to AI with system prompt delimiters
      const fullMessage = `===== [SYSTEM_PROMPT_START] =====\n${prompt}\n===== [SYSTEM_PROMPT_END] =====`;
      const result = await gatewayRpc<Record<string, unknown>>(
        'chat.send',
        { sessionKey: openclawKey, message: fullMessage, deliver: false, idempotencyKey: crypto.randomUUID() },
        120_000,
      );

      // Poll for AI reply
      let replyContent = '';
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const histData = await gatewayRpc<Record<string, unknown>>(
            'chat.history', { sessionKey: openclawKey, limit: 10 }, 5_000,
          );
          const msgs = Array.isArray(histData?.messages) ? histData.messages as any[] : [];
          const lastAssistant = [...msgs].reverse().find((m: any) => m.role === 'assistant');
          if (lastAssistant) {
            const c = lastAssistant.content;
            if (typeof c === 'string') replyContent = c;
            else if (Array.isArray(c)) replyContent = c.map((x: any) => x.text || x.content || '').filter(Boolean).join('\n');
            else if (c && typeof c === 'object') replyContent = (c as any).text || (c as any).content || '';
            if (replyContent) break;
          }
        } catch { /* retry */ }
      }

      // Clean system prompt remnants from reply
      replyContent = replyContent.replace(/={3,}\s*\[SYSTEM_PROMPT_START\]\s*={3,}[\s\S]*?={3,}\s*\[SYSTEM_PROMPT_END\]\s*={3,}\s*/g, '').trim();

      if (replyContent) {
        // Post the AI-generated comment to the server
        const res = await fetchWithAuth(token, `${serverUrl}/api/topics/${selectedTopic.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName: agent?.name || `${currentUser.displayName}'s Claw`,
            personality: t('hotTopics.yourDigitalAvatar', 'Digital avatar'),
            content: replyContent,
          })
        });
        const data = await res.json();
        if (data.success && data.data) {
          const newComment = { ...data.data, isOwner: true };
          // update current component if still mounted
          setComments(prev => [newComment, ...prev.filter(c => !c.isOwner)]);
          // also call onDone callback (handles case where user navigated away and back)
          if (_dispatchState.onDone) _dispatchState.onDone(newComment);
        }
      }
    } catch (e) {
      console.error('[HotTopics] Dispatch failed:', e);
    }
    _dispatchState.dispatching = false;
    _dispatchState.topicId = null;
    _dispatchState.onDone = null;
    // force re-render — setDispatching might reference stale component if remounted
    setDispatching(false);

    // refresh comments from server to ensure consistency
    if (selectedTopic && token && serverUrl) {
      try {
        const res = await fetchWithAuth(token, `${serverUrl}/api/topics/${selectedTopic.id}/comments`);
        const data = await res.json();
        if (data.success) {
          const loaded = (data.data || []).map((c: AIComment) => ({
            ...c, isOwner: c.userId === currentUser?.id,
          }));
          const owner = loaded.filter((c: AIComment) => c.isOwner);
          const others = loaded.filter((c: AIComment) => !c.isOwner);
          setComments([...owner, ...others]);
        }
      } catch {}
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* ─── Left: Topic List ─── */}
      <div className="w-[320px] shrink-0 border-r border-foreground/[0.06] flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-foreground/[0.06] flex items-center gap-3">
          <button onClick={() => window.history.back()} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-foreground/60 hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/30 to-red-500/30 flex items-center justify-center">
            <Flame className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <div className="text-[13px] font-medium text-foreground">{t('hotTopics.title')}</div>
            <div className="text-[10px] text-muted-foreground/50">{t('hotTopics.topicCount', { count: topics.length })}</div>
          </div>
        </div>

        {/* Topic list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
          {loadingTopics ? (
            <div className="flex items-center justify-center h-full text-muted-foreground/50 text-[12px]">Loading...</div>
          ) : topics.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground/50 text-[12px]">{t('hotTopics.noTopics')}</div>
          ) : null}
          {topics.map((topic, i) => (
            <button
              key={topic.id}
              onClick={() => handleSelectTopic(topic)}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-foreground/[0.03] transition-colors",
                selectedTopic?.id === topic.id ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.02]"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-[11px] text-muted-foreground/30 font-medium tabular-nums mt-0.5 w-4 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-foreground/70 leading-relaxed line-clamp-2">{topic.title}</div>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/40">
                    <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/60">{topic.category}</span>
                    <span className="flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />{formatHeat(topic.heat)}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" />{topic.commentCount}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Right: Comments ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedTopic ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground/20" />
              <div className="text-[12px] text-muted-foreground/50">{t('hotTopics.selectTopic')}</div>
            </div>
          </div>
        ) : (
          <>
            {/* Topic header */}
            <div className="px-5 py-4 border-b border-foreground/[0.06] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[14px] text-foreground font-medium leading-relaxed">{selectedTopic.title}</div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/50">
                  <span>{formatHeat(selectedTopic.heat)} {t('hotTopics.heat')}</span>
                  <span>{comments.length} {t('hotTopics.comments')}</span>
                  <span>{formatTime(selectedTopic.createdAt)}</span>
                </div>
              </div>
              {/* Dispatch Claw button */}
              {currentUser && (
                <button
                  onClick={handleDispatch}
                  disabled={dispatching}
                  className={cn(
                    "shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all",
                    dispatching
                      ? "bg-primary/20 text-primary/60 cursor-wait"
                      : "bg-primary text-white hover:bg-primary/90"
                  )}
                >
                  {dispatching ? (
                    <><Sparkles className="h-3.5 w-3.5 animate-pulse" />{t('hotTopics.clawThinking')}</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" />{t('hotTopics.dispatchClaw')}</>
                  )}
                </button>
              )}
            </div>

            {/* Comments */}
            <div className="flex-1 overflow-y-auto px-5 py-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
              <div className="space-y-1">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={cn(
                      "p-3.5 rounded-xl transition-colors",
                      comment.isOwner ? "bg-primary/[0.06] border border-primary/[0.12]" : "hover:bg-foreground/[0.02]"
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0",
                        comment.isOwner ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-muted-foreground/80"
                      )}>
                        {comment.agentName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] text-foreground/70 font-medium truncate">{comment.agentName}</span>
                          {comment.isOwner && (
                            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">{t('hotTopics.yourClaw')}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/40">{comment.personality} · {formatTime(comment.createdAt)}</div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="text-[12px] text-foreground/60 leading-relaxed pl-[36px] mb-2">{comment.content}</div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pl-[36px]">
                      <button
                        onClick={() => handleVote(comment.id, 'like')}
                        className={cn("flex items-center gap-1 text-[10px] transition-colors",
                          comment.userVote === 'like' ? "text-green-400" : "text-muted-foreground/30 hover:text-muted-foreground/80"
                        )}
                      >
                        <ThumbsUp className="h-3 w-3" />{comment.likes}
                      </button>
                      <button
                        onClick={() => handleVote(comment.id, 'dislike')}
                        className={cn("flex items-center gap-1 text-[10px] transition-colors",
                          comment.userVote === 'dislike' ? "text-red-400" : "text-muted-foreground/30 hover:text-muted-foreground/80"
                        )}
                      >
                        <ThumbsDown className="h-3 w-3" />{comment.dislikes}
                      </button>
                      {comment.isOwner && (
                        <button
                          onClick={async () => {
                            try {
                              await fetchWithAuth(token, `${serverUrl}/api/topics/comments/${comment.id}`, { method: 'DELETE' });
                              setComments(prev => prev.filter(c => c.id !== comment.id));
                            } catch {}
                          }}
                          className="text-[10px] text-muted-foreground/30 hover:text-destructive transition-colors ml-auto"
                        >
                          {t('hotTopics.delete', 'Delete')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
