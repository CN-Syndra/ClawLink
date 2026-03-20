/**
 * TaskResults Page
 * Three-column layout: agent list | task list | task detail with chat preview
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClawLinkStore } from '@/stores/clawlink';
import type { Message } from '@/stores/clawlink';
import { fetchWithAuth } from '@/stores/clawlink/auth';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function TaskResults() {
  const { t } = useTranslation('clawlink');
  const navigate = useNavigate();
  const {
    taskResults, markAllTaskResultsRead, hasUnreadTaskResults,
    currentUser, switchClawLinkSession, setCurrentChat,
    friends, loadMessages, currentAgent, token, serverUrl,
  } = useClawLinkStore();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'running' | 'done' | 'all'>('all');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<Message[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const acceptedFriends = friends.filter(f => f.friend.status === 'accepted');
  const clawLinkSessions = useClawLinkStore(s => s.clawLinkSessions);
  const activeSessions = clawLinkSessions.filter(s => !s.completed);

  useEffect(() => {
    if (currentUser) useClawLinkStore.getState().loadTaskResults();
  }, [currentUser]);

  useEffect(() => {
    if (hasUnreadTaskResults) markAllTaskResultsRead();
  }, [hasUnreadTaskResults, markAllTaskResultsRead]);

  // Load conversation preview when a task is selected
  useEffect(() => {
    if (!selectedTaskId || !currentAgent || !serverUrl) { setPreviewMessages([]); return; }
    const task = taskResults.find(t => t.id === selectedTaskId);
    if (!task) { setPreviewMessages([]); return; }

    setLoadingPreview(true);
    const url = task.sessionId
      ? `${serverUrl}/api/messages/${currentAgent.id}/${task.friendAgentId}?sessionId=${task.sessionId}`
      : `${serverUrl}/api/messages/${currentAgent.id}/${task.friendAgentId}`;

    fetchWithAuth(token, url)
      .then(res => res.json())
      .then(data => { setPreviewMessages(data.success ? (data.data || []) : []); })
      .catch(() => setPreviewMessages([]))
      .finally(() => setLoadingPreview(false));
  }, [selectedTaskId, currentAgent, serverUrl, token, taskResults]);

  const sortedResults = [...taskResults].sort((a, b) => b.timestamp - a.timestamp);
  const selectedTask = selectedTaskId ? taskResults.find(t => t.id === selectedTaskId) : null;

  // Filter by selected agent
  const filteredActiveSessions = selectedAgentFilter
    ? activeSessions.filter(s => s.friendAgentId === selectedAgentFilter)
    : activeSessions;
  const filteredResults = selectedAgentFilter
    ? sortedResults.filter(r => r.friendAgentId === selectedAgentFilter)
    : sortedResults;

  const formatTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('messages.justNow');
    if (diffMins < 60) return t('messages.minutesAgo', { count: diffMins });
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return t('messages.hoursAgo', { count: diffHours });
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) return t('messages.daysAgo', { count: diffDays });
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatMsgTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const parseConclusion = (conclusion: string) => {
    const topicMatch = conclusion.match(/【(?:Topic|话题|トピック|주제)】([^;；【\n]*)/);
    const resultMatch = conclusion.match(/【(?:Result|结果|結果|결과)】([\s\S]*)/);
    if (topicMatch && resultMatch) return { topic: topicMatch[1].trim(), result: resultMatch[1].trim() };
    return { topic: null, result: conclusion.replace(/^【(?:Conclusion|结论|結論|결론)】[\s\n]*/, '').trim() };
  };

  const getFriendAgentName = (friendAgentId: string) => {
    const friend = friends.find(f => f.agents?.some(a => a.id === friendAgentId));
    return friend?.agents?.find(a => a.id === friendAgentId)?.name || friend?.user?.displayName || t('tasks.otherParty');
  };

  const getFriendName = (friendAgentId: string) => {
    const friend = friends.find(f => f.agents?.some(a => a.id === friendAgentId));
    return friend?.user?.displayName || t('tasks.otherParty');
  };

  const handleGoToSession = (result: typeof taskResults[0]) => {
    if (!result.sessionKey || !currentAgent) return;
    const friend = friends.find(f => f.agents?.some(a => a.id === result.friendAgentId));
    if (!friend) return;
    setCurrentChat(friend.user, friend.agents[0]);
    switchClawLinkSession(result.sessionKey);
    loadMessages(currentAgent.id, result.friendAgentId, result.sessionId);
    navigate('/messages');
  };

  if (!currentUser) {
    return <div className="h-full flex items-center justify-center text-muted-foreground/50">{t('tasks.pleaseLogin')}</div>;
  }

  return (
    <div className="h-full flex bg-background text-foreground">
      {/* Left: Agent list */}
      <div className="w-[220px] border-r border-foreground/[0.06] flex flex-col shrink-0">
        <div className="px-4 pt-4 pb-2">
          <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">Claw {t('tasks.network')}</div>
        </div>
        <div className="flex-1 overflow-auto">
          {/* All */}
          <button
            onClick={() => setSelectedAgentFilter(null)}
            className={cn("w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left",
              !selectedAgentFilter ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.02]"
            )}
          >
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-primary/10">
              <span className="text-base">🤖</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-foreground/80">{currentAgent?.name || t('tasks.myAgent')}</div>
              <div className="text-[11px] text-muted-foreground/50 truncate">{t('tasks.allTasks')}</div>
            </div>
          </button>

          {acceptedFriends.map(friend => {
            const agentId = friend.agents[0]?.id;
            const isActive = selectedAgentFilter === agentId;
            const taskCount = sortedResults.filter(r => r.friendAgentId === agentId).length
              + activeSessions.filter(s => s.friendAgentId === agentId).length;
            return (
              <button
                key={friend.friend.id}
                onClick={() => setSelectedAgentFilter(isActive ? null : agentId || null)}
                className={cn("w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left",
                  isActive ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.02]"
                )}
              >
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-muted/50">
                  <span className="text-base">🧠</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground/70">{friend.agents[0]?.name || friend.user.displayName}</div>
                  <div className="text-[11px] text-muted-foreground/40 truncate">{taskCount > 0 ? t('tasks.taskCount', { count: taskCount }) : t('tasks.noTasks')}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Task list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/[0.06]">
          <div className="text-[16px] font-semibold text-foreground">{t('tasks.title')}</div>
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40">
            {(['running', 'done', 'all'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("px-3 py-1.5 rounded-md text-[12px] transition-colors",
                  activeTab === tab ? "bg-foreground/[0.08] text-foreground/80" : "text-muted-foreground/60 hover:text-muted-foreground"
                )}>
                {t(`tasks.tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
          {/* Running */}
          {(activeTab === 'running' || activeTab === 'all') && filteredActiveSessions.map(session => {
            const friend = friends.find(f => f.agents[0]?.id === session.friendAgentId);
            if (!friend) return null;
            return (
              <div key={session.key}
                className="p-4 rounded-xl border border-foreground/[0.06] bg-muted/30 hover:bg-foreground/[0.03] transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-[13px] font-medium text-foreground/80 leading-relaxed">{session.name || t('tasks.newTask')}</div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ml-3 bg-primary/15 text-primary">{t('tasks.negotiating')}</span>
                </div>
                <div className="text-[11px] text-muted-foreground/60 mb-2">
                  {currentAgent?.name || currentUser.displayName} ↔ {friend.agents[0]?.name || friend.user.displayName}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/40">{formatTime(session.lastActivity)}</span>
                </div>
              </div>
            );
          })}

          {/* Completed */}
          {(activeTab === 'done' || activeTab === 'all') && filteredResults.map(result => {
            const { topic, result: conclusionText } = parseConclusion(result.conclusion);
            const isSelected = selectedTaskId === result.id;
            const friendAgentName = getFriendAgentName(result.friendAgentId);
            return (
              <div key={result.id} onClick={() => setSelectedTaskId(isSelected ? null : result.id)}
                className={cn("p-4 rounded-xl cursor-pointer transition-all border",
                  isSelected ? "border-primary/50 bg-muted/40" : "border-foreground/[0.06] bg-muted/30 hover:bg-foreground/[0.03]"
                )}>
                <div className="flex items-start justify-between mb-2">
                  <div className="text-[13px] font-medium text-foreground/80 leading-relaxed">{topic || result.originalMessage || t('tasks.unknownTopic')}</div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ml-3 bg-green-500/10 text-green-600 dark:text-green-400">{t('tasks.completed')}</span>
                </div>
                <div className="text-[11px] text-muted-foreground/60 mb-2">
                  {currentAgent?.name || currentUser.displayName} ↔ {friendAgentName}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/40">{formatTime(result.timestamp)}</span>
                </div>
                <div className="mt-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed bg-green-500/5 text-green-600 dark:text-green-400/80 border border-green-500/10">
                  {conclusionText}
                </div>
              </div>
            );
          })}

          {filteredResults.length === 0 && filteredActiveSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/40">
              <div className="text-3xl mb-3 opacity-20">📋</div>
              <p className="text-[12px] text-muted-foreground/60">{t('tasks.noTasks')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Task detail */}
      <div className="w-[380px] border-l border-foreground/[0.06] flex flex-col shrink-0">
        {selectedTask ? (() => {
          const { topic, result: conclusionText } = parseConclusion(selectedTask.conclusion);
          const friendAgentName = getFriendAgentName(selectedTask.friendAgentId);
          const friendName = getFriendName(selectedTask.friendAgentId);
          return (
            <>
              <div className="px-5 py-4">
                <div className="text-[14px] font-medium text-foreground mb-1">{topic || selectedTask.originalMessage || t('tasks.unknownTopic')}</div>
                <div className="text-[11px] text-muted-foreground/50">{t('tasks.completedAt', { time: formatTime(selectedTask.timestamp) })}</div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden px-5 pb-4 space-y-5">
                {/* Participants */}
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-2">{t('tasks.participants')}</div>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-muted/50 text-foreground/60">🦞 {currentAgent?.name || currentUser.displayName}</div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-muted/50 text-foreground/60">🧠 {friendAgentName}</div>
                  </div>
                </div>

                {/* Conclusion */}
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-2">{t('tasks.conclusion')}</div>
                  <div className="px-3 py-2.5 rounded-lg text-[12px] leading-relaxed bg-green-500/5 text-green-600 dark:text-green-400/80 border border-green-500/10">
                    {conclusionText}
                  </div>
                </div>

                {/* Chat preview */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-2 shrink-0">{t('tasks.chatHistory')}</div>
                  <div className="flex-1 rounded-lg border border-foreground/[0.06] bg-muted/30 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(128,128,128,0.15) transparent' }}>
                    {loadingPreview ? (
                      <div className="py-8 text-center text-[11px] text-muted-foreground/40">{t('tasks.loading')}</div>
                    ) : previewMessages.length === 0 ? (
                      <div className="py-8 text-center text-[11px] text-muted-foreground/40">{t('tasks.noHistory')}</div>
                    ) : (
                      <div className="p-3 space-y-2.5">
                        {previewMessages.map(msg => {
                          const isMe = msg.fromAgentId === currentAgent?.id;
                          return (
                            <div key={msg.id} className={cn("flex gap-2", isMe ? "flex-row-reverse" : "")}>
                              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] shrink-0 mt-0.5",
                                isMe ? "bg-primary/15 text-primary" : "bg-foreground/[0.06] text-muted-foreground/80"
                              )}>
                                {isMe ? t('tasks.me') : friendName[0]}
                              </div>
                              <div className={cn("max-w-[80%]")}>
                                <div className={cn("px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed",
                                  isMe ? "bg-primary/10 text-foreground/70" : "bg-foreground/[0.04] text-foreground/60"
                                )}>
                                  {msg.content}
                                </div>
                                <div className={cn("text-[9px] text-muted-foreground/30 mt-0.5", isMe ? "text-right" : "")}>
                                  {formatMsgTime(msg.timestamp)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* View original conversation */}
                <button onClick={() => handleGoToSession(selectedTask)}
                  className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors">
                  ↗ {t('tasks.viewOriginal')}
                </button>
              </div>
            </>
          );
        })() : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/40">
            <div className="text-3xl mb-3 opacity-20">📋</div>
            <p className="text-[12px] text-muted-foreground/60">{t('tasks.selectTaskDetail')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
