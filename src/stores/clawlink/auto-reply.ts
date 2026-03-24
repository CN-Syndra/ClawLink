/**
 * ClawLink Store - Auto-Reply Slice
 */
import { useGatewayStore } from '../gateway';
import { invokeIpc } from '@/lib/api-client';
import { toast } from 'sonner';
import { fetchWithAuth, loadPrompts } from './auth';
import type { ClawLinkState, Message } from './types';
import i18n from '@/i18n';
import dingSound from '@/assets/ding.wav';

// play notification sound
function playDing() {
  try { new Audio(dingSound).play(); } catch { /* ignore */ }
}

type SetState = (partial: Partial<ClawLinkState> | ((state: ClawLinkState) => Partial<ClawLinkState>)) => void;
type GetState = () => ClawLinkState;

// per-session dedup lock: prevents WS and fallback polling from triggering auto-reply simultaneously
// Map stores lock timestamps; auto-releases after 10 min (prevents deadlock on HMR/crash)
// force-replace old Set (migrated from Set to Map; ??= won't overwrite)
if (!(((window as any).__clawlink_session_ar_locks) instanceof Map)) {
  (window as any).__clawlink_session_ar_locks = new Map<string, number>();
}
const _sessionAutoReplyLocks: Map<string, number> = (window as any).__clawlink_session_ar_locks;

// tracks which sessions have already sent full context (immune to openclawSessionKey race)
const _contextSentSessions: Set<string> = (window as any).__clawlink_context_sent ??= new Set<string>();

// failed retry queue
interface RetryItem { content: string; fromAgentId: string; sessionId?: string; retryCount: number; nextRetryAt: number }
const _retryQueue: Map<string, RetryItem> = (window as any).__clawlink_retry_queue ??= new Map<string, RetryItem>();

// concurrent processing count; reset stale locks after HMR
let _autoReplyingCount = 0;
(() => {
  const now = Date.now();
  for (const [key, ts] of _sessionAutoReplyLocks) {
    if (now - ts > 10 * 60 * 1000) _sessionAutoReplyLocks.delete(key);
  }
  _autoReplyingCount = _sessionAutoReplyLocks.size;
})();

// get effective auto-reply settings (session override > global default)
function getSessionAutoReplySettings(get: GetState, sessionId?: string) {
  const { autoReplyEnabled, autoReplyMode, sessionAutoReplyOverrides } = get();
  if (sessionId && sessionAutoReplyOverrides[sessionId]) {
    return sessionAutoReplyOverrides[sessionId];
  }
  return { enabled: autoReplyEnabled, mode: autoReplyMode };
}

// ── peer agent error detection & i18n conclusions ──
type AgentErrorType = 'auth' | 'context_overflow' | 'message_ordering' | 'billing' | 'rate_limit' | 'overloaded' | 'generic';

// exact-match gateway error prefixes
const ERROR_PATTERNS: [string, AgentErrorType][] = [
  ['⚠️ Context overflow', 'context_overflow'],
  ['⚠️ Message ordering conflict', 'message_ordering'],
  ['⚠️ API provider returned a billing error', 'billing'],
  ['⚠️ API rate limit reached', 'rate_limit'],
  ['The AI service is temporarily overloaded', 'overloaded'],
  ['⚠️ Agent failed before reply', 'generic'], // fallback: generic agent failure, may contain auth info
];

function detectAgentError(content: string): AgentErrorType | null {
  if (!content) return null;
  for (const [prefix, type] of ERROR_PATTERNS) {
    if (content.startsWith(prefix)) {
      // further distinguish auth errors within generic
      if (type === 'generic' && (content.includes('OAuth') || content.includes('Re-authenticate') || content.includes('token expired') || content.includes('token refresh failed'))) {
        return 'auth';
      }
      return type;
    }
  }
  return null;
}

