/**
 * Setup Wizard — 4-step setup: Language → Deploy → Account → Complete
 * Left sidebar with vertical step nav, right content area
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { TitleBar } from '@/components/layout/TitleBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { useClawLinkStore } from '@/stores/clawlink';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { toast } from 'sonner';
import { invokeIpc } from '@/lib/api-client';
import { hostApiFetch } from '@/lib/host-api';
import { subscribeHostEvent } from '@/lib/host-events';

import {
  SETUP_PROVIDERS,
  type ProviderAccount,
  type ProviderType,
  type ProviderTypeInfo,
  getProviderIconUrl,
  resolveProviderApiKeyForSave,
  resolveProviderModelForSave,
  shouldInvertInDark,
  shouldShowProviderModelId,
} from '@/lib/providers';
import {
  buildProviderAccountId,
  fetchProviderSnapshot,
  hasConfiguredCredentials,
  pickPreferredAccount,
} from '@/lib/provider-accounts';

const providers = SETUP_PROVIDERS;

const STEP = { LANGUAGE: 0, DEPLOY: 1, ACCOUNT: 2, COMPLETE: 3 } as const;

const STEP_META = [
  { id: 'language', labelKey: 'steps.language.title', hintKey: 'Language' },
  { id: 'deploy', labelKey: 'steps.deploy.title', hintKey: 'Runtime & Model' },
  { id: 'account', labelKey: 'steps.account.title', hintKey: 'Login / Register' },
  { id: 'complete', labelKey: 'steps.complete.title', hintKey: 'Ready' },
];

export function Setup() {
  const { t } = useTranslation(['setup', 'settings']);
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(STEP.LANGUAGE);

  // Setup state
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [runtimeChecksPassed, setRuntimeChecksPassed] = useState(false);
  const [clawLinkLoggedIn, setClawLinkLoggedIn] = useState(false);

  const markSetupComplete = useSettingsStore((state) => state.markSetupComplete);

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case STEP.LANGUAGE: return true;
      case STEP.DEPLOY: return runtimeChecksPassed && providerConfigured;
      case STEP.ACCOUNT: return clawLinkLoggedIn;
      case STEP.COMPLETE: return true;
      default: return true;
    }
  }, [currentStep, runtimeChecksPassed, providerConfigured, clawLinkLoggedIn]);

  const handleNext = () => {
    if (currentStep === STEP.COMPLETE) {
      markSetupComplete();
      toast.success(t('complete.title'));
      navigate('/');
    } else {
      setCurrentStep(s => s + 1);
    }
  };

  const handleBack = () => setCurrentStep(s => Math.max(s - 1, 0));
  const handleSkip = () => { markSetupComplete(); navigate('/'); };

  const goStep = (n: number) => { if (n <= currentStep) setCurrentStep(n); };

  const checkSvg = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  );

  return (
    <div className="flex flex-col overflow-hidden bg-background text-foreground" style={{ height: 'var(--app-h, 100vh)' }}>
      <TitleBar />
      <div className="flex flex-1 min-h-0 relative">
        {/* Background glow effect */}
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[130px] opacity-[0.12] pointer-events-none bg-[#6366f1] -top-[150px] right-[10%] transition-all duration-[1500ms]" style={{ transform: `translate(${currentStep * 20}px, ${currentStep * 30}px)` }} />
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[130px] opacity-[0.12] pointer-events-none bg-[#8b5cf6] -bottom-[200px] left-[20%] transition-all duration-[1500ms]" style={{ transform: `translate(${currentStep * -15}px, ${currentStep * -20}px)` }} />

        {/* Left vertical step navigation */}
        <div className="w-[240px] shrink-0 flex flex-col justify-center pl-[60px] relative z-[1]">
          <div className="flex items-center gap-[10px] mb-[48px] pl-1">
            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-lg">🦞</div>
            <span className="text-[16px] font-semibold tracking-tight">ClawLink</span>
          </div>

          <div className="flex flex-col">
            {STEP_META.map((meta, i) => (
              <div key={meta.id} className="flex items-start gap-[14px] py-[12px] cursor-pointer" onClick={() => goStep(i)}>
                <div className="flex flex-col items-center shrink-0">
                  <div className={cn(
                    "w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-semibold transition-all duration-400 relative z-[2]",
                    i === currentStep && "border-[#6366f1] bg-[#6366f1] text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]",
                    i < currentStep && "border-[#22c55e] bg-[#22c55e] text-white",
                    i > currentStep && "border-foreground/[0.08] bg-muted/40 text-muted-foreground/40",
                  )}>
                    {i < currentStep ? checkSvg : i + 1}
                  </div>
                  {i < STEP_META.length - 1 && (
                    <div className={cn(
                      "w-[2px] h-[20px] my-1 transition-colors duration-400",
                      i < currentStep ? "bg-gradient-to-b from-[#22c55e] to-[rgba(99,102,241,0.4)]" : "bg-foreground/[0.06]"
                    )} />
                  )}
                </div>
                <div className="pt-[3px]">
                  <div className={cn(
                    "text-[13px] font-medium transition-colors leading-tight",
                    i === currentStep && "text-white",
                    i < currentStep && "text-foreground/60",
                    i > currentStep && "text-muted-foreground/60",
                  )}>
                    {t(meta.labelKey, meta.id)}
                  </div>
                  <div className="text-[10px] text-muted-foreground/30 mt-[2px]">{meta.hintKey}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col items-center px-[60px] relative z-[1] overflow-y-auto py-8 justify-center min-h-0">
          <div className="w-full max-w-[460px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {currentStep === STEP.LANGUAGE && <LanguageStep />}
                {currentStep === STEP.DEPLOY && (
                  <DeployStep
                    onRuntimeReady={setRuntimeChecksPassed}
                    providers={providers}
                    selectedProvider={selectedProvider}
                    onSelectProvider={setSelectedProvider}
                    apiKey={apiKey}
                    onApiKeyChange={setApiKey}
                    onConfiguredChange={setProviderConfigured}
                  />
                )}
                {currentStep === STEP.ACCOUNT && (
                  <ClawLinkContent onLoggedIn={() => setClawLinkLoggedIn(true)} />
                )}
                {currentStep === STEP.COMPLETE && (
                  <CompleteStep selectedProvider={selectedProvider} />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Bottom buttons */}
            <div className="flex items-center justify-between mt-9">
              <div>
                {currentStep > 0 && (
                  <button onClick={handleBack} className="flex items-center gap-1.5 px-0 py-2 text-[13px] text-muted-foreground/60 hover:text-foreground/60 transition-colors bg-transparent border-none cursor-pointer">
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {t('nav.back')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {currentStep !== STEP.COMPLETE && currentStep !== STEP.DEPLOY && (
                  <button onClick={handleSkip} className="px-0 py-2 text-[12px] text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors bg-transparent border-none cursor-pointer">
                    {t('nav.skipSetup')}
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className={cn(
                    "flex items-center gap-1.5 px-7 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all duration-200",
                    currentStep === STEP.COMPLETE
                      ? "bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(34,197,94,0.3)]"
                      : "bg-[#6366f1] text-white hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(99,102,241,0.3)]",
                    !canProceed && "opacity-30 cursor-not-allowed hover:translate-y-0 hover:shadow-none"
                  )}
                >
                  {currentStep === STEP.COMPLETE ? t('nav.getStarted') : t('nav.next')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Step 0: Language ====================
function LanguageStep() {
  const { t } = useTranslation('setup');
  const { language, setLanguage } = useSettingsStore();

  const langs = [
    { code: 'zh', flag: '🇨🇳', name: '简体中文', native: 'Simplified Chinese' },
    { code: 'en', flag: '🇺🇸', name: 'English', native: 'English' },
    { code: 'ja', flag: '🇯🇵', name: '日本語', native: 'Japanese' },
    { code: 'ko', flag: '🇰🇷', name: '한국어', native: 'Korean' },
  ];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-[24px] font-semibold tracking-tight mb-1.5">{t('steps.language.title', 'Select Language')}</h1>
        <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{t('steps.language.desc', 'Choose your display language. You can change it later in settings.')}</p>
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        {langs.map(l => {
          // Match against SUPPORTED_LANGUAGES to find the correct code
          const supported = SUPPORTED_LANGUAGES.find(sl => sl.code === l.code);
          const isSelected = language === l.code;
          return (
            <button
              key={l.code}
              onClick={() => { if (supported) setLanguage(l.code); }}
              className={cn(
                "flex items-center gap-3 p-4 rounded-[14px] border text-left transition-all duration-200 relative bg-transparent cursor-pointer",
                isSelected ? "border-[rgba(99,102,241,0.3)] bg-[rgba(99,102,241,0.06)]" : "border-foreground/[0.06] bg-muted/30 hover:bg-accent hover:border-foreground/[0.1]"
              )}
            >
              <span className="text-[24px]">{l.flag}</span>
              <div>
                <div className="text-[13px] font-medium text-foreground">{l.name}</div>
                <div className="text-[11px] text-muted-foreground/60">{l.native}</div>
              </div>
              <div className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#6366f1] flex items-center justify-center transition-transform duration-250",
                isSelected ? "scale-100" : "scale-0"
              )} style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                <Check className="h-[10px] w-[10px] text-white" strokeWidth={3} />
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ==================== Step 1: Deploy OpenClaw ====================
interface DeployStepProps {
  onRuntimeReady: (ready: boolean) => void;
  providers: ProviderTypeInfo[];
  selectedProvider: string | null;
  onSelectProvider: (id: string | null) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onConfiguredChange: (configured: boolean) => void;
}

function DeployStep({ onRuntimeReady, ...providerProps }: DeployStepProps) {
  const { t } = useTranslation('setup');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const startGateway = useGatewayStore((state) => state.start);

  const [checks, setChecks] = useState({
    openclaw: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
    gateway: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
    resources: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
  });

  const runChecks = useCallback(async () => {
    setChecks({
      openclaw: { status: 'checking', message: '' },
      gateway: { status: 'checking', message: '' },
      resources: { status: 'checking', message: '' },
    });

    // Check OpenClaw package
    try {
      const status = await invokeIpc('openclaw:status') as { packageExists: boolean; isBuilt: boolean; dir: string; version?: string };
      if (!status.packageExists || !status.isBuilt) {
        setChecks(prev => ({ ...prev, openclaw: { status: 'error', message: 'OpenClaw not found' } }));
      } else {
        setChecks(prev => ({ ...prev, openclaw: { status: 'success', message: status.version ? `v${status.version}` : t('runtime.status.success') } }));
      }
    } catch {
      setChecks(prev => ({ ...prev, openclaw: { status: 'error', message: 'Check failed' } }));
    }

    // Check Gateway
    const gw = useGatewayStore.getState().status;
    if (gw.state === 'running') {
      setChecks(prev => ({ ...prev, gateway: { status: 'success', message: t('runtime.status.gatewayRunning', { port: gw.port }) } }));
    } else if (gw.state === 'error') {
      setChecks(prev => ({ ...prev, gateway: { status: 'error', message: gw.error || 'Failed' } }));
    }

    // Deploy resources (skills + prompts) — force overwrite
    try {
      const result = await invokeIpc('clawlink:deployResources') as { success: boolean; skills: number; prompts: number };
      if (result.success) {
        setChecks(prev => ({ ...prev, resources: { status: 'success', message: t('runtime.resourceReady', 'Installed') } }));
      } else {
        setChecks(prev => ({ ...prev, resources: { status: 'error', message: 'Deploy failed' } }));
      }
    } catch {
      setChecks(prev => ({ ...prev, resources: { status: 'error', message: 'Deploy failed' } }));
    }
  }, [t]);

  useEffect(() => { runChecks(); }, [runChecks]);

  useEffect(() => {
    if (gatewayStatus.state === 'running') {
      setChecks(prev => ({ ...prev, gateway: { status: 'success', message: `Port ${gatewayStatus.port}` } }));
    } else if (gatewayStatus.state === 'error') {
      setChecks(prev => ({ ...prev, gateway: { status: 'error', message: gatewayStatus.error || 'Failed' } }));
    } else if (gatewayStatus.state === 'starting' || gatewayStatus.state === 'reconnecting') {
      setChecks(prev => ({ ...prev, gateway: { status: 'checking', message: 'Starting...' } }));
    }
  }, [gatewayStatus]);

  const runtimeOk = checks.openclaw.status === 'success' && (checks.gateway.status === 'success' || gatewayStatus.state === 'running') && checks.resources.status === 'success';
  useEffect(() => { onRuntimeReady(runtimeOk); }, [runtimeOk, onRuntimeReady]);

  const renderCircle = (status: 'checking' | 'success' | 'error') => (
    <div className={cn(
      "w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-500",
      status === 'success' && "border-[#22c55e] bg-[rgba(34,197,94,0.08)]",
      status === 'checking' && "border-[rgba(99,102,241,0.3)] bg-[rgba(99,102,241,0.05)]",
      status === 'error' && "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.05)]",
    )}>
      {status === 'success' && <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />}
      {status === 'checking' && <Loader2 className="h-4 w-4 text-[#6366f1] animate-spin" />}
      {status === 'error' && <XCircle className="h-4 w-4 text-red-400" />}
    </div>
  );

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight mb-1.5">{t('steps.deploy.title', 'Deploy OpenClaw')}</h1>
        <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{t('steps.deploy.desc', 'Detect runtime environment and configure AI model')}</p>
      </div>

      {/* Environment checks: side-by-side circles (compact) */}
      <div className="flex gap-3 justify-center mb-5">
        <div className="flex flex-col items-center gap-1.5 w-[120px]">
          {renderCircle(checks.openclaw.status)}
          <div className="text-[10px] font-medium text-muted-foreground text-center">OpenClaw Environment</div>
          <div className="text-[9px] text-muted-foreground/50 text-center">
            {checks.openclaw.status === 'success' ? checks.openclaw.message : checks.openclaw.status === 'error' ? checks.openclaw.message : t('runtime.status.checking')}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5 w-[120px]">
          {renderCircle(checks.gateway.status)}
          <div className="text-[10px] font-medium text-muted-foreground text-center">OpenClaw Startup</div>
          <div className="text-[9px] text-muted-foreground/50 text-center">
            {checks.gateway.status === 'success' ? checks.gateway.message : checks.gateway.status === 'error' ? (
              <button onClick={async () => { setChecks(p => ({ ...p, gateway: { status: 'checking', message: 'Starting...' } })); await startGateway(); }} className="text-[9px] text-[#6366f1] hover:underline bg-transparent border-none cursor-pointer">
                {t('runtime.startGateway', 'Start Gateway')}
              </button>
            ) : 'Starting...'}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5 w-[120px]">
          {renderCircle(checks.resources.status)}
          <div className="text-[10px] font-medium text-muted-foreground text-center">{t('runtime.resourceDeploy', 'Resource Deploy')}</div>
          <div className="text-[9px] text-muted-foreground/50 text-center">
            {checks.resources.status === 'success' ? checks.resources.message : checks.resources.status === 'error' ? checks.resources.message : t('runtime.status.checking')}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-muted/60 mb-4" />
      <div className="text-[11px] font-medium text-muted-foreground/60 mb-3">{t('provider.label', 'Select AI Model')}</div>

      {/* Provider config - reuse full logic */}
      <ProviderContent {...providerProps} providers={providerProps.providers} />
    </>
  );
}

// ==================== Provider Content (full logic preserved) ====================
interface ProviderContentProps {
  providers: ProviderTypeInfo[];
  selectedProvider: string | null;
  onSelectProvider: (id: string | null) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onConfiguredChange: (configured: boolean) => void;
}

function ProviderContent({
  providers,
  selectedProvider,
  onSelectProvider,
  apiKey,
  onApiKeyChange,
  onConfiguredChange,
}: ProviderContentProps) {
  const { t } = useTranslation(['setup', 'settings']);
  const devModeUnlocked = useSettingsStore((state) => state.devModeUnlocked);
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [authMode, setAuthMode] = useState<'oauth' | 'apikey'>('oauth');

  // OAuth
  const [oauthFlowing, setOauthFlowing] = useState(false);
  const [oauthData, setOauthData] = useState<{ verificationUri: string; userCode: string; expiresIn: number } | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const pendingOAuthRef = useRef<{ accountId: string; label: string } | null>(null);

  useEffect(() => {
    const handleCode = (data: unknown) => { setOauthData(data as any); setOauthError(null); };
    const handleSuccess = async (data: unknown) => {
      setOauthFlowing(false); setOauthData(null); setKeyValid(true);
      const payload = (data as { accountId?: string } | undefined) || undefined;
      const accountId = payload?.accountId || pendingOAuthRef.current?.accountId;
      if (accountId) {
        try {
          await hostApiFetch('/api/provider-accounts/default', { method: 'PUT', body: JSON.stringify({ accountId }) });
          setSelectedAccountId(accountId);
        } catch { /* ignore */ }
      }
      pendingOAuthRef.current = null;
      onConfiguredChange(true);
      toast.success(t('provider.valid'));
    };
    const handleError = (data: unknown) => { setOauthError((data as { message: string }).message); setOauthData(null); pendingOAuthRef.current = null; };
    const offCode = subscribeHostEvent('oauth:code', handleCode);
    const offSuccess = subscribeHostEvent('oauth:success', handleSuccess);
    const offError = subscribeHostEvent('oauth:error', handleError);
    return () => { offCode(); offSuccess(); offError(); };
  }, [onConfiguredChange, t]);

  const handleStartOAuth = async () => {
    if (!selectedProvider) return;
    try {
      const snapshot = await fetchProviderSnapshot();
      const existingVendorIds = new Set(snapshot.accounts.map(a => a.vendorId));
      if (selectedProvider === 'minimax-portal' && existingVendorIds.has('minimax-portal-cn')) { toast.error(t('settings:aiProviders.toast.minimaxConflict')); return; }
      if (selectedProvider === 'minimax-portal-cn' && existingVendorIds.has('minimax-portal')) { toast.error(t('settings:aiProviders.toast.minimaxConflict')); return; }
    } catch { /* ignore */ }
    setOauthFlowing(true); setOauthData(null); setOauthError(null);
    try {
      const snapshot = await fetchProviderSnapshot();
      const accountId = buildProviderAccountId(selectedProvider as ProviderType, selectedAccountId, snapshot.vendors);
      const label = selectedProviderData?.name || selectedProvider;
      pendingOAuthRef.current = { accountId, label };
      await hostApiFetch('/api/providers/oauth/start', { method: 'POST', body: JSON.stringify({ provider: selectedProvider, accountId, label }) });
    } catch (e) { setOauthError(String(e)); setOauthFlowing(false); pendingOAuthRef.current = null; }
  };

  const handleCancelOAuth = async () => { setOauthFlowing(false); setOauthData(null); setOauthError(null); pendingOAuthRef.current = null; await hostApiFetch('/api/providers/oauth/cancel', { method: 'POST' }); };

  // Restore previously configured provider on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchProviderSnapshot();
        const statusMap = new Map(snapshot.statuses.map(s => [s.id, s]));
        const setupProviderTypes = new Set<string>(providers.map(p => p.id));
        const setupCandidates = snapshot.accounts.filter(a => setupProviderTypes.has(a.vendorId));
        const preferred = (snapshot.defaultAccountId && setupCandidates.find(a => a.id === snapshot.defaultAccountId))
          || setupCandidates.find(a => hasConfiguredCredentials(a, statusMap.get(a.id)))
          || setupCandidates[0];
        if (preferred && !cancelled) {
          onSelectProvider(preferred.vendorId);
          setSelectedAccountId(preferred.id);
          const typeInfo = providers.find(p => p.id === preferred.vendorId);
          const requiresKey = typeInfo?.requiresApiKey ?? false;
          onConfiguredChange(!requiresKey || hasConfiguredCredentials(preferred, statusMap.get(preferred.id)));
          const storedKey = (await hostApiFetch<{ apiKey: string | null }>(`/api/providers/${encodeURIComponent(preferred.id)}/api-key`)).apiKey;
          onApiKeyChange(storedKey || '');
        } else if (!cancelled) { onConfiguredChange(false); onApiKeyChange(''); }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [onApiKeyChange, onConfiguredChange, onSelectProvider, providers]);

  // When provider changes, load stored key
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedProvider) return;
      try {
        const snapshot = await fetchProviderSnapshot();
        const statusMap = new Map(snapshot.statuses.map(s => [s.id, s]));
        const preferredAccount = pickPreferredAccount(snapshot.accounts, snapshot.defaultAccountId, selectedProvider, statusMap);
        const accountIdForLoad = preferredAccount?.id || selectedProvider;
        setSelectedAccountId(preferredAccount?.id || null);
        const savedProvider = await hostApiFetch<{ baseUrl?: string; model?: string } | null>(`/api/providers/${encodeURIComponent(accountIdForLoad)}`);
        const storedKey = (await hostApiFetch<{ apiKey: string | null }>(`/api/providers/${encodeURIComponent(accountIdForLoad)}/api-key`)).apiKey;
        if (!cancelled) {
          onApiKeyChange(storedKey || '');
          const info = providers.find(p => p.id === selectedProvider);
          setBaseUrl(savedProvider?.baseUrl || info?.defaultBaseUrl || '');
          setModelId(savedProvider?.model || info?.defaultModelId || '');
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [onApiKeyChange, selectedProvider, providers]);

  const selectedProviderData = providers.find(p => p.id === selectedProvider);
  const showBaseUrlField = selectedProviderData?.showBaseUrl ?? false;
  const showModelIdField = shouldShowProviderModelId(selectedProviderData, devModeUnlocked);
  const requiresKey = selectedProviderData?.requiresApiKey ?? false;
  const isOAuth = selectedProviderData?.isOAuth ?? false;
  const supportsApiKey = selectedProviderData?.supportsApiKey ?? false;
  const useOAuthFlow = isOAuth && (!supportsApiKey || authMode === 'oauth');

  const handleValidateAndSave = async () => {
    if (!selectedProvider) return;
    try {
      const snapshot = await fetchProviderSnapshot();
      const existingVendorIds = new Set(snapshot.accounts.map(a => a.vendorId));
      if (selectedProvider === 'minimax-portal' && existingVendorIds.has('minimax-portal-cn')) { toast.error(t('settings:aiProviders.toast.minimaxConflict')); return; }
      if (selectedProvider === 'minimax-portal-cn' && existingVendorIds.has('minimax-portal')) { toast.error(t('settings:aiProviders.toast.minimaxConflict')); return; }
    } catch { /* ignore */ }

    setValidating(true); setKeyValid(null);
    try {
      const isApiKeyRequired = requiresKey || (supportsApiKey && authMode === 'apikey');
      if (isApiKeyRequired && apiKey) {
        const result = await invokeIpc('provider:validateKey', selectedAccountId || selectedProvider, apiKey, { baseUrl: baseUrl.trim() || undefined }) as { valid: boolean; error?: string };
        setKeyValid(result.valid);
        if (!result.valid) { toast.error(result.error || t('provider.invalid')); setValidating(false); return; }
      } else { setKeyValid(true); }

      const effectiveModelId = resolveProviderModelForSave(selectedProviderData, modelId, devModeUnlocked);
      const snapshot = await fetchProviderSnapshot();
      const accountIdForSave = buildProviderAccountId(selectedProvider as ProviderType, selectedAccountId, snapshot.vendors);
      const effectiveApiKey = resolveProviderApiKeyForSave(selectedProvider, apiKey);
      const accountPayload: ProviderAccount = {
        id: accountIdForSave, vendorId: selectedProvider as ProviderType,
        label: selectedProvider === 'custom' ? t('settings:aiProviders.custom') : (selectedProviderData?.name || selectedProvider),
        authMode: selectedProvider === 'ollama' ? 'local' : 'api_key',
        baseUrl: baseUrl.trim() || undefined, model: effectiveModelId,
        enabled: true, isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      const saveResult = selectedAccountId
        ? await hostApiFetch<{ success: boolean; error?: string }>(`/api/provider-accounts/${encodeURIComponent(accountIdForSave)}`, { method: 'PUT', body: JSON.stringify({ updates: { label: accountPayload.label, authMode: accountPayload.authMode, baseUrl: accountPayload.baseUrl, model: accountPayload.model, enabled: accountPayload.enabled }, apiKey: effectiveApiKey }) })
        : await hostApiFetch<{ success: boolean; error?: string }>('/api/provider-accounts', { method: 'POST', body: JSON.stringify({ account: accountPayload, apiKey: effectiveApiKey }) });

      if (!saveResult.success) throw new Error(saveResult.error || 'Failed');
      const defaultResult = await hostApiFetch<{ success: boolean; error?: string }>('/api/provider-accounts/default', { method: 'PUT', body: JSON.stringify({ accountId: accountIdForSave }) });
      if (!defaultResult.success) throw new Error(defaultResult.error || 'Failed');

      setSelectedAccountId(accountIdForSave);
      onConfiguredChange(true);
      toast.success(t('provider.valid'));
    } catch (error) { setKeyValid(false); onConfiguredChange(false); toast.error('Configuration failed: ' + String(error)); }
    finally { setValidating(false); }
  };

  const handleSelectProvider = (providerId: string) => {
    onSelectProvider(providerId); setSelectedAccountId(null); onConfiguredChange(false); onApiKeyChange(''); setKeyValid(null); setAuthMode('oauth');
  };

  const isApiKeyRequired = requiresKey || (supportsApiKey && authMode === 'apikey');
  const canSubmit = selectedProvider && (isApiKeyRequired ? apiKey.length > 0 : true) && (showModelIdField ? modelId.trim().length > 0 : true) && !useOAuthFlow;

  return (
    <div className="space-y-4">
      {/* Provider chips */}
      <div className="flex gap-2 flex-wrap">
        {providers.map(p => {
          const iconUrl = getProviderIconUrl(p.id);
          const isSelected = selectedProvider === p.id;
          return (
            <button key={p.id} onClick={() => handleSelectProvider(p.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-[10px] border text-[12px] transition-all cursor-pointer bg-transparent",
                isSelected ? "border-[rgba(99,102,241,0.4)] bg-[rgba(99,102,241,0.06)] text-white" : "border-foreground/[0.06] text-muted-foreground/80 hover:border-foreground/[0.12] hover:text-foreground/60"
              )}>
              {iconUrl && <img src={iconUrl} alt={p.name} className={cn("h-3.5 w-3.5", shouldInvertInDark(p.id) && "invert")} />}
              {p.id === 'custom' ? t('settings:aiProviders.custom') : p.name}
            </button>
          );
        })}
      </div>

      {/* Dynamic config */}
      {selectedProvider && (
        <motion.div key={selectedProvider} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {showBaseUrlField && (
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{t('provider.baseUrl')}</label>
              <input type="text" placeholder="https://api.example.com/v1" value={baseUrl} onChange={e => { setBaseUrl(e.target.value); onConfiguredChange(false); }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-foreground/[0.08] bg-muted/40 text-foreground text-[13px] outline-none focus:border-[rgba(99,102,241,0.5)] placeholder:text-muted-foreground/40" />
            </div>
          )}
          {showModelIdField && (
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{t('provider.modelId')}</label>
              <input type="text" placeholder={selectedProviderData?.modelIdPlaceholder || 'e.g. deepseek-ai/DeepSeek-V3'} value={modelId} onChange={e => { setModelId(e.target.value); onConfiguredChange(false); }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-foreground/[0.08] bg-muted/40 text-foreground text-[13px] outline-none focus:border-[rgba(99,102,241,0.5)] placeholder:text-muted-foreground/40" />
            </div>
          )}

          {/* Auth mode toggle */}
          {isOAuth && supportsApiKey && (
            <div className="flex rounded-xl border border-foreground/[0.08] overflow-hidden text-[12px]">
              <button onClick={() => setAuthMode('oauth')} className={cn("flex-1 py-2 px-3 transition-colors border-none cursor-pointer", authMode === 'oauth' ? "bg-[#6366f1] text-white" : "bg-transparent text-muted-foreground/80 hover:bg-accent")}>
                {t('settings:aiProviders.oauth.loginMode')}
              </button>
              <button onClick={() => setAuthMode('apikey')} className={cn("flex-1 py-2 px-3 transition-colors border-none cursor-pointer", authMode === 'apikey' ? "bg-[#6366f1] text-white" : "bg-transparent text-muted-foreground/80 hover:bg-accent")}>
                {t('settings:aiProviders.oauth.apikeyMode')}
              </button>
            </div>
          )}

          {/* API Key */}
          {(!isOAuth || (supportsApiKey && authMode === 'apikey')) && (
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{t('provider.apiKey')}</label>
              <div className="relative">
                <input type={showKey ? 'text' : 'password'} placeholder={selectedProviderData?.placeholder} value={apiKey}
                  onChange={e => { onApiKeyChange(e.target.value); onConfiguredChange(false); setKeyValid(null); }}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-foreground/[0.08] bg-muted/40 text-foreground text-[13px] outline-none focus:border-[rgba(99,102,241,0.5)] placeholder:text-muted-foreground/40" />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground/60 bg-transparent border-none cursor-pointer">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* OAuth flow */}
          {useOAuthFlow && (
            <div className="space-y-3">
              <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 text-center">
                <p className="text-[12px] text-blue-200 mb-3">This provider requires signing in via your browser.</p>
                <Button onClick={handleStartOAuth} disabled={oauthFlowing} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  {oauthFlowing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting...</> : 'Login with Browser'}
                </Button>
              </div>
              {oauthFlowing && (
                <div className="p-4 border border-foreground/[0.08] rounded-xl bg-muted/30 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[#6366f1]/5 animate-pulse" />
                  <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                    {oauthError ? (
                      <div className="text-red-400 space-y-2">
                        <XCircle className="h-8 w-8 mx-auto" />
                        <p className="font-medium text-[13px]">Authentication Failed</p>
                        <p className="text-[12px] opacity-80">{oauthError}</p>
                        <Button variant="outline" size="sm" onClick={handleCancelOAuth}>Try Again</Button>
                      </div>
                    ) : !oauthData ? (
                      <div className="py-4"><Loader2 className="h-8 w-8 animate-spin text-[#6366f1] mx-auto" /><p className="text-[12px] text-muted-foreground/60 mt-3 animate-pulse">Requesting secure login code...</p></div>
                    ) : (
                      <div className="space-y-4 w-full">
                        <div className="text-left space-y-1">
                          <h3 className="font-medium text-[15px]">Approve Login</h3>
                          <p className="text-[11px] text-muted-foreground/60">1. Copy the code → 2. Open login page → 3. Paste to approve</p>
                        </div>
                        <div className="flex items-center justify-center gap-2 p-3 bg-black/30 border border-foreground/[0.08] rounded-xl">
                          <code className="text-2xl font-mono tracking-widest font-bold text-[#6366f1]">{oauthData.userCode}</code>
                          <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(oauthData.userCode); toast.success('Code copied'); }}><Copy className="h-4 w-4" /></Button>
                        </div>
                        <Button variant="secondary" className="w-full" onClick={() => invokeIpc('shell:openExternal', oauthData.verificationUri)}>
                          <ExternalLink className="h-4 w-4 mr-2" /> Open Login Page
                        </Button>
                        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/40"><Loader2 className="h-3 w-3 animate-spin" /><span>Waiting for approval...</span></div>
                        <Button variant="ghost" size="sm" className="w-full" onClick={handleCancelOAuth}>Cancel</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validate & Save */}
          <button onClick={handleValidateAndSave} disabled={!canSubmit || validating}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all bg-[#6366f1] text-white hover:bg-[#5558e6]",
              (!canSubmit || validating) && "opacity-30 cursor-not-allowed",
              useOAuthFlow && "hidden"
            )}>
            {validating && <Loader2 className="h-4 w-4 animate-spin" />}
            {requiresKey ? t('provider.validateSave') : t('provider.save')}
          </button>

          {keyValid !== null && (
            <p className={cn('text-[12px] text-center', keyValid ? 'text-green-400' : 'text-red-400')}>
              {keyValid ? `✓ ${t('provider.valid')}` : `✗ ${t('provider.invalid')}`}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/40 text-center">{t('provider.storedLocally')}</p>
        </motion.div>
      )}
    </div>
  );
}

// ==================== Step 2: ClawLink Account ====================
function ClawLinkContent({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t: tcl } = useTranslation('clawlink');
  const { register, login, currentUser, serverUrl, setServerUrl, testConnection } = useClawLinkStore();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPw, setRegConfirmPw] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  useEffect(() => { setServerUrl(serverUrl); const t = setTimeout(() => testConnection(), 500); return () => clearTimeout(t); }, []);
  useEffect(() => { if (currentUser) onLoggedIn(); }, [currentUser, onLoggedIn]);

  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) { setLoginError(tcl('auth.errors.loginRequired')); return; }
    setLoginLoading(true); setLoginError('');
    try { const ok = await login(loginUsername, loginPassword); if (!ok) setLoginError(tcl('auth.errors.loginFailed')); }
    catch { setLoginError(tcl('auth.errors.loginServerError')); }
    finally { setLoginLoading(false); }
  };

  const handleRegister = async () => {
    if (!regUsername.trim() || !regDisplayName.trim()) { setRegError(tcl('auth.errors.usernameAndDisplayRequired')); return; }
    if (!regPassword || regPassword.length < 6) { setRegError(tcl('auth.errors.passwordMinLength')); return; }
    if (regPassword !== regConfirmPw) { setRegError(tcl('auth.errors.passwordMismatch')); return; }
    setRegLoading(true); setRegError('');
    try { const ok = await register(regUsername, regDisplayName, '', '', regPassword); if (!ok) setRegError(tcl('auth.errors.registerFailed')); }
    catch { setRegError(tcl('auth.errors.registerServerError')); }
    finally { setRegLoading(false); }
  };

  if (currentUser) {
    return (
      <>
        <div className="mb-8">
          <h1 className="text-[24px] font-semibold tracking-tight mb-1.5">ClawLink {tcl('auth.login')}</h1>
        </div>
        <div className="text-center py-6">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }}>
            <CheckCircle2 className="h-16 w-16 text-[#22c55e] mx-auto" />
          </motion.div>
          <h2 className="text-[18px] font-semibold mt-4">{currentUser.displayName}</h2>
          <p className="text-[13px] text-muted-foreground/60 mt-1">@{currentUser.username}</p>
          <p className="text-[12px] text-muted-foreground/40 mt-3">{tcl('auth.loginSuccess', 'ClawLink connected. Click to continue.')}</p>
        </div>
      </>
    );
  }

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-foreground/[0.08] bg-muted/40 text-foreground text-[13px] outline-none focus:border-[rgba(99,102,241,0.5)] placeholder:text-muted-foreground/40";

  return (
    <>
      <div className="mb-8">
        <h1 className="text-[24px] font-semibold tracking-tight mb-1.5">ClawLink {tcl('auth.title', 'Account')}</h1>
        <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{tcl('auth.subtitle')}</p>
      </div>

      {/* Tab */}
      <div className="flex gap-[2px] p-[3px] bg-muted/40 rounded-xl mb-6">
        <button onClick={() => setActiveTab('login')} className={cn("flex-1 py-2 text-[12px] font-medium rounded-[10px] border-none cursor-pointer transition-all", activeTab === 'login' ? "bg-foreground/[0.06] text-white" : "bg-transparent text-muted-foreground/80")}>
          {tcl('auth.login')}
        </button>
        <button onClick={() => setActiveTab('register')} className={cn("flex-1 py-2 text-[12px] font-medium rounded-[10px] border-none cursor-pointer transition-all", activeTab === 'register' ? "bg-foreground/[0.06] text-white" : "bg-transparent text-muted-foreground/80")}>
          {tcl('auth.register')}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'login' ? (
          <motion.div key="login" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{tcl('auth.username')}</label>
              <input type="text" placeholder={tcl('auth.usernamePlaceholder')} value={loginUsername} onChange={e => setLoginUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{tcl('auth.password')}</label>
              <div className="relative">
                <input type={showLoginPw ? 'text' : 'password'} placeholder={tcl('auth.passwordPlaceholder')} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} className={cn(inputCls, "pr-10")} />
                <button onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground/60 bg-transparent border-none cursor-pointer">
                  {showLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {loginError && <div className="flex items-center gap-2 text-[12px] text-red-400 bg-red-500/10 px-3 py-2 rounded-xl"><AlertCircle className="h-4 w-4 shrink-0" />{loginError}</div>}
            <button onClick={handleLogin} disabled={loginLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer bg-[#6366f1] text-white hover:bg-[#5558e6] disabled:opacity-30">
              {loginLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tcl('auth.login')}
            </button>
          </motion.div>
        ) : (
          <motion.div key="register" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{tcl('auth.username')} <span className="text-red-400/70">*</span></label>
                <input type="text" placeholder={tcl('auth.usernameRegPlaceholder')} value={regUsername} onChange={e => setRegUsername(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{tcl('auth.displayName')} <span className="text-red-400/70">*</span></label>
                <input type="text" placeholder={tcl('auth.displayNamePlaceholder')} value={regDisplayName} onChange={e => setRegDisplayName(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{tcl('auth.password')} <span className="text-red-400/70">*</span></label>
                <div className="relative">
                  <input type={showRegPw ? 'text' : 'password'} placeholder={tcl('auth.passwordRegPlaceholder')} value={regPassword} onChange={e => setRegPassword(e.target.value)} className={cn(inputCls, "pr-9")} />
                  <button onClick={() => setShowRegPw(!showRegPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground/60 bg-transparent border-none cursor-pointer">
                    {showRegPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground/80 mb-1.5">{tcl('auth.confirmPassword')} <span className="text-red-400/70">*</span></label>
                <input type={showRegPw ? 'text' : 'password'} placeholder={tcl('auth.confirmPasswordPlaceholder')} value={regConfirmPw} onChange={e => setRegConfirmPw(e.target.value)} className={inputCls} />
              </div>
            </div>
            {regError && <div className="flex items-center gap-2 text-[12px] text-red-400 bg-red-500/10 px-3 py-2 rounded-xl"><AlertCircle className="h-4 w-4 shrink-0" />{regError}</div>}
            <button onClick={handleRegister} disabled={regLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer bg-[#6366f1] text-white hover:bg-[#5558e6] disabled:opacity-30">
              {regLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tcl('auth.createAccount')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ==================== Step 3: Complete ====================
function CompleteStep({ selectedProvider }: { selectedProvider: string | null }) {
  const { t } = useTranslation(['setup', 'settings', 'clawlink']);
  const gatewayStatus = useGatewayStore(s => s.status);
  const providerData = providers.find(p => p.id === selectedProvider);
  const clawLinkUser = useClawLinkStore(s => s.currentUser);

  return (
    <>
      <div className="flex items-center gap-4 mb-8">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.5 }}
          className="w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-[rgba(34,197,94,0.12)] to-[rgba(99,102,241,0.12)] border border-[rgba(34,197,94,0.15)] flex items-center justify-center text-[36px] shrink-0"
        >
          🎉
        </motion.div>
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight mb-1">{t('setup:complete.title', 'All Set!')}</h1>
          <p className="text-[13px] text-muted-foreground/70">{t('setup:complete.subtitle', 'Start your AI collaboration journey')}</p>
        </div>
      </div>

      <div className="space-y-2.5 mb-6">
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-foreground/[0.04]">
          <span className="text-[12px] text-muted-foreground">AI Provider</span>
          <span className="text-[12px] text-[#22c55e] flex items-center gap-1.5">
            {providerData ? <>{providerData.name}</> : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-foreground/[0.04]">
          <span className="text-[12px] text-muted-foreground">ClawLink</span>
          <span className={cn("text-[12px]", clawLinkUser ? "text-[#22c55e]" : "text-muted-foreground/40")}>
            {clawLinkUser ? `✓ ${clawLinkUser.displayName}` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-foreground/[0.04]">
          <span className="text-[12px] text-muted-foreground">Gateway</span>
          <span className={cn("text-[12px]", gatewayStatus.state === 'running' ? "text-[#22c55e]" : "text-amber-400")}>
            {gatewayStatus.state === 'running' ? '✓ Running' : gatewayStatus.state}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {[
          { icon: '💬', text: t('clawlink:messages.welcome.subtitle', 'Chat with your Claw') },
          { icon: '🤝', text: t('setup:complete.feature2', 'Add friends and let Claw negotiate for you') },
          { icon: '📋', text: t('setup:complete.feature3', 'View task conclusions and track collaboration results') },
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-muted/30 border border-foreground/[0.04] text-[12px] text-muted-foreground">
            <span className="text-[15px]">{f.icon}</span>
            <span>{f.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default Setup;
