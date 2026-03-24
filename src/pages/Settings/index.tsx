/**
 * Settings Page
 * Floating centered nav + full-width dark UI
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Copy, FileText, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import logoPng from '@/assets/logo.png';
import packageJson from '../../../package.json';
import { useSettingsStore } from '@/stores/settings';
import { useGatewayStore } from '@/stores/gateway';
import { useClawLinkStore } from '@/stores/clawlink';
// UpdateSettings removed - updates section deleted
import { getGatewayWsDiagnosticEnabled, invokeIpc, setGatewayWsDiagnosticEnabled, toUserMessage } from '@/lib/api-client';
import { clearUiTelemetry, getUiTelemetrySnapshot, subscribeUiTelemetry, trackUiEvent, type UiTelemetryEntry } from '@/lib/telemetry';
import { useTranslation } from 'react-i18next';
import { hostApiFetch } from '@/lib/host-api';
import { cn } from '@/lib/utils';
import { Models } from '@/pages/Models';
import { Skills } from '@/pages/Skills';
import { Cron } from '@/pages/Cron';

type ControlUiInfo = { url: string; token: string; port: number };

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="min-w-0 mr-4">
        <div className="text-[13px] text-foreground">{title}</div>
        {desc && <div className="text-[11px] text-muted-foreground/80 mt-0.5 leading-relaxed">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralSettings() {
  const { t } = useTranslation('clawlink');
  const { theme, fontScale, setTheme, setFontScale } = useSettingsStore();

  const themes: { key: 'dark' | 'light' | 'system'; label: string; disabled?: boolean }[] = [
    { key: 'dark', label: t('settings.themeDark') },
    { key: 'light', label: t('settings.themeLight') },
    { key: 'system', label: t('settings.themeSystem') },
  ];

  const fontSizes: { value: number; label: string }[] = [
    { value: 0.85, label: t('settings.fontSmall') },
    { value: 1, label: t('settings.fontDefault') },
    { value: 1.15, label: t('settings.fontLarge') },
    { value: 1.3, label: t('settings.fontXLarge') },
  ];

  return (
    <div className="space-y-5">
      {/* Theme + Font Scale — one row */}
      <div className="flex items-start gap-8">
        <div>
          <div className="text-[13px] text-foreground mb-2">{t('settings.themeTitle')}</div>
          <div className="flex gap-2">
            {themes.map(({ key, label, disabled }) => (
              <button
                key={key}
                onClick={() => !disabled && setTheme(key)}
                disabled={disabled}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                  disabled
                    ? "opacity-30 cursor-not-allowed border-foreground/[0.04] bg-foreground/[0.01] text-muted-foreground/40"
                    : theme === key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-foreground/[0.06] bg-muted/30 text-muted-foreground/80 hover:border-foreground/[0.12] hover:text-foreground/60"
                )}
                style={{ border: disabled ? undefined : `1px solid ${theme === key ? 'rgba(99,102,241,0.4)' : 'hsl(var(--border))'}` }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-foreground mb-2">{t('settings.fontSizeTitle')}</div>
          <div className="flex gap-2">
            {fontSizes.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFontScale(value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                  fontScale === value
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-foreground/[0.06] bg-muted/30 text-muted-foreground/80 hover:border-foreground/[0.12] hover:text-foreground/60"
                )}
                style={{ border: `1px solid ${fontScale === value ? 'rgba(99,102,241,0.4)' : 'hsl(var(--border))'}` }}
              >
                {label}
              </button>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConversationSettings() {
  const { t } = useTranslation('clawlink');
  const { autoReplyEnabled, autoReplyMode, customForbiddenRules, customAuthRules } = useClawLinkStore();

  // Check if a value is the i18n default (never manually edited by the user).
  // "__empty__" in localStorage means the user explicitly cleared it (vs null = never set).
  const { i18n } = useTranslation();
  const allLangs = ['zh', 'en', 'ko', 'ja'];
  const isDefaultValue = (value: string, storageKey: string, i18nKey: string) => {
    // User explicitly saved an empty value
    if (localStorage.getItem(storageKey) === '__empty__') return false;
    // Never set (null) = default
    if (localStorage.getItem(storageKey) === null) return true;
    // Matches any locale's default value
    if (!value) return true;
    for (const lang of allLangs) {
      const def = i18n.getResource(lang, 'clawlink', i18nKey);
      if (typeof def === 'string' && value.trim() === def.trim()) return true;
    }
    return false;
  };

  // Forbidden rules — follow locale changes unless user has manually edited
  const defaultRules = t('settings.customForbiddenRulesDefault');
  const forbiddenIsDefault = isDefaultValue(customForbiddenRules, 'clawlink:customForbiddenRules', 'settings.customForbiddenRulesDefault');
  const effectiveForbidden = forbiddenIsDefault ? defaultRules : customForbiddenRules;
  const [rulesDraft, setRulesDraft] = useState(effectiveForbidden);

  useEffect(() => {
    if (forbiddenIsDefault && defaultRules) {
      useClawLinkStore.setState({ customForbiddenRules: defaultRules });
      localStorage.setItem('clawlink:customForbiddenRules', defaultRules);
      setRulesDraft(defaultRules);
    }
  }, [i18n.language]);

  // Auth rules — follow locale changes unless user has manually edited
  const defaultAuthRules = t('settings.customAuthRulesDefault');
  const authIsDefault = isDefaultValue(customAuthRules, 'clawlink:customAuthRules', 'settings.customAuthRulesDefault');
  const effectiveAuth = authIsDefault ? defaultAuthRules : customAuthRules;
  const [authDraft, setAuthDraft] = useState(effectiveAuth);

  useEffect(() => {
    if (authIsDefault && defaultAuthRules) {
      useClawLinkStore.setState({ customAuthRules: defaultAuthRules });
      localStorage.setItem('clawlink:customAuthRules', defaultAuthRules);
      setAuthDraft(defaultAuthRules);
    }
  }, [i18n.language]);

  const currentKey = autoReplyEnabled ? autoReplyMode : 'paused';

  const modes = [
    { key: 'auto' as const, label: t('messages.autoReply.modeAuto'), desc: t('settings.conversationModeAutoDesc') },
    { key: 'review' as const, label: t('messages.autoReply.modeReview'), desc: t('settings.conversationModeReviewDesc') },
    { key: 'service' as const, label: t('messages.autoReply.modeService'), desc: t('settings.conversationModeServiceDesc') },
    { key: 'paused' as const, label: t('messages.autoReply.modePaused'), desc: t('settings.conversationModePausedDesc') },
  ];

  const modeDescriptions: Record<string, string> = {
    auto: t('settings.conversationSelectedAutoDesc'),
    review: t('settings.conversationSelectedReviewDesc'),
    service: t('settings.conversationSelectedServiceDesc'),
    paused: t('settings.conversationSelectedPausedDesc'),
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] text-foreground">{t('settings.conversationDefaultMode')}</div>
        <div className="text-[11px] text-muted-foreground/80 mt-0.5 leading-relaxed">{modeDescriptions[currentKey]}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {modes.map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => {
              if (key === 'paused') {
                useClawLinkStore.setState({ autoReplyEnabled: false });
              } else {
                useClawLinkStore.setState({ autoReplyEnabled: true, autoReplyMode: key });
              }
            }}
            className={cn(
              "text-left p-3 rounded-lg border transition-colors",
              currentKey === key
                ? "border-primary/40 bg-primary/5"
                : "border-foreground/[0.06] bg-muted/30 hover:border-foreground/[0.12]"
            )}
          >
            <div className={cn("text-[12px] font-medium", currentKey === key ? "text-primary" : "text-foreground/70")}>
              {label}
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">{desc}</div>
          </button>
        ))}
      </div>

      {/* Custom forbidden rules */}
      <div className="h-px bg-muted/60 my-2" />
      <div>
        <div className="text-[13px] text-foreground">{t('settings.customForbiddenRules')}</div>
        <div className="text-[11px] text-muted-foreground/80 mt-0.5 mb-3 leading-relaxed">{t('settings.customForbiddenRulesDesc')}</div>
        <textarea
          value={rulesDraft}
          onChange={(e) => setRulesDraft(e.target.value)}
          placeholder={t('settings.customForbiddenRulesPlaceholder')}
          rows={4}
          className="w-full rounded-lg bg-muted/50 border border-foreground/[0.06] text-foreground/80 placeholder:text-muted-foreground/40 text-[12px] p-3 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-foreground/10"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => {
              useClawLinkStore.setState({ customForbiddenRules: rulesDraft });
              localStorage.setItem('clawlink:customForbiddenRules', rulesDraft || '__empty__');
              toast.success(t('settings.customForbiddenRulesSaved'));
            }}
            disabled={rulesDraft === customForbiddenRules}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
              rulesDraft !== customForbiddenRules
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-foreground/[0.04] text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {t('settings.customForbiddenRulesSave')}
          </button>
          {rulesDraft === customForbiddenRules && rulesDraft && (
            <span className="text-[10px] text-green-400/60">{t('settings.customForbiddenRulesSaved')}</span>
          )}
        </div>
      </div>

      {/* Authorization-required actions */}
      <div className="h-px bg-muted/60 my-2" />
      <div>
        <div className="text-[13px] text-foreground">{t('settings.customAuthRules')}</div>
        <div className="text-[11px] text-muted-foreground/80 mt-0.5 mb-3 leading-relaxed">{t('settings.customAuthRulesDesc')}</div>
        <textarea
          value={authDraft}
          onChange={(e) => setAuthDraft(e.target.value)}
          placeholder={t('settings.customAuthRulesPlaceholder')}
          rows={4}
          className="w-full rounded-lg bg-muted/50 border border-foreground/[0.06] text-foreground/80 placeholder:text-muted-foreground/40 text-[12px] p-3 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-foreground/10"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => {
              useClawLinkStore.setState({ customAuthRules: authDraft });
              localStorage.setItem('clawlink:customAuthRules', authDraft || '__empty__');
              toast.success(t('settings.customAuthRulesSaved'));
            }}
            disabled={authDraft === customAuthRules}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
              authDraft !== customAuthRules
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-foreground/[0.04] text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {t('settings.customAuthRulesSave')}
          </button>
          {authDraft === customAuthRules && authDraft && (
            <span className="text-[10px] text-green-400/60">{t('settings.customAuthRulesSaved')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { t: tcl } = useTranslation('clawlink');

  const NAV = [
    { id: 'general', label: tcl('settings.general') },
    { id: 'models', label: tcl('settings.modelConfig') },
    { id: 'skills', label: tcl('settings.skills') },
    { id: 'cron', label: tcl('settings.cronTasks') },
    { id: 'conversation', label: tcl('settings.conversation') },
    { id: 'advanced', label: tcl('settings.advanced') },
  ] as const;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSection, setActiveSection] = useState('models');

  const {
    gatewayAutoStart, setGatewayAutoStart,
    proxyEnabled, proxyServer, proxyHttpServer, proxyHttpsServer, proxyAllServer, proxyBypassRules,
    setProxyEnabled, setProxyServer, setProxyHttpServer, setProxyHttpsServer, setProxyAllServer, setProxyBypassRules,
    devModeUnlocked, setDevModeUnlocked,
    showThinkingToggle, setShowThinkingToggle,
  } = useSettingsStore();

  const { status: gatewayStatus, restart: restartGateway } = useGatewayStore();
  const [controlUiInfo, setControlUiInfo] = useState<ControlUiInfo | null>(null);
  const [openclawCliCommand, setOpenclawCliCommand] = useState('');
  const [openclawCliError, setOpenclawCliError] = useState<string | null>(null);
  const [proxyServerDraft, setProxyServerDraft] = useState('');
  const [proxyHttpServerDraft, setProxyHttpServerDraft] = useState('');
  const [proxyHttpsServerDraft, setProxyHttpsServerDraft] = useState('');
  const [proxyAllServerDraft, setProxyAllServerDraft] = useState('');
  const [proxyBypassRulesDraft, setProxyBypassRulesDraft] = useState('');
  const [proxyEnabledDraft, setProxyEnabledDraft] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);
  const [wsDiagnosticEnabled, setWsDiagnosticEnabled] = useState(false);
  const [showTelemetryViewer, setShowTelemetryViewer] = useState(false);
  const [telemetryEntries, setTelemetryEntries] = useState<UiTelemetryEntry[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const isWindows = window.electron.platform === 'win32';
  const [showLogs, setShowLogs] = useState(false);
  const [logContent, setLogContent] = useState('');

  // Scroll spy
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const offset = el.scrollTop + 120;
      let cur = 'models';
      for (const { id } of NAV) { const s = sectionRefs.current[id]; if (s && s.offsetTop <= offset) cur = id; }
      setActiveSection(cur);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const s = sectionRefs.current[id];
    if (s && scrollRef.current) scrollRef.current.scrollTo({ top: s.offsetTop - 40, behavior: 'smooth' });
    if (id === 'advanced') setShowAdvanced(true);
  };

  // Handlers
  const handleShowLogs = async () => { try { const r = await hostApiFetch<{ content: string }>('/api/logs?tailLines=100'); setLogContent(r.content); setShowLogs(true); } catch { setLogContent('(Failed)'); setShowLogs(true); } };
  const handleOpenLogDir = async () => { try { const { dir } = await hostApiFetch<{ dir: string | null }>('/api/logs/dir'); if (dir) await invokeIpc('shell:showItemInFolder', dir); } catch {} };
  const refreshControlUiInfo = async () => { try { const r = await hostApiFetch<{ success: boolean; url?: string; token?: string; port?: number }>('/api/gateway/control-ui'); if (r.success && r.url && r.token && typeof r.port === 'number') setControlUiInfo({ url: r.url, token: r.token, port: r.port }); } catch {} };
  const handleCopyGatewayToken = async () => { if (!controlUiInfo?.token) return; try { await navigator.clipboard.writeText(controlUiInfo.token); toast.success(t('developer.tokenCopied')); } catch (e) { toast.error(String(e)); } };
  const handleCopyCliCommand = async () => { if (!openclawCliCommand) return; try { await navigator.clipboard.writeText(openclawCliCommand); toast.success(t('developer.cmdCopied')); } catch (e) { toast.error(String(e)); } };
  const handleSaveProxySettings = async () => {
    setSavingProxy(true);
    try {
      const n = { proxyEnabled: proxyEnabledDraft, proxyServer: proxyServerDraft.trim(), proxyHttpServer: proxyHttpServerDraft.trim(), proxyHttpsServer: proxyHttpsServerDraft.trim(), proxyAllServer: proxyAllServerDraft.trim(), proxyBypassRules: proxyBypassRulesDraft.trim() };
      await invokeIpc('settings:setMany', n);
      setProxyServer(n.proxyServer); setProxyHttpServer(n.proxyHttpServer); setProxyHttpsServer(n.proxyHttpsServer); setProxyAllServer(n.proxyAllServer); setProxyBypassRules(n.proxyBypassRules); setProxyEnabled(n.proxyEnabled);
      toast.success(t('gateway.proxySaved')); trackUiEvent('settings.proxy_saved', { enabled: proxyEnabledDraft });
    } catch (e) { toast.error(`${t('gateway.proxySaveFailed')}: ${toUserMessage(e)}`); } finally { setSavingProxy(false); }
  };
  const handleWsDiagnosticToggle = (enabled: boolean) => { setGatewayWsDiagnosticEnabled(enabled); setWsDiagnosticEnabled(enabled); toast.success(enabled ? t('developer.wsDiagnosticEnabled') : t('developer.wsDiagnosticDisabled')); };
  const handleCopyTelemetry = async () => { try { await navigator.clipboard.writeText(telemetryEntries.map((e) => JSON.stringify(e)).join('\n')); toast.success(t('developer.telemetryCopied')); } catch (e) { toast.error(String(e)); } };
  const handleClearTelemetry = () => { clearUiTelemetry(); setTelemetryEntries([]); toast.success(t('developer.telemetryCleared')); };

  // Effects
  useEffect(() => { let c = false; (async () => { try { const r = await invokeIpc<{ success: boolean; command?: string; error?: string }>('openclaw:getCliCommand'); if (c) return; if (r.success && r.command) { setOpenclawCliCommand(r.command); setOpenclawCliError(null); } else { setOpenclawCliCommand(''); setOpenclawCliError(r.error || ''); } } catch (e) { if (!c) { setOpenclawCliCommand(''); setOpenclawCliError(String(e)); } } })(); return () => { c = true; }; }, [devModeUnlocked]);
  useEffect(() => { const u = window.electron.ipcRenderer.on('openclaw:cli-installed', (...a: unknown[]) => { toast.success(`CLI installed at ${typeof a[0] === 'string' ? a[0] : ''}`); }); return () => { u?.(); }; }, []);
  useEffect(() => { setWsDiagnosticEnabled(getGatewayWsDiagnosticEnabled()); }, []);
  useEffect(() => { if (!devModeUnlocked) return; setTelemetryEntries(getUiTelemetrySnapshot(200)); const u = subscribeUiTelemetry((e) => setTelemetryEntries((p) => { const n = [...p, e]; if (n.length > 200) n.splice(0, n.length - 200); return n; })); return u; }, [devModeUnlocked]);
  useEffect(() => { setProxyEnabledDraft(proxyEnabled); }, [proxyEnabled]);
  useEffect(() => { setProxyServerDraft(proxyServer); }, [proxyServer]);
  useEffect(() => { setProxyHttpServerDraft(proxyHttpServer); }, [proxyHttpServer]);
  useEffect(() => { setProxyHttpsServerDraft(proxyHttpsServer); }, [proxyHttpsServer]);
  useEffect(() => { setProxyAllServerDraft(proxyAllServer); }, [proxyAllServer]);
  useEffect(() => { setProxyBypassRulesDraft(proxyBypassRules); }, [proxyBypassRules]);

  const telemetryStats = useMemo(() => { let ec = 0, sc = 0; for (const e of telemetryEntries) { if (e.event.endsWith('_error') || e.event.includes('request_error')) ec++; const d = typeof e.payload.durationMs === 'number' ? e.payload.durationMs : NaN; if (Number.isFinite(d) && d >= 800) sc++; } return { total: telemetryEntries.length, errorCount: ec, slowCount: sc }; }, [telemetryEntries]);
  const telemetryByEvent = useMemo(() => { const m = new Map<string, any>(); for (const e of telemetryEntries) { const c = m.get(e.event) ?? { event: e.event, count: 0, errorCount: 0, slowCount: 0, totalDuration: 0, timedCount: 0 }; c.count++; if (e.event.endsWith('_error') || e.event.includes('request_error')) c.errorCount++; const d = typeof e.payload.durationMs === 'number' ? e.payload.durationMs : NaN; if (Number.isFinite(d)) { c.totalDuration += d; c.timedCount++; if (d >= 800) c.slowCount++; } m.set(e.event, c); } return [...m.values()].sort((a: any, b: any) => b.count - a.count).slice(0, 12); }, [telemetryEntries]);

  const inputCls = "h-8 rounded-lg bg-muted/50 border-foreground/[0.06] text-foreground/80 placeholder:text-muted-foreground/40 font-mono text-[11px] focus-visible:ring-1 focus-visible:ring-white/10 focus-visible:border-foreground/10";

  return (
    <div className="flex -m-6 overflow-hidden" style={{ height: 'calc(var(--app-h) - 2.5rem)' }}>
      {/* Nav */}
      <div className="shrink-0 w-[180px] flex items-center pl-6">
        <nav className="flex flex-col gap-px w-full">
          {NAV.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => scrollTo(id)}
              className={cn("relative text-left pl-4 pr-3 py-1.5 rounded text-[12px] transition-all duration-150 whitespace-nowrap",
                activeSection === id ? "text-foreground font-medium" : "text-muted-foreground/50 hover:text-muted-foreground")}>
              {activeSection === id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary" />}
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-w-0">
        <div className="pr-8 py-10">

          {/* General */}
          <section ref={(el) => { sectionRefs.current['general'] = el; }} className="pb-12">
            <div className="text-[13px] text-muted-foreground/80 uppercase tracking-widest mb-5">{tcl('settings.general')}</div>
            <GeneralSettings />
          </section>

          <div className="h-px bg-muted/60" />

          {/* Models */}
          <section ref={(el) => { sectionRefs.current['models'] = el; }} className="pb-12">
            <div className="text-[13px] text-muted-foreground/80 uppercase tracking-widest mb-5">{tcl('settings.modelConfig')}</div>
            <Models />
          </section>

          <div className="h-px bg-muted/60" />

          {/* Skills */}
          <section ref={(el) => { sectionRefs.current['skills'] = el; }} className="py-12">
            <div className="text-[13px] text-muted-foreground/80 uppercase tracking-widest mb-5">{tcl('settings.skills')}</div>
            <Skills />
          </section>

          <div className="h-px bg-muted/60" />

          {/* Cron */}
          <section ref={(el) => { sectionRefs.current['cron'] = el; }} className="py-12">
            <div className="text-[13px] text-muted-foreground/80 uppercase tracking-widest mb-5">{tcl('settings.cronTasks')}</div>
            <Cron />
          </section>

          <div className="h-px bg-muted/60" />

          {/* Conversation */}
          <section ref={(el) => { sectionRefs.current['conversation'] = el; }} className="py-12">
            <div className="text-[13px] text-muted-foreground/80 uppercase tracking-widest mb-5">{tcl('settings.conversation')}</div>
            <ConversationSettings />
          </section>

          <div className="h-px bg-muted/60" />

          {/* Advanced */}
          <section ref={(el) => { sectionRefs.current['advanced'] = el; }} className="py-12 pb-24">
            <button type="button"
              className="flex items-center gap-1.5 text-[13px] text-muted-foreground/80 uppercase tracking-widest hover:text-foreground/70 transition-colors mb-5"
              onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {tcl('settings.advanced')}
            </button>

            {showAdvanced && (
              <div className="space-y-1">

                {/* Check for Updates */}
                <Row title={tcl('settings.checkUpdate')} desc={tcl('settings.checkUpdateDesc')}>
                  <button
                    onClick={async () => {
                      try {
                        toast.loading(tcl('settings.checkingUpdate'), { id: 'update-check' });
                        const result = await invokeIpc('update:check') as any;
                        if (result?.success) {
                          const status = result.status;
                          if (status?.status === 'available') {
                            toast.success(tcl('settings.updateAvailable', { version: status.info?.version || '' }), { id: 'update-check', duration: 5000 });
                            // auto download
                            await invokeIpc('update:download');
                            // after update installed, deploy resources
                          } else {
                            toast.success(tcl('settings.updateUpToDate'), { id: 'update-check' });
                          }
                        } else {
                          toast.error(result?.error || tcl('settings.updateCheckFailed'), { id: 'update-check' });
                        }
                      } catch (e) {
                        toast.error(tcl('settings.updateCheckFailed'), { id: 'update-check' });
                      }
                    }}
                    className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                  >
                    {tcl('settings.checkUpdateBtn')}
                  </button>
                </Row>

                {/* Gateway */}
                <Row title={t('gateway.status')} desc={`${t('gateway.port')}: ${gatewayStatus.port}`}>
                  <div className="flex items-center gap-2">
                    <span className={cn("flex items-center gap-1.5 text-[11px]",
                      gatewayStatus.state === 'running' ? "text-green-400" : gatewayStatus.state === 'error' ? "text-red-400" : "text-muted-foreground/80")}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", gatewayStatus.state === 'running' ? "bg-green-500" : gatewayStatus.state === 'error' ? "bg-red-500" : "bg-foreground/30")} />
                      {gatewayStatus.state}
                    </span>
                    <button onClick={restartGateway} className="text-[11px] text-muted-foreground/50 hover:text-foreground/60 flex items-center gap-1"><RefreshCw className="h-3 w-3" />{tc('actions.restart')}</button>
                    <button onClick={handleShowLogs} className="text-[11px] text-muted-foreground/50 hover:text-foreground/60 flex items-center gap-1"><FileText className="h-3 w-3" />{t('gateway.logs')}</button>
                    <button onClick={async () => {
                      try {
                        const result = await window.electron.ipcRenderer.invoke('clawlink:deployResources') as any;
                        if (result?.success) toast.success(t('about.resourceDeploySuccess'));
                        else toast.error(t('about.resourceDeployFailed'));
                      } catch { toast.error(t('about.resourceDeployFailed')); }
                    }} className="text-[11px] text-muted-foreground/50 hover:text-foreground/60 flex items-center gap-1">{t('about.resourceDeploy')}</button>
                    <button onClick={async () => {
                      try {
                        const r = await hostApiFetch<{ success: boolean; url?: string; token?: string; port?: number }>('/api/gateway/control-ui');
                        if (r.success && r.token && r.port) {
                          const port = r.port || 18789;
                          // OpenClaw dashboard reads token from URL fragment (#), not query param (?)
                          window.electron.openExternal(`http://127.0.0.1:${port}/#token=${encodeURIComponent(r.token)}`);
                        } else {
                          toast.error('OpenClaw is not running');
                        }
                      } catch { toast.error('OpenClaw is not running'); }
                    }} className="text-[11px] text-muted-foreground/50 hover:text-foreground/60 flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />OpenClaw Console
                    </button>
                  </div>
                </Row>

                {showLogs && (
                  <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-foreground/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-muted-foreground/80">{t('gateway.appLogs')}</span>
                      <div className="flex gap-2">
                        <button className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-0.5" onClick={handleOpenLogDir}><ExternalLink className="h-2.5 w-2.5" />{t('gateway.openFolder')}</button>
                        <button className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground" onClick={() => setShowLogs(false)}>{tc('actions.close')}</button>
                      </div>
                    </div>
                    <pre className="text-[10px] text-muted-foreground/60 bg-foreground/20 p-2.5 rounded max-h-28 overflow-auto whitespace-pre-wrap font-mono">{logContent || 'No logs'}</pre>
                  </div>
                )}

                <Row title={t('gateway.autoStart')} desc={t('gateway.autoStartDesc')}>
                  <Switch checked={gatewayAutoStart} onCheckedChange={setGatewayAutoStart} />
                </Row>

                {/* Proxy */}
                <Row title="Gateway Proxy" desc={t('gateway.proxyDesc')}>
                  <Switch checked={proxyEnabledDraft} onCheckedChange={setProxyEnabledDraft} />
                </Row>

                {proxyEnabledDraft && (
                  <div className="space-y-3 py-2">
                    <div className="grid grid-cols-4 gap-3">
                      {([
                        ['ps', t('gateway.proxyServer'), proxyServerDraft, setProxyServerDraft, 'http://127.0.0.1:7890'],
                        ['ph', t('gateway.proxyHttpServer'), proxyHttpServerDraft, setProxyHttpServerDraft, proxyServerDraft || 'http://127.0.0.1:7890'],
                        ['phs', t('gateway.proxyHttpsServer'), proxyHttpsServerDraft, setProxyHttpsServerDraft, proxyServerDraft || 'http://127.0.0.1:7890'],
                        ['pa', t('gateway.proxyAllServer'), proxyAllServerDraft, setProxyAllServerDraft, proxyServerDraft || 'socks5://127.0.0.1:7891'],
                      ] as const).map(([id, label, value, setter, ph]) => (
                        <div key={id}>
                          <div className="text-[10px] text-muted-foreground/40 mb-1">{label}</div>
                          <Input id={id} value={value} onChange={(e) => setter(e.target.value)} placeholder={ph} className={inputCls} />
                        </div>
                      ))}
                    </div>
                    <div className="max-w-sm">
                      <div className="text-[10px] text-muted-foreground/40 mb-1">{t('gateway.proxyBypass')}</div>
                      <Input value={proxyBypassRulesDraft} onChange={(e) => setProxyBypassRulesDraft(e.target.value)} placeholder="<local>;localhost;127.0.0.1;::1" className={inputCls} />
                    </div>
                    <button onClick={handleSaveProxySettings} disabled={savingProxy}
                      className="text-[11px] text-muted-foreground/60 hover:text-foreground/60 flex items-center gap-1 pt-1">
                      <RefreshCw className={cn("h-3 w-3", savingProxy && "animate-spin")} />
                      {savingProxy ? tc('status.saving') : tc('actions.save')}
                    </button>
                  </div>
                )}

                <div className="h-px bg-muted/60 my-3" />

                {/* Show thinking toggle */}
                <Row title={t('advanced.showThinking', 'Show Thinking Process')} desc={t('advanced.showThinkingDesc', 'Show the AI thinking process toggle button in chat toolbar')}>
                  <Switch checked={showThinkingToggle} onCheckedChange={setShowThinkingToggle} />
                </Row>

                <div className="h-px bg-muted/60 my-3" />

                {/* Dev mode */}
                <Row title={t('advanced.devMode')} desc={t('advanced.devModeDesc')}>
                  <Switch checked={devModeUnlocked} onCheckedChange={setDevModeUnlocked} />
                </Row>

                {devModeUnlocked && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-1.5">{t('developer.gatewayToken')}</div>
                      <div className="flex gap-1.5">
                        <Input readOnly value={controlUiInfo?.token || ''} placeholder={t('developer.tokenUnavailable')} className={cn(inputCls, "flex-1")} />
                        <button onClick={refreshControlUiInfo} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground px-2"><RefreshCw className="h-2.5 w-2.5" /></button>
                        <button onClick={handleCopyGatewayToken} disabled={!controlUiInfo?.token} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 px-2"><Copy className="h-2.5 w-2.5" /></button>
                      </div>
                    </div>
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-1.5">{t('developer.cli')}</div>
                      {isWindows && <div className="text-[10px] text-muted-foreground/40 mb-1">{t('developer.cliPowershell')}</div>}
                      <div className="flex gap-1.5">
                        <Input readOnly value={openclawCliCommand} placeholder={openclawCliError || t('developer.cmdUnavailable')} className={cn(inputCls, "flex-1")} />
                        <button onClick={handleCopyCliCommand} disabled={!openclawCliCommand} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 px-2"><Copy className="h-2.5 w-2.5" /></button>
                      </div>
                    </div>
                    <Row title={t('developer.wsDiagnostic')} desc={t('developer.wsDiagnosticDesc')}>
                      <Switch checked={wsDiagnosticEnabled} onCheckedChange={handleWsDiagnosticToggle} />
                    </Row>
                    <Row title={t('developer.telemetryViewer')} desc={t('developer.telemetryViewerDesc')}>
                      <button onClick={() => setShowTelemetryViewer((p) => !p)} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground">
                        {showTelemetryViewer ? tc('actions.hide') : tc('actions.show')}
                      </button>
                    </Row>

                    {showTelemetryViewer && (
                      <div className="space-y-2 rounded-lg border border-foreground/[0.06] p-3 bg-muted/30">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary" className="rounded-full text-[9px] h-4 px-1.5 bg-muted/50 text-muted-foreground/80 border-0">{t('developer.telemetryTotal')}: {telemetryStats.total}</Badge>
                          <Badge variant={telemetryStats.errorCount > 0 ? 'destructive' : 'secondary'} className="rounded-full text-[9px] h-4 px-1.5 bg-muted/50 text-muted-foreground/80 border-0">{t('developer.telemetryErrors')}: {telemetryStats.errorCount}</Badge>
                          <Badge variant="secondary" className="rounded-full text-[9px] h-4 px-1.5 bg-muted/50 text-muted-foreground/80 border-0">{t('developer.telemetrySlow')}: {telemetryStats.slowCount}</Badge>
                          <div className="ml-auto flex gap-1.5">
                            <button onClick={handleCopyTelemetry} className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/80 flex items-center gap-0.5"><Copy className="h-2 w-2" />{tc('actions.copy')}</button>
                            <button onClick={handleClearTelemetry} className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/80">{tc('actions.clear')}</button>
                          </div>
                        </div>
                        <div className="max-h-48 overflow-auto rounded border border-foreground/[0.06] bg-foreground/20 text-[10px]">
                          {telemetryByEvent.length > 0 && (
                            <div className="border-b border-foreground/[0.06] p-2">
                              <div className="text-[9px] font-medium text-muted-foreground/50 mb-1">{t('developer.telemetryAggregated')}</div>
                              <div className="space-y-0.5">
                                {telemetryByEvent.map((item: any) => (
                                  <div key={item.event} className="grid grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.8fr_1fr] gap-1 px-2 py-0.5 text-[9px] text-muted-foreground/70">
                                    <span className="truncate text-muted-foreground" title={item.event}>{item.event}</span>
                                    <span>n={item.count}</span>
                                    <span>avg={item.timedCount > 0 ? Math.round(item.totalDuration / item.timedCount) : 0}ms</span>
                                    <span>slow={item.slowCount}</span>
                                    <span>err={item.errorCount}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="space-y-0.5 p-2 font-mono">
                            {telemetryEntries.length === 0 ? (
                              <div className="text-muted-foreground/30 text-center py-3">{t('developer.telemetryEmpty')}</div>
                            ) : telemetryEntries.slice().reverse().map((entry) => (
                              <div key={entry.id} className="rounded bg-muted/30 p-1.5">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="text-muted-foreground text-[9px]">{entry.event}</span>
                                  <span className="text-muted-foreground/30 text-[8px]">{entry.ts}</span>
                                </div>
                                <pre className="whitespace-pre-wrap text-[8px] text-muted-foreground/50">{JSON.stringify({ count: entry.count, ...entry.payload }, null, 2)}</pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="h-px bg-muted/60 my-3" />

                {/* Factory Reset */}
                <Row title={tcl('settings.factoryReset')} desc={tcl('settings.factoryResetDesc')}>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="text-[11px] text-destructive/80 hover:text-destructive transition-colors"
                  >
                    {tcl('settings.factoryResetBtn')}
                  </button>
                </Row>

              </div>
            )}
          </section>

          {/* Footer — Website / GitHub / Support */}
          <section className="pb-12">
            <div className="flex items-center justify-center gap-8 pt-4">
              <button
                onClick={() => window.electron.openExternal('https://clawlink.live')}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                  <img src={logoPng} alt="ClawLink" className="w-8 h-8" />
                </div>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">{tcl('settings.footerWebsite')}</span>
              </button>

              <button
                onClick={() => window.electron.openExternal('https://github.com/CN-Syndra/ClawLink')}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                  <svg className="w-7 h-7 text-foreground/70 group-hover:text-foreground transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                </div>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">GitHub</span>
              </button>

              <button
                onClick={() => { navigator.clipboard.writeText('Support@clawlink.live'); toast.success(tcl('settings.emailCopied')); }}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                  <svg className="w-7 h-7 text-foreground/70 group-hover:text-foreground transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 7l10 7 10-7"/></svg>
                </div>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">{tcl('settings.footerSupport')}</span>
              </button>
            </div>

            <div className="text-center mt-4">
              <span className="text-[10px] text-muted-foreground/40">ClawLink v{packageJson.version}</span>
            </div>
          </section>
        </div>
      </div>

      {/* Factory Reset Confirm Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)} />
          <div className="relative z-10 w-[320px] bg-card border border-border rounded-2xl shadow-2xl p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-[15px] font-semibold text-foreground mb-1.5">{tcl('settings.factoryReset')}</h3>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                {tcl('settings.factoryResetConfirm')}
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors"
              >
                {tc('actions.cancel')}
              </button>
              <button
                onClick={async () => {
                  setShowResetConfirm(false);
                  try {
                    toast.loading(tcl('settings.factoryResetting'), { id: 'factory-reset' });
                    await window.electron.ipcRenderer.invoke('clawlink:factoryReset');
                    localStorage.clear();
                    sessionStorage.clear();
                    toast.success(tcl('settings.factoryResetDone'), { id: 'factory-reset' });
                    setTimeout(() => window.location.reload(), 500);
                  } catch {
                    toast.error(tcl('settings.factoryResetFailed'), { id: 'factory-reset' });
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
              >
                {tcl('settings.factoryResetBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