// i18n conclusion templates
interface ErrorMsg { conclusion: string; topic: string; result: string }
const ERROR_CONCLUSIONS: Record<AgentErrorType, Record<string, ErrorMsg>> = {
  auth: {
    zh: { conclusion: '结论', topic: '话题', result: '结果' },
    en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' },
    ko: { conclusion: '결론', topic: '주제', result: '결과' },
    ja: { conclusion: '結論', topic: 'トピック', result: '結果' },
  },
  context_overflow: { zh: { conclusion: '结论', topic: '话题', result: '结果' }, en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' }, ko: { conclusion: '결론', topic: '주제', result: '결과' }, ja: { conclusion: '結論', topic: 'トピック', result: '結果' } },
  message_ordering: { zh: { conclusion: '结论', topic: '话题', result: '结果' }, en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' }, ko: { conclusion: '결론', topic: '주제', result: '결과' }, ja: { conclusion: '結論', topic: 'トピック', result: '結果' } },
  billing: { zh: { conclusion: '结论', topic: '话题', result: '结果' }, en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' }, ko: { conclusion: '결론', topic: '주제', result: '결과' }, ja: { conclusion: '結論', topic: 'トピック', result: '結果' } },
  rate_limit: { zh: { conclusion: '结论', topic: '话题', result: '结果' }, en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' }, ko: { conclusion: '결론', topic: '주제', result: '결과' }, ja: { conclusion: '結論', topic: 'トピック', result: '結果' } },
  overloaded: { zh: { conclusion: '结论', topic: '话题', result: '结果' }, en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' }, ko: { conclusion: '결론', topic: '주제', result: '결과' }, ja: { conclusion: '結論', topic: 'トピック', result: '結果' } },
  generic: { zh: { conclusion: '结论', topic: '话题', result: '结果' }, en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result' }, ko: { conclusion: '결론', topic: '주제', result: '결과' }, ja: { conclusion: '結論', topic: 'トピック', result: '結果' } },
};

const ERROR_CONTENT: Record<AgentErrorType, Record<string, { t: string; r: string }>> = {
  auth: {
    zh: { t: '{n}的 AI 授权过期', r: '{n}的 AI 模型授权已过期或失效，需要{n}重新登录授权后才能继续对话。' },
    en: { t: "{n}'s AI authorization expired", r: "{n}'s AI model authorization has expired. {n} needs to re-authenticate to continue." },
    ko: { t: '{n}의 AI 인증 만료', r: '{n}의 AI 모델 인증이 만료되었습니다. {n}이(가) 재인증해야 합니다.' },
    ja: { t: '{n}のAI認証期限切れ', r: '{n}のAIモデル認証が期限切れです。{n}が再認証する必要があります。' },
  },
  context_overflow: {
    zh: { t: '{n}的 AI 上下文溢出', r: '对话内容过长，超出了{n}的 AI 模型处理能力。建议{n}开启新会话后重试。' },
    en: { t: "{n}'s AI context overflow", r: "Conversation too long for {n}'s AI model. {n} should start a new session." },
    ko: { t: '{n}의 AI 컨텍스트 초과', r: '대화가 {n}의 AI 모델 처리 용량을 초과했습니다. 새 세션을 시작해야 합니다.' },
    ja: { t: '{n}のAIコンテキスト超過', r: '会話が{n}のAIモデルの処理能力を超えました。新しいセッションで再試行してください。' },
  },
  message_ordering: {
    zh: { t: '{n}的 AI 消息顺序冲突', r: '{n}的 AI 出现消息顺序冲突，请{n}开启新会话后重试。' },
    en: { t: "{n}'s AI message conflict", r: "{n}'s AI encountered a message ordering conflict. Please start a new session." },
    ko: { t: '{n}의 AI 메시지 순서 충돌', r: '{n}의 AI에서 메시지 순서 충돌이 발생했습니다. 새 세션을 시작해야 합니다.' },
    ja: { t: '{n}のAIメッセージ順序競合', r: '{n}のAIでメッセージ順序の競合が発生しました。新しいセッションで再試行してください。' },
  },
  billing: {
    zh: { t: '{n}的 AI 配额不足', r: '{n}的 AI 模型配额已用尽或账单异常，需要{n}检查配额和付费设置。' },
    en: { t: "{n}'s AI quota exhausted", r: "{n}'s AI model has run out of credits. {n} needs to check billing settings." },
    ko: { t: '{n}의 AI 할당량 소진', r: '{n}의 AI 모델 할당량이 소진되었습니다. 결제 설정을 확인해야 합니다.' },
    ja: { t: '{n}のAIクォータ不足', r: '{n}のAIモデルのクレジットが不足しています。課金設定を確認してください。' },
  },
  rate_limit: {
    zh: { t: '{n}的 AI 触发速率限制', r: '{n}的 AI 模型请求过于频繁，已被限流。请稍后重试。' },
    en: { t: "{n}'s AI rate limited", r: "{n}'s AI model hit a rate limit. Please try again later." },
    ko: { t: '{n}의 AI 속도 제한', r: '{n}의 AI 모델이 속도 제한에 도달했습니다. 나중에 다시 시도해 주세요.' },
    ja: { t: '{n}のAIレート制限', r: '{n}のAIモデルがレート制限に達しました。しばらくしてから再試行してください。' },
  },
  overloaded: {
    zh: { t: '{n}的 AI 服务繁忙', r: '{n}的 AI 服务暂时过载，请稍后重试。' },
    en: { t: "{n}'s AI service overloaded", r: "{n}'s AI service is temporarily overloaded. Please try again shortly." },
    ko: { t: '{n}의 AI 서비스 과부하', r: '{n}의 AI 서비스가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해 주세요.' },
    ja: { t: '{n}のAIサービス過負荷', r: '{n}のAIサービスが一時的に過負荷です。しばらくしてから再試行してください。' },
  },
  generic: {
    zh: { t: '{n}的 AI 出现错误', r: '{n}的 AI 处理出错，请{n}检查模型配置或重启应用后重试。' },
    en: { t: "{n}'s AI error", r: "{n}'s AI failed to process. {n} should check model settings or restart the app." },
    ko: { t: '{n}의 AI 오류', r: '{n}의 AI 처리에 실패했습니다. 모델 설정을 확인하거나 앱을 재시작해야 합니다.' },
    ja: { t: '{n}のAIエラー', r: '{n}のAI処理が失敗しました。モデル設定を確認するかアプリを再起動してください。' },
  },
};

// locale-aware protocol markers
const MARKERS: Record<string, { conclusion: string; topic: string; result: string; askOwner: string; requestAuth: string }> = {
  zh: { conclusion: '结论', topic: '话题', result: '结果', askOwner: '请求主人', requestAuth: '请求授权' },
  en: { conclusion: 'Conclusion', topic: 'Topic', result: 'Result', askOwner: 'Ask Owner', requestAuth: 'Request Auth' },
  ko: { conclusion: '결론', topic: '주제', result: '결과', askOwner: '소유자 요청', requestAuth: '권한 요청' },
  ja: { conclusion: '結論', topic: 'トピック', result: '結果', askOwner: 'オーナーに確認', requestAuth: '認可リクエスト' },
};

function getMarkers() {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').substring(0, 2);
  return MARKERS[lang] || MARKERS['en'];
}

// regex that matches conclusion/owner/auth markers in ANY language
const ALL_CONCLUSIONS = Object.values(MARKERS).map(m => m.conclusion).join('|');
const ALL_TOPICS = Object.values(MARKERS).map(m => m.topic).join('|');
const ALL_RESULTS = Object.values(MARKERS).map(m => m.result).join('|');
const ALL_ASK_OWNER = Object.values(MARKERS).map(m => m.askOwner).join('|');
const ALL_REQUEST_AUTH = Object.values(MARKERS).map(m => m.requestAuth).join('|');

const RE_CONCLUSION = new RegExp(`【(?:${ALL_CONCLUSIONS})】`);
const RE_TOPIC = new RegExp(`【(?:${ALL_TOPICS})】([^;；【]*)`);
const RE_RESULT = new RegExp(`【(?:${ALL_RESULTS})】([\\s\\S]*)`);
const RE_CONCLUSION_PREFIX = new RegExp(`^【(?:${ALL_CONCLUSIONS})】\\s*`);
const RE_ASK_OWNER = new RegExp(`【(?:${ALL_ASK_OWNER})】([\\s\\S]*)`);
const RE_REQUEST_AUTH = new RegExp(`【(?:${ALL_REQUEST_AUTH})】([\\s\\S]*)`);

function buildErrorConclusion(errorType: AgentErrorType, friendName: string): string {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'zh').substring(0, 2);
  const labels = ERROR_CONCLUSIONS[errorType][lang] || ERROR_CONCLUSIONS[errorType]['zh'];
  const content = ERROR_CONTENT[errorType][lang] || ERROR_CONTENT[errorType]['zh'];
  const t = content.t.replace(/\{n\}/g, friendName);
  const r = content.r.replace(/\{n\}/g, friendName);
  return `【${labels.conclusion}】\n【${labels.topic}】${t}\n【${labels.result}】${r}`;
}

// update autoReplyStep for a specific session (doesn't affect others)
function setSessionStep(set: SetState, _get: GetState, sessionKey: string, step: 'idle' | 'received' | 'forwarding' | 'thinking' | 'replying' | 'reviewing') {
  set((state) => ({ autoReplySteps: { ...state.autoReplySteps, [sessionKey]: step } }));
}

function clearSessionStep(set: SetState, _get: GetState, sessionKey: string) {
  set((state) => {
    const { [sessionKey]: _, ...rest } = state.autoReplySteps;
    return { autoReplySteps: rest };
  });
}

export function createAutoReplySlice(set: SetState, get: GetState) {
  return {
    // auto-reply to incoming message
    // originalSentContent: optional original sent content for context when creating new sessions
    handleAutoReply: async (_content: string, fromAgentId: string, _originalSentContent?: string, incomingSessionId?: string) => {
      const { currentAgent, serverUrl, clawLinkSessions, friends,
              updateClawLinkSessionOpenCLAWSessionKey, updateClawLinkSessionCompleted } = get();

      // precondition checks
      if (!currentAgent || !serverUrl) return;

      // check if auto-reply is enabled for this session
      const { enabled: isEnabled } = getSessionAutoReplySettings(get, incomingSessionId);
      if (!isEnabled) return;

      // per-session dedup: only one auto-reply at a time per session (parallel across sessions)
      const lockKey = incomingSessionId || fromAgentId;
      const lockTs = _sessionAutoReplyLocks.get(lockKey);
      if (lockTs && Date.now() - lockTs < 10 * 60 * 1000) return;
      _sessionAutoReplyLocks.set(lockKey, Date.now());

      // increment counter, mark as replying
      _autoReplyingCount++;
      set({ autoReplying: true });
      setSessionStep(set, get, lockKey, 'received');
      const safetyTimer = setTimeout(() => {
        _autoReplyingCount = Math.max(0, _autoReplyingCount - 1);
        _sessionAutoReplyLocks.delete(lockKey);
        clearSessionStep(set, get, lockKey);
        if (_autoReplyingCount === 0) set({ autoReplying: false, autoReplyStep: 'idle' });
      }, 10 * 60 * 1000);

      // find the ClawLink session for this message
      // prefer exact sessionId match, fallback to friendAgentId (skip completed)
      const findSession = (sessions: typeof clawLinkSessions) => {
        if (incomingSessionId) {
          // exact match only when sessionId is specified, avoid hitting stale sessions
          return sessions.find(s => s.id === incomingSessionId) || null;
        }
        // no sessionId: fallback to most recent non-completed session
        return sessions
          .filter(s => s.friendAgentId === fromAgentId && !s.completed)
          .sort((a, b) => (b.lastActivity || b.createdAt) - (a.lastActivity || a.createdAt))[0] || null;
      };

      let clawLinkSession = findSession(clawLinkSessions);

      // if not found locally, refresh session list and retry
      if (!clawLinkSession) {
        await get().loadClawLinkSessions();
        clawLinkSession = findSession(get().clawLinkSessions);
      }

      // matched session is completed, skip reply
      if (clawLinkSession?.completed) {
        _sessionAutoReplyLocks.delete(lockKey);
        clearTimeout(safetyTimer);
        clearSessionStep(set, get, lockKey);
        _autoReplyingCount = Math.max(0, _autoReplyingCount - 1);
        if (_autoReplyingCount === 0) set({ autoReplying: false, autoReplyStep: 'idle' });
        return;
      }

      let _replySent = false; // tracks whether reply was sent successfully

      try {
        setSessionStep(set, get, lockKey, 'forwarding');
        // ── Step 1: fetch full message history from server ──
        const sessionId = incomingSessionId || clawLinkSession?.id || '';
        const historyUrl = sessionId
          ? `${serverUrl}/api/messages/${currentAgent.id}/${fromAgentId}?sessionId=${sessionId}`
          : `${serverUrl}/api/messages/${currentAgent.id}/${fromAgentId}`;
        const historyRes = await fetchWithAuth(get().token, historyUrl);
        const historyData = await historyRes.json();
        const allMessages: Message[] = historyData.success ? (historyData.data || []) : [];

        // ── Step 2: check if reply is needed ──
        // if last message is ours, we already replied
        if (allMessages.length > 0 && allMessages[allMessages.length - 1].fromAgentId === currentAgent.id) {
          _replySent = true;
          return;
        }

        // ── detect peer agent error replies (model config issues, etc.) ──
        const lastFriendMsgRaw = [...allMessages].reverse().find(m => m.fromAgentId !== currentAgent.id);
        const errText = typeof lastFriendMsgRaw?.content === 'string' ? lastFriendMsgRaw.content : '';
        const agentErrorType = detectAgentError(errText);
        if (agentErrorType) {
          const friendInfo = friends.find(f => f.agents?.some(a => a.id === fromAgentId));
          const friendName = friendInfo?.user?.displayName || friendInfo?.user?.username || 'Contact';
          const conclusion = buildErrorConclusion(agentErrorType, friendName);
          const sendOk = await get()._sendAutoReply(conclusion, fromAgentId, incomingSessionId || clawLinkSession?.id || '', clawLinkSession, friendInfo, friendName, allMessages);
          if (sendOk) _replySent = true;
          return;
        }

        // ── Step 3: build role-annotated context ──
        const { currentUser } = get();
        const myName = currentUser?.displayName || 'Me';
        const friendInfo = friends.find(f => f.agents?.some(a => a.id === fromAgentId));
        const friendName = friendInfo?.user?.displayName || friendInfo?.user?.username || 'Contact';

        // format message history as role-annotated conversation
        const contextLines = allMessages.map(msg => {
          const sender = msg.fromAgentId === currentAgent.id ? `[${myName}]` : `[${friendName}]`;
          return `${sender}: ${msg.content}`;
        });
        const conversationContext = contextLines.join('\n');

        // ── Step 3b: get or create OpenCLAW session (fully background, no UI) ──
        const gatewayRpc = useGatewayStore.getState().rpc;
        let openclawKey = clawLinkSession?.openclawSessionKey || null;
        let isFirstTurn = false;

        if (!openclawKey) {
          // method 1: create via RPC sessions.create
          try {
            const created = await gatewayRpc<Record<string, unknown>>('sessions.create', {}, 10000);
            openclawKey = created?.sessionKey ? String(created.sessionKey) : null;
            console.log(`[ClawLink AutoReply] sessions.create result:`, created ? JSON.stringify(created) : 'null', '→ key:', openclawKey);
          } catch (e) {
            console.log(`[ClawLink AutoReply] sessions.create failed:`, e);
          }

          // method 2: generate session key directly (gateway auto-creates on chat.send)
          if (!openclawKey) {
            try {
              const listData = await gatewayRpc<Record<string, unknown>>('sessions.list', {}, 5000);
              const sessions = Array.isArray(listData?.sessions) ? listData.sessions as any[] : [];
              console.log(`[ClawLink AutoReply] sessions.list returned ${sessions.length} sessions:`, sessions.map((s: any) => s.key));
              const existingKey = sessions.find((s: any) => s.key?.startsWith('agent:'))?.key;
              const prefix = existingKey ? existingKey.split(':').slice(0, 2).join(':') : 'agent:main';
              openclawKey = `${prefix}:session-${Date.now()}`;
            } catch (e) {
              console.log(`[ClawLink AutoReply] sessions.list failed:`, e);
              openclawKey = `agent:main:session-${Date.now()}`;
            }
            console.log(`[ClawLink AutoReply] Generated local key: ${openclawKey}`);
          }

          if (!openclawKey) {
            return;
          }

          isFirstTurn = true;
          // save openclawKey to session (retry lookup if not found earlier)
          if (!clawLinkSession) {
            clawLinkSession = findSession(get().clawLinkSessions);
          }
          if (clawLinkSession) {
            await updateClawLinkSessionOpenCLAWSessionKey(clawLinkSession.key, openclawKey);
          }
        }

        // ── Step 4: build message for AI ──
        let fullMessage: string;
        const sessionSettings = getSessionAutoReplySettings(get, sessionId);
        const isServiceMode = sessionSettings.mode === 'service';
        const lastFriendMsg = [...allMessages].reverse().find(m => m.fromAgentId !== currentAgent.id);

        // use independent flag for first-turn check (avoids openclawSessionKey race)
        const needsFullContext = !_contextSentSessions.has(lockKey);

        if (isServiceMode) {
          if (needsFullContext) {
            fullMessage = `Here is the conversation history:\n${conversationContext}`;
          } else {
            fullMessage = lastFriendMsg ? `[${friendName}]: ${lastFriendMsg.content}` : '';
          }
        } else {
          const prompts = await loadPrompts();

          // check if peer sent a conclusion
          const friendSentConclusion = lastFriendMsg?.content ? RE_CONCLUSION.test(lastFriendMsg.content) : false;

          if (needsFullContext) {
            // first turn: full system prompt + complete conversation history
            let systemPrompt = prompts?.['system-prompt'] || '';
            systemPrompt = systemPrompt.replace(/\{displayName\}/g, myName);
            systemPrompt = systemPrompt.replace(/\{friendName\}/g, friendName);
            systemPrompt = systemPrompt.replace(/\{myAgentId\}/g, currentAgent.id);
            systemPrompt = systemPrompt.replace(/\{friendAgentId\}/g, fromAgentId);
            systemPrompt = systemPrompt.replace(/\{sessionId\}/g, sessionId);
            systemPrompt = systemPrompt.replace(/\{serverUrl\}/g, serverUrl);

            // inject custom auth rules (replace {authRules} placeholder)
            const customAuth = get().customAuthRules?.trim();
            if (customAuth) {
              const authLines = customAuth.split('\n').map(line => line.trim()).filter(Boolean).map(line => line.startsWith('- ') ? line : `- ${line}`);
              const authBlock = '【MANDATORY — Authorization Required】\n' +
                'BEFORE performing ANY of the following actions, you MUST FIRST output 【Request Auth】 and WAIT for owner approval. If you skip this step, it is a CRITICAL VIOLATION.\n' +
                authLines.join('\n');
              systemPrompt = systemPrompt.replace('{authRules}', authBlock);
            } else {
              systemPrompt = systemPrompt.replace('{authRules}', '');
            }

            // inject custom forbidden rules (replace {forbiddenRules} placeholder)
            const customRules = get().customForbiddenRules?.trim();
            if (customRules) {
              const rulesLines = customRules.split('\n').map(line => line.trim()).filter(Boolean).map(line => line.startsWith('- ') ? line : `- ${line}`);
              const forbiddenBlock = '【ABSOLUTE PROHIBITIONS — VIOLATION IS NOT ALLOWED】\n' +
                'The following actions are STRICTLY FORBIDDEN. You must NEVER do any of these under any circumstances:\n' +
                rulesLines.join('\n');
              systemPrompt = systemPrompt.replace('{forbiddenRules}', forbiddenBlock);
            } else {
              systemPrompt = systemPrompt.replace('{forbiddenRules}', '');
            }

            fullMessage = systemPrompt
              ? `===== [SYSTEM_PROMPT_START] =====\n${systemPrompt}\n===== [SYSTEM_PROMPT_END] =====\n\nHere is the conversation history:\n${conversationContext}\n\nBased on the above conversation, reply as ${myName}'s assistant to ${friendName}. Output only the reply content.`
              : conversationContext;
          } else if (friendSentConclusion) {
            // peer sent conclusion: forward conclusion + conclusion instruction only
            let followupReady = prompts?.['followup-ready'] || `${friendName} has given a formal 【Conclusion】. As ${myName}'s assistant, you must now provide your own complete 【Conclusion】.`;
            followupReady = followupReady.replace(/\{displayName\}/g, myName);
            followupReady = followupReady.replace(/\{friendName\}/g, friendName);
            fullMessage = `[${friendName}]: ${lastFriendMsg!.content}\n\n===== [SYSTEM_PROMPT_START] =====\n${followupReady}\n===== [SYSTEM_PROMPT_END] =====`;
          } else {
            // subsequent turns: forward latest message + identity reminder (OpenCLAW session has full context)
            let followupNormal = prompts?.['followup-normal'] || `Continue replying as ${myName}'s assistant to ${friendName}.`;
            followupNormal = followupNormal.replace(/\{displayName\}/g, myName);
            followupNormal = followupNormal.replace(/\{friendName\}/g, friendName);
            const latestMsg = lastFriendMsg ? `[${friendName}]: ${lastFriendMsg.content}` : '';
            fullMessage = `${latestMsg}\n\n===== [SYSTEM_PROMPT_START] =====\n${followupNormal}\n===== [SYSTEM_PROMPT_END] =====`;
          }
        }

        setSessionStep(set, get, lockKey, 'thinking');
        // ── Step 5: send via RPC directly, no UI ──
        // check for attachment references in message
        const mediaFiles: Array<{ filePath: string; mimeType: string; fileName: string }> = [];

        // format 1: [media attached: path (mime) | name] (local path)
        const localMediaRegex = /\[media attached:\s*([^\s(]+)\s*\(([^)]+)\)\s*\|\s*([^\]]+)\]/g;
        let match;
        while ((match = localMediaRegex.exec(fullMessage)) !== null) {
          mediaFiles.push({ filePath: match[1], mimeType: match[2], fileName: match[3].trim() });
        }

        // format 2: [file: url | name | mime | size] (server URL, needs local staging)
        const urlFileRegex = /\[file:\s*([^\s|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^\]]+)\]/g;
        while ((match = urlFileRegex.exec(fullMessage)) !== null) {
          const fileUrl = match[1].trim();
          const fileName = match[2].trim();
          const mimeType = match[3].trim();
          try {
            // download to local temp dir for AI consumption
            const stageResult = await invokeIpc('clawlink:stageFromUrl', { url: fileUrl, fileName, mimeType }) as any;
            if (stageResult?.success && stageResult.stagedPath) {
              mediaFiles.push({ filePath: stageResult.stagedPath, mimeType, fileName });
            }
          } catch {
            // download failed, keep URL as text reference
          }
        }

        try {
          if (mediaFiles.length > 0) {
            // has attachments: send via IPC sendWithMedia (supports vision)
            await invokeIpc(
              'chat:sendWithMedia',
              {
                sessionKey: openclawKey,
                message: fullMessage,
                deliver: false,
                idempotencyKey: crypto.randomUUID(),
                media: mediaFiles,
              },
            );
          } else {
            // text only: send via RPC
            console.log(`[ClawLink AutoReply] chat.send sessionKey="${openclawKey}"`);
            const sendResult = await gatewayRpc<Record<string, unknown>>(
              'chat.send',
              { sessionKey: openclawKey, message: fullMessage, deliver: false, idempotencyKey: crypto.randomUUID() },
              120_000,
            );
            console.log(`[ClawLink AutoReply] chat.send response keys:`, sendResult ? Object.keys(sendResult) : 'null', 'sessionKey:', sendResult?.sessionKey, 'runId:', sendResult?.runId);
            // Gateway may return the actual session key used (which can differ from our generated key)
            const actualSessionKey = sendResult?.sessionKey ? String(sendResult.sessionKey) : null;
            if (actualSessionKey && actualSessionKey !== openclawKey) {
              console.log(`[ClawLink AutoReply] Gateway returned session "${actualSessionKey}" instead of "${openclawKey}", updating.`);
              openclawKey = actualSessionKey;
              if (clawLinkSession) {
                await updateClawLinkSessionOpenCLAWSessionKey(clawLinkSession.key, openclawKey);
              }
            }
          }
          // mark session as having sent full context
          if (needsFullContext) {
            _contextSentSessions.add(lockKey);
          }
        } catch (e) {
          console.error('[ClawLink AutoReply] chat.send failed:', e);
          // clear openclawSessionKey so next retry creates a new one
          if (clawLinkSession) {
            const sessions = get().clawLinkSessions;
            const updated = sessions.map(s => s.key === clawLinkSession.key ? { ...s, openclawSessionKey: null } : s);
            set({ clawLinkSessions: updated });
          }
          _contextSentSessions.delete(lockKey);
          return;
        }

        // chat.send only starts the run; poll for AI reply

        // ── Step 6: poll chat.history for assistant reply ──
        let replyContent = '';
        let msgCountBefore = 0;
        try {
          const h = await gatewayRpc<Record<string, unknown>>('chat.history', { sessionKey: openclawKey, limit: 200 }, 5_000);
          msgCountBefore = h && Array.isArray(h.messages) ? h.messages.length : 0;
        } catch { /* ignore */ }

        // wait for AI reply: prefer gateway event push, poll as fallback
        // complex tasks may take long; max wait 10 min
        // use openclawKey as per-session pending reply key
        const replyKey = openclawKey || lockKey;
        set((state) => ({ _pendingAIReplies: { ...state._pendingAIReplies, [replyKey]: '' } }));
        for (let attempt = 0; attempt < 200; attempt++) {
          await new Promise(r => setTimeout(r, 3000));
          // use per-session lock, not global autoReplying (other sessions don't affect this one)
          if (!_sessionAutoReplyLocks.has(lockKey)) break;

          // check gateway event-pushed reply first (per-session)
          const pushed = get()._pendingAIReplies[replyKey];
          if (pushed) {
            replyContent = pushed;
            set((state) => {
              const { [replyKey]: _, ...rest } = state._pendingAIReplies;
              return { _pendingAIReplies: rest };
            });
            break;
          }
          // fallback: check history every 3 polls (~9s) to reduce requests
          if (attempt % 3 !== 0) continue;
          try {
            const histData = await gatewayRpc<Record<string, unknown>>(
              'chat.history',
              { sessionKey: openclawKey, limit: 200 },
              5_000,
            );
            const histMsgs = histData && Array.isArray(histData.messages) ? histData.messages as any[] : [];

            if (histMsgs.length > msgCountBefore) {
              const lastMsg = histMsgs[histMsgs.length - 1];
              if (lastMsg.role === 'assistant') {
                const c = lastMsg.content;
                if (typeof c === 'string') replyContent = c;
                else if (Array.isArray(c)) replyContent = c.map((x: any) => x.text || x.content || '').filter(Boolean).join('\n');
                else if (c && typeof c === 'object') replyContent = (c as any).text || (c as any).content || '';
                if (replyContent) break;
              }
            }
          } catch { /* ignore */ }
        }

        if (!replyContent.trim()) {
          return;
        }

        // ── detect owner request or auth request: needs owner intervention ──
        const ownerRequestPattern = RE_ASK_OWNER;
        const authRequestPattern = RE_REQUEST_AUTH;

        const handleOwnerInteraction = async (content: string): Promise<string> => {
          const ownerMatch = content.match(ownerRequestPattern);
          const authMatch = content.match(authRequestPattern);

          if (!ownerMatch && !authMatch) return content;

          const isAuth = !!authMatch;
          const question = (isAuth ? authMatch![1] : ownerMatch![1]).trim();
          const reqSessionId = incomingSessionId || clawLinkSession?.id || '';

          setSessionStep(set, get, lockKey, 'received');

          // wait until no other owner request is pending (queue)
          while (get().pendingOwnerRequest) {
            await new Promise(r => setTimeout(r, 500));
          }

          playDing();
          set({ pendingOwnerRequest: { question, friendName, fromAgentId, sessionId: reqSessionId, openclawKey: openclawKey!, lockKey, type: isAuth ? 'auth' : 'input' } as any });

          // wait for user action on THIS request
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              if (!get().pendingOwnerRequest || get().pendingOwnerRequest?.lockKey !== lockKey) { clearInterval(check); resolve(); }
            }, 300);
          });

          // user replied, poll for AI's final reply
          let newReply = '';
          let countBefore = 0;
          try {
            const h = await gatewayRpc<Record<string, unknown>>('chat.history', { sessionKey: openclawKey, limit: 200 }, 5_000);
            countBefore = h && Array.isArray(h.messages) ? h.messages.length : 0;
          } catch { /* ignore */ }

          for (let a = 0; a < 200; a++) {
            await new Promise(r => setTimeout(r, 3000));
            if (!_sessionAutoReplyLocks.has(lockKey)) break;
            try {
              const hd = await gatewayRpc<Record<string, unknown>>('chat.history', { sessionKey: openclawKey, limit: 200 }, 5_000);
              const msgs = hd && Array.isArray(hd.messages) ? hd.messages as any[] : [];
              if (msgs.length > countBefore) {
                const last = msgs[msgs.length - 1];
                if (last.role === 'assistant') {
                  const c = last.content;
                  if (typeof c === 'string') newReply = c;
                  else if (Array.isArray(c)) newReply = c.map((x: any) => x.text || x.content || '').filter(Boolean).join('\n');
                  else if (c && typeof c === 'object') newReply = (c as any).text || (c as any).content || '';
                  if (newReply && !newReply.match(ownerRequestPattern) && !newReply.match(authRequestPattern)) break;
                  // AI sent another request, handle recursively
                  if (newReply.match(ownerRequestPattern) || newReply.match(authRequestPattern)) {
                    newReply = await handleOwnerInteraction(newReply);
                    break;
                  }
                }
              }
            } catch { /* ignore */ }
          }
          return newReply;
        };

        if (replyContent.match(ownerRequestPattern) || replyContent.match(authRequestPattern)) {
          replyContent = await handleOwnerInteraction(replyContent);
          if (!replyContent.trim()) return;
        }

        // ── Step 7: clean reply (strip leaked system prompt remnants) ──
        let cleanReply = replyContent.trim();

        if (isServiceMode) {
          // service mode: use raw AI reply, only filter clearly invalid ones
          if (!cleanReply || cleanReply.includes('NO_REPLY')) {
            return;
          }
        } else {
          // strip leaked prompt tag lines
          const promptTags = ['Background', 'Role', 'Core Principles', 'Communication Flow', 'Important', 'Prohibited', '背景', '角色', '核心原则', '沟通流程', '重要', '禁止'];
          for (const tag of promptTags) {
            cleanReply = cleanReply.replace(new RegExp(`【${tag}】[\\s\\S]*?(?=【|$)`, 'g'), '');
          }
          cleanReply = cleanReply.trim();
          if (!cleanReply) cleanReply = replyContent.replace(/【[^】]*】/g, '').trim();

          // ── invalid reply detection: multi-layer fallback ──
          const isInvalidReply = !cleanReply
            || cleanReply.includes('NO_REPLY')
            || cleanReply.length < 2;

          if (isInvalidReply) {
            // layer 2: ask AI to summarize and conclude via RPC
            try {
              await gatewayRpc<Record<string, unknown>>(
                'chat.send',
                { sessionKey: openclawKey, message: 'The conversation seems to have ended. Please summarize the conversation and provide a formal conclusion. The format must be: 【Conclusion】【Topic】brief topic description;【Result】specific conclusion. Output only the conclusion, nothing else.', deliver: false, idempotencyKey: crypto.randomUUID() },
                120_000,
              );

              // get reply
              const retryHist = await gatewayRpc<Record<string, unknown>>('chat.history', { sessionKey: openclawKey, limit: 200 }, 10_000);
              const retryMsgs = retryHist && Array.isArray(retryHist.messages) ? retryHist.messages as any[] : [];
              let conclusionReply = '';
              for (let i = retryMsgs.length - 1; i >= 0; i--) {
                if (retryMsgs[i].role === 'assistant') {
                  const c = retryMsgs[i].content;
                  if (typeof c === 'string') conclusionReply = c;
                  else if (Array.isArray(c)) conclusionReply = c.map((x: any) => x.text || x.content || '').filter(Boolean).join('\n');
                  else if (c && typeof c === 'object') conclusionReply = (c as any).text || (c as any).content || '';
                  if (conclusionReply) break;
                }
              }
              conclusionReply = conclusionReply.trim();

              if (conclusionReply && RE_CONCLUSION.test(conclusionReply) && !conclusionReply.includes('NO_REPLY')) {
                cleanReply = conclusionReply;
              } else {
                // layer 3: hard fallback with default conclusion
                const firstMsg = allMessages[0];
                const topicText = firstMsg ? firstMsg.content.substring(0, 50) : 'Conversation';
                const fb = getMarkers();
                cleanReply = `【${fb.conclusion}】\n【${fb.topic}】${topicText}\n【${fb.result}】${i18n.t('clawlink:messages.autoReply.naturalEnd')}`;
              }
            } catch {
              // retry failed, hard fallback
              const firstMsg = allMessages[0];
              const topicText = firstMsg ? firstMsg.content.substring(0, 50) : 'Conversation';
              const fb = getMarkers();
              cleanReply = `【${fb.conclusion}】\n【${fb.topic}】${topicText}\n【${fb.result}】${i18n.t('clawlink:messages.autoReply.naturalEnd')}`;
            }
          }
        }

        // ── Step 8: review mode or direct send ──
        if (sessionSettings.mode === 'review') {
          // review mode: pause, wait for user approval
          setSessionStep(set, get, lockKey, 'reviewing');
          set({ pendingReviewReply: { content: cleanReply, fromAgentId, sessionId } });
          // wait for user action (approve/reject sets pendingReviewReply = null)
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              if (!get().pendingReviewReply) {
                clearInterval(check);
                resolve();
              }
            }, 300);
          });
          // user handled (approve or reject)
          _replySent = true;
        } else {
          // full-auto mode: send directly
          setSessionStep(set, get, lockKey, 'replying');
          const sendOk = await get()._sendAutoReply(cleanReply, fromAgentId, sessionId, clawLinkSession, friendInfo, friendName, allMessages);
          if (sendOk) _replySent = true;
        }

      } catch (err) {
        console.error('[ClawLink AutoReply] failed:', lockKey, err);
      } finally {
        _sessionAutoReplyLocks.delete(lockKey);
        clearTimeout(safetyTimer);
        clearSessionStep(set, get, lockKey);
        _autoReplyingCount = Math.max(0, _autoReplyingCount - 1);
        if (_autoReplyingCount === 0) {
          set({ autoReplying: false, autoReplyStep: 'idle' });
        }

        // if reply wasn't sent (error or silent exit), add to retry queue
        if (!_replySent && !clawLinkSession?.completed) {
          const existing = _retryQueue.get(lockKey);
          const retryCount = existing ? existing.retryCount + 1 : 1;
          if (retryCount <= 8) {
            const delay = Math.min(5000 * Math.pow(2, retryCount - 1), 120_000); // 5s,10s,20s,40s,80s,120s,120s,120s
            _retryQueue.set(lockKey, {
              content: _content, fromAgentId, sessionId: incomingSessionId,
              retryCount, nextRetryAt: Date.now() + delay,
            });
          }
        }
      }
    },

    // internal: send auto-reply and handle conclusions
    _sendAutoReply: async (content: string, toAgentId: string, sessionId: string, clawLinkSession: any, friendInfo: any, friendName: string, allMessages: any[]): Promise<boolean> => {
      const { currentAgent, serverUrl, updateClawLinkSessionCompleted } = get();
      if (!currentAgent || !serverUrl) return false;

      const sessionSettings = getSessionAutoReplySettings(get, sessionId);
      const hasConclusion = sessionSettings.mode !== 'service' && RE_CONCLUSION.test(content);
      const sendRes = await fetchWithAuth(get().token, `${serverUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAgentId: currentAgent.id,
          toAgentId,
          content,
          sessionId,
        })
      });
      const sendData = await sendRes.json();

      if (sendData.success) {
        // reply succeeded, remove from retry queue
        _retryQueue.delete(sessionId || toAgentId);
        // if currently viewing this session, add to local messages for live display
        const currentChatAgentId = get().currentChatAgent?.id;
        const currentSessionKey = get().currentClawLinkSessionKey;
        const currentSession = currentSessionKey
          ? get().clawLinkSessions.find(s => s.key === currentSessionKey)
          : null;
        if (currentChatAgentId === toAgentId && currentSession && currentSession.id === sessionId) {
          get().addMessage(sendData.data);
        }

        if (hasConclusion && clawLinkSession) {
          await updateClawLinkSessionCompleted(clawLinkSession.key, true);

          const topicMatch = content.match(RE_TOPIC);
          const resultMatch = content.match(RE_RESULT);
          const firstMsg = allMessages[0];
          const topic = topicMatch
            ? topicMatch[1].trim()
            : (firstMsg ? firstMsg.content.substring(0, 100) : 'Unknown topic');
          const conclusionText = resultMatch
            ? resultMatch[1].trim()
            : content.replace(RE_CONCLUSION_PREFIX, '').trim();

          const m = getMarkers();
          const normalizedConclusion = `【${m.conclusion}】\n【${m.topic}】${topic}\n【${m.result}】${conclusionText}`;

          get().addTaskResult({
            friendId: friendInfo?.friend?.id || toAgentId,
            friendName,
            friendAgentId: toAgentId,
            sessionId,
            sessionKey: clawLinkSession.key,
            originalMessage: topic,
            conclusion: normalizedConclusion,
          });

          playDing();
          toast.success(i18n.t('clawlink:messages.autoReply.concluded', { name: friendName }), {
            description: conclusionText.substring(0, 100),
            duration: 8000,
          });
        }
        return true;
      }
      return false;
    },

    // review mode: user approves sending (optionally edited)
    approveReviewReply: async (editedContent?: string) => {
      const pending = get().pendingReviewReply;
      if (!pending) return;

      const content = editedContent ?? pending.content;
      const wasEdited = editedContent !== undefined && editedContent !== pending.content;

      // clear pending review state
      const reviewLockKey = pending.sessionId || pending.fromAgentId;
      set({ pendingReviewReply: null });
      setSessionStep(set, get, reviewLockKey, 'replying');

      // if user edited content, clear openclawSessionKey to force full context next time
      if (wasEdited) {
        const sessions = get().clawLinkSessions;
        const session = pending.sessionId
          ? sessions.find(s => s.id === pending.sessionId)
          : sessions.find(s => s.friendAgentId === pending.fromAgentId && !s.completed);
        if (session) {
          const updated = sessions.map(s =>
            s.key === session.key ? { ...s, openclawSessionKey: null } : s
          );
          set({ clawLinkSessions: updated });
        }
      }

      // find session and friend info for _sendAutoReply
      const { clawLinkSessions, friends, currentAgent, serverUrl } = get();
      if (!currentAgent || !serverUrl) {
        _autoReplyingCount = Math.max(0, _autoReplyingCount - 1);
        if (_autoReplyingCount === 0) set({ autoReplying: false, autoReplyStep: 'idle' });
        return;
      }

      const clawLinkSession = pending.sessionId
        ? clawLinkSessions.find(s => s.id === pending.sessionId)
        : clawLinkSessions.find(s => s.friendAgentId === pending.fromAgentId && !s.completed);
      const friendInfo = friends.find(f => f.agents?.some(a => a.id === pending.fromAgentId));
      const friendName = friendInfo?.user?.displayName || 'Contact';

      // fetch message history for conclusion detection
      try {
        const historyUrl = pending.sessionId
          ? `${serverUrl}/api/messages/${currentAgent.id}/${pending.fromAgentId}?sessionId=${pending.sessionId}`
          : `${serverUrl}/api/messages/${currentAgent.id}/${pending.fromAgentId}`;
        const histRes = await fetchWithAuth(get().token, historyUrl);
        const histData = await histRes.json();
        const allMessages = histData.success ? (histData.data || []) : [];

        await get()._sendAutoReply(content, pending.fromAgentId, pending.sessionId, clawLinkSession, friendInfo, friendName, allMessages);
      } catch { /* ignore */ }

      clearSessionStep(set, get, reviewLockKey);
      _autoReplyingCount = Math.max(0, _autoReplyingCount - 1);
      if (_autoReplyingCount === 0) set({ autoReplying: false, autoReplyStep: 'idle' });
    },

    // review mode: user rejects sending
    rejectReviewReply: () => {
      const pending = get().pendingReviewReply;
      const rejectLockKey = pending ? (pending.sessionId || pending.fromAgentId) : '';
      if (rejectLockKey) clearSessionStep(set, get, rejectLockKey, pending?.fromAgentId);
      _autoReplyingCount = Math.max(0, _autoReplyingCount - 1);
      set({ pendingReviewReply: null });
      if (_autoReplyingCount === 0) set({ autoReplying: false, autoReplyStep: 'idle' });
    },

    // owner responds to owner-request
    respondToOwnerRequest: async (reply: string) => {
      const pending = get().pendingOwnerRequest;
      if (!pending) return;

      const gatewayRpc = useGatewayStore.getState().rpc;
      try {
        await gatewayRpc<Record<string, unknown>>(
          'chat.send',
          { sessionKey: pending.openclawKey, message: `Owner replied: ${reply}`, deliver: false, idempotencyKey: crypto.randomUUID() },
          120_000,
        );
      } catch { /* ignore */ }

      set({ pendingOwnerRequest: null });
    },

    // owner skips owner-request
    skipOwnerRequest: async () => {
      const pending = get().pendingOwnerRequest;
      if (!pending) return;

      const gatewayRpc = useGatewayStore.getState().rpc;
      try {
        await gatewayRpc<Record<string, unknown>>(
          'chat.send',
          { sessionKey: pending.openclawKey, message: 'Owner replied: Skip, please decide on your own.', deliver: false, idempotencyKey: crypto.randomUUID() },
          120_000,
        );
      } catch { /* ignore */ }

      set({ pendingOwnerRequest: null });
    },

    // polling with two layers:
    // 1. retry queue (check failed sessions every 5s)
    // 2. server unread check (catch missed messages every 15s)
    startGlobalPolling: () => {
      const existingRetry = (window as any).__clawlink_retry_timer;
      if (existingRetry) clearInterval(existingRetry);
      const existingFallback = (window as any).__clawlink_fallback_timer;
      if (existingFallback) clearInterval(existingFallback);

      // ── retry queue: check every 5s, exponential backoff for failed sessions ──
      const retryTimer = setInterval(() => {
        const { currentAgent, serverUrl } = get();
        if (!currentAgent || !serverUrl) return;

        const now = Date.now();
        for (const [lockKey, item] of _retryQueue) {
          if (now < item.nextRetryAt) continue;
          // skip if currently processing
          const lockTime = _sessionAutoReplyLocks.get(lockKey);
          if (lockTime && now - lockTime < 10 * 60 * 1000) continue;

          _retryQueue.delete(lockKey);
          // clear potentially corrupted openclawSessionKey and context flag before retry
          if (item.sessionId) {
            const sessions = get().clawLinkSessions;
            const session = sessions.find(s => s.id === item.sessionId);
            if (session?.openclawSessionKey) {
              const updated = sessions.map(s => s.id === item.sessionId ? { ...s, openclawSessionKey: null } : s);
              set({ clawLinkSessions: updated });
            }
            _contextSentSessions.delete(lockKey);
          }
          get().handleAutoReply(item.content, item.fromAgentId, undefined, item.sessionId);
        }
      }, 5_000);
      (window as any).__clawlink_retry_timer = retryTimer;
    },
    stopGlobalPolling: () => {
      const retryTimer = (window as any).__clawlink_retry_timer;
      if (retryTimer) { clearInterval(retryTimer); (window as any).__clawlink_retry_timer = null; }
    },
  };
}
