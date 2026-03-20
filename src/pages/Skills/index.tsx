/**
 * Skills Page
 * Browse and manage AI skills — dark embedded sub-component
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Puzzle,
  Lock,
  Package,
  X,
  AlertCircle,
  Plus,
  Key,
  Trash2,
  RefreshCw,
  FolderOpen,
  FileCode,
  Globe,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSkillsStore } from '@/stores/skills';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { invokeIpc } from '@/lib/api-client';
import { hostApiFetch } from '@/lib/host-api';
import { trackUiEvent } from '@/lib/telemetry';
import { toast } from 'sonner';
import type { Skill } from '@/types/skill';
import { useTranslation } from 'react-i18next';




// Skill detail dialog component
interface SkillDetailDialogProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onUninstall?: (slug: string) => void;
}

function SkillDetailDialog({ skill, isOpen, onClose, onToggle, onUninstall }: SkillDetailDialogProps) {
  const { t } = useTranslation('skills');
  const { fetchSkills } = useSkillsStore();
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize config from skill
  useEffect(() => {
    if (!skill) return;

    // API Key
    if (skill.config?.apiKey) {
      setApiKey(String(skill.config.apiKey));
    } else {
      setApiKey('');
    }

    // Env Vars
    if (skill.config?.env) {
      const vars = Object.entries(skill.config.env).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(vars);
    } else {
      setEnvVars([]);
    }
  }, [skill]);

  const handleOpenClawhub = async () => {
    if (!skill?.slug) return;
    await invokeIpc('shell:openExternal', `https://clawhub.ai/s/${skill.slug}`);
  };

  const handleOpenEditor = async () => {
    if (!skill?.slug) return;
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>('/api/clawhub/open-readme', {
        method: 'POST',
        body: JSON.stringify({ slug: skill.slug }),
      });
      if (result.success) {
        toast.success(t('toast.openedEditor'));
      } else {
        toast.error(result.error || t('toast.failedEditor'));
      }
    } catch (err) {
      toast.error(t('toast.failedEditor') + ': ' + String(err));
    }
  };

  const handleAddEnv = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleUpdateEnv = (index: number, field: 'key' | 'value', value: string) => {
    const newVars = [...envVars];
    newVars[index] = { ...newVars[index], [field]: value };
    setEnvVars(newVars);
  };

  const handleRemoveEnv = (index: number) => {
    const newVars = [...envVars];
    newVars.splice(index, 1);
    setEnvVars(newVars);
  };

  const handleSaveConfig = async () => {
    if (isSaving || !skill) return;
    setIsSaving(true);
    try {
      // Build env object, filtering out empty keys
      const envObj = envVars.reduce((acc, curr) => {
        const key = curr.key.trim();
        const value = curr.value.trim();
        if (key) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      // Use direct file access instead of Gateway RPC for reliability
      const result = await invokeIpc<{ success: boolean; error?: string }>(
        'skill:updateConfig',
        {
          skillKey: skill.id,
          apiKey: apiKey || '', // Empty string will delete the key
          env: envObj // Empty object will clear all env vars
        }
      ) as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      // Refresh skills from gateway to get updated config
      await fetchSkills();

      toast.success(t('detail.configSaved'));
    } catch (err) {
      toast.error(t('toast.failedSave') + ': ' + String(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!skill) return null;

  const inputCls = "h-8 w-full rounded-lg bg-muted/50 border border-foreground/[0.06] text-foreground/80 placeholder:text-white/[0.12] font-mono text-[11px] px-2.5 outline-none transition-colors focus:border-foreground/[0.15]";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-[450px] p-0 flex flex-col border-l border-foreground/[0.06] bg-background shadow-[0_0_40px_rgba(0,0,0,0.4)]"
        side="right"
      >
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-muted/30 border border-foreground/[0.06] shrink-0 mb-4 relative">
              <span className="text-2xl">{skill.icon || '🔧'}</span>
              {skill.isCore && (
                <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-foreground/[0.06]">
                  <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                </div>
              )}
            </div>
            <h2 className="text-[16px] font-medium text-foreground mb-2 text-center">
              {skill.name}
            </h2>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground/80">
                v{skill.version}
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground/80">
                {skill.isCore ? t('detail.coreSystem') : skill.isBundled ? t('detail.bundled') : t('detail.userInstalled')}
              </span>
            </div>

            {skill.description && (
              <p className="text-[12px] text-muted-foreground/80 leading-[1.6] text-center px-4">
                {skill.description}
              </p>
            )}
          </div>

          <div className="space-y-6 px-1">
            {/* API Key Section */}
            {!skill.isCore && (
              <div className="space-y-2">
                <h3 className="text-[11px] text-muted-foreground/50 uppercase tracking-widest font-medium flex items-center gap-2">
                  <Key className="h-3 w-3 text-primary" />
                  API Key
                </h3>
                <input
                  placeholder={t('detail.apiKeyPlaceholder', 'Enter API Key (optional)')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  className={inputCls}
                />
                <p className="text-[10px] text-muted-foreground/40 mt-1">
                  {t('detail.apiKeyDesc', 'The primary API key for this skill. Leave blank if not required or configured elsewhere.')}
                </p>
              </div>
            )}

            {/* Environment Variables Section */}
            {!skill.isCore && (
              <div className="space-y-3">
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-[11px] text-muted-foreground/50 uppercase tracking-widest font-medium">
                    Environment Variables
                    {envVars.length > 0 && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/60">
                        {envVars.length}
                      </span>
                    )}
                  </h3>
                  <button
                    className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors"
                    onClick={handleAddEnv}
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    {t('detail.addVariable', 'Add Variable')}
                  </button>
                </div>

                <div className="space-y-2">
                  {envVars.length === 0 && (
                    <div className="text-[11px] text-muted-foreground/40 italic bg-muted/30 border border-foreground/[0.06] rounded-lg px-3 py-2.5">
                      {t('detail.noEnvVars', 'No environment variables configured.')}
                    </div>
                  )}

                  {envVars.map((env, index) => (
                    <div className="flex items-center gap-2" key={index}>
                      <input
                        value={env.key}
                        onChange={(e) => handleUpdateEnv(index, 'key', e.target.value)}
                        className={cn(inputCls, "flex-1")}
                        placeholder={t('detail.keyPlaceholder', 'Key')}
                      />
                      <input
                        value={env.value}
                        onChange={(e) => handleUpdateEnv(index, 'value', e.target.value)}
                        className={cn(inputCls, "flex-1")}
                        placeholder={t('detail.valuePlaceholder', 'Value')}
                      />
                      <button
                        className="h-8 w-8 flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-400/10 shrink-0 rounded-lg transition-colors"
                        onClick={() => handleRemoveEnv(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* External Links */}
            {skill.slug && !skill.isBundled && !skill.isCore && (
              <div className="flex gap-2 justify-center pt-6">
                <button className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1.5 transition-colors" onClick={handleOpenClawhub}>
                  <Globe className="h-3 w-3" />
                  ClawHub
                </button>
                <button className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1.5 transition-colors" onClick={handleOpenEditor}>
                  <FileCode className="h-3 w-3" />
                  {t('detail.openManual')}
                </button>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-8 pb-4 flex items-center justify-center gap-3 w-full max-w-[340px] mx-auto">
            {!skill.isCore && (
              <button
                onClick={handleSaveConfig}
                className="flex-1 h-9 text-[12px] rounded-lg font-medium bg-primary hover:bg-primary/90 text-white transition-colors disabled:opacity-50"
                disabled={isSaving}
              >
                {isSaving ? t('detail.saving', 'Saving...') : t('detail.saveConfig')}
              </button>
            )}

            {!skill.isCore && (
              <button
                className="flex-1 h-9 text-[12px] rounded-lg font-medium bg-transparent border border-foreground/[0.1] text-muted-foreground hover:text-foreground/80 hover:border-foreground/[0.15] transition-colors"
                onClick={() => {
                  if (!skill.isBundled && onUninstall && skill.slug) {
                    onUninstall(skill.slug);
                    onClose();
                  } else {
                    onToggle(!skill.enabled);
                  }
                }}
              >
                {!skill.isBundled && onUninstall
                  ? t('common:actions.uninstall', 'Uninstall')
                  : (skill.enabled ? t('detail.disabled', 'Disable') : t('detail.enabled', 'Enable'))}
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Skills() {
  const {
    skills,
    loading,
    error,
    fetchSkills,
    enableSkill,
    disableSkill,
    searchResults,
    searchSkills,
    installSkill,
    uninstallSkill,
    searching,
    searchError,
    installing
  } = useSkillsStore();
  const { t } = useTranslation('skills');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketplaceQuery, setMarketplaceQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedSource, setSelectedSource] = useState<'all' | 'built-in' | 'marketplace'>('all');
  const marketplaceDiscoveryAttemptedRef = useRef(false);

  const isGatewayRunning = gatewayStatus.state === 'running';
  const [showGatewayWarning, setShowGatewayWarning] = useState(false);

  // Debounce the gateway warning to avoid flickering during brief restarts (like skill toggles)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isGatewayRunning) {
      // Wait 1.5s before showing the warning
      timer = setTimeout(() => {
        setShowGatewayWarning(true);
      }, 1500);
    } else {
      // Use setTimeout to avoid synchronous setState in effect
      timer = setTimeout(() => {
        setShowGatewayWarning(false);
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [isGatewayRunning]);

  // Fetch skills on mount
  useEffect(() => {
    if (isGatewayRunning) {
      fetchSkills();
    }
  }, [fetchSkills, isGatewayRunning]);

  // Filter skills
  const safeSkills = Array.isArray(skills) ? skills : [];
  const filteredSkills = safeSkills.filter((skill) => {
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesSource = true;
    if (selectedSource === 'built-in') {
      matchesSource = !!skill.isBundled;
    } else if (selectedSource === 'marketplace') {
      matchesSource = !skill.isBundled;
    }

    return matchesSearch && matchesSource;
  }).sort((a, b) => {
    // Enabled skills first
    if (a.enabled && !b.enabled) return -1;
    if (!a.enabled && b.enabled) return 1;
    // Then core/bundled
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    // Finally alphabetical
    return a.name.localeCompare(b.name);
  });

  const sourceStats = {
    all: safeSkills.length,
    builtIn: safeSkills.filter(s => s.isBundled).length,
    marketplace: safeSkills.filter(s => !s.isBundled).length,
  };

  const bulkToggleVisible = useCallback(async (enable: boolean) => {
    const candidates = filteredSkills.filter((skill) => !skill.isCore && skill.enabled !== enable);
    if (candidates.length === 0) {
      toast.info(enable ? t('toast.noBatchEnableTargets') : t('toast.noBatchDisableTargets'));
      return;
    }

    let succeeded = 0;
    for (const skill of candidates) {
      try {
        if (enable) {
          await enableSkill(skill.id);
        } else {
          await disableSkill(skill.id);
        }
        succeeded += 1;
      } catch {
        // Continue to next skill and report final summary.
      }
    }

    trackUiEvent('skills.batch_toggle', { enable, total: candidates.length, succeeded });
    if (succeeded === candidates.length) {
      toast.success(enable ? t('toast.batchEnabled', { count: succeeded }) : t('toast.batchDisabled', { count: succeeded }));
      return;
    }
    toast.warning(t('toast.batchPartial', { success: succeeded, total: candidates.length }));
  }, [disableSkill, enableSkill, filteredSkills, t]);

  // Handle toggle
  const handleToggle = useCallback(async (skillId: string, enable: boolean) => {
    try {
      if (enable) {
        await enableSkill(skillId);
        toast.success(t('toast.enabled'));
      } else {
        await disableSkill(skillId);
        toast.success(t('toast.disabled'));
      }
    } catch (err) {
      toast.error(String(err));
    }
  }, [enableSkill, disableSkill, t]);

  const hasInstalledSkills = safeSkills.some(s => !s.isBundled);

  const handleOpenSkillsFolder = useCallback(async () => {
    try {
      const skillsDir = await invokeIpc<string>('openclaw:getSkillsDir');
      if (!skillsDir) {
        throw new Error('Skills directory not available');
      }
      const result = await invokeIpc<string>('shell:openPath', skillsDir);
      if (result) {
        // shell.openPath returns an error string if the path doesn't exist
        if (result.toLowerCase().includes('no such file') || result.toLowerCase().includes('not found') || result.toLowerCase().includes('failed to open')) {
          toast.error(t('toast.failedFolderNotFound'));
        } else {
          throw new Error(result);
        }
      }
    } catch (err) {
      toast.error(t('toast.failedOpenFolder') + ': ' + String(err));
    }
  }, [t]);

  const [skillsDirPath, setSkillsDirPath] = useState('~/.openclaw/skills');

  useEffect(() => {
    invokeIpc<string>('openclaw:getSkillsDir')
      .then((dir) => setSkillsDirPath(dir as string))
      .catch(console.error);
  }, []);


  // Auto-reset when query is cleared
  useEffect(() => {
    if (activeTab === 'marketplace' && marketplaceQuery === '' && marketplaceDiscoveryAttemptedRef.current) {
      searchSkills('');
    }
  }, [marketplaceQuery, activeTab, searchSkills]);

  // Handle install
  const handleInstall = useCallback(async (slug: string) => {
    try {
      await installSkill(slug);
      // Automatically enable after install
      // We need to find the skill id which is usually the slug
      await enableSkill(slug);
      toast.success(t('toast.installed'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (['installTimeoutError', 'installRateLimitError'].includes(errorMessage)) {
        toast.error(t(`toast.${errorMessage}`, { path: skillsDirPath }), { duration: 10000 });
      } else {
        toast.error(t('toast.failedInstall') + ': ' + errorMessage);
      }
    }
  }, [installSkill, enableSkill, t, skillsDirPath]);

  // Initial marketplace load (Discovery)
  useEffect(() => {
    if (activeTab !== 'marketplace') {
      return;
    }
    if (marketplaceQuery.trim()) {
      return;
    }
    if (searching) {
      return;
    }
    if (marketplaceDiscoveryAttemptedRef.current) {
      return;
    }
    marketplaceDiscoveryAttemptedRef.current = true;
    searchSkills('');
  }, [activeTab, marketplaceQuery, searching, searchSkills]);

  // Handle uninstall
  const handleUninstall = useCallback(async (slug: string) => {
    try {
      await uninstallSkill(slug);
      toast.success(t('toast.uninstalled'));
    } catch (err) {
      toast.error(t('toast.failedUninstall') + ': ' + String(err));
    }
  }, [uninstallSkill, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Gateway Warning */}
      {showGatewayWarning && (
        <div className="mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-500/70" />
          <span className="text-yellow-400/80 text-[12px]">
            {t('gatewayWarning')}
          </span>
        </div>
      )}

      {/* Search bar + pills + actions */}
      <div className="flex items-center gap-2 mb-4">
        <input
          className="flex-1 h-8 rounded-lg bg-muted/40 border border-foreground/[0.06] px-3 text-foreground text-[12px] outline-none transition-colors focus:border-foreground/[0.12] placeholder:text-white/[0.12]"
          placeholder={t('search')}
          value={activeTab === 'marketplace' ? marketplaceQuery : searchQuery}
          onChange={(e) => activeTab === 'marketplace' ? setMarketplaceQuery(e.target.value) : setSearchQuery(e.target.value)}
        />
        {((activeTab === 'marketplace' && marketplaceQuery) || (activeTab === 'all' && searchQuery)) && (
          <button
            type="button"
            onClick={() => activeTab === 'marketplace' ? setMarketplaceQuery('') : setSearchQuery('')}
            className="text-muted-foreground/50 hover:text-muted-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Pill group */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 shrink-0">
          <button
            onClick={() => { setActiveTab('all'); setSelectedSource('all'); }}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-all border-none bg-transparent cursor-pointer",
              activeTab === 'all' && selectedSource === 'all'
                ? "bg-foreground/[0.08] text-foreground/80"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            {t('filter.all', { count: sourceStats.all }).replace(/\s*\(.*\)/, '')} <span className="opacity-40">{sourceStats.all}</span>
          </button>
          <button
            onClick={() => { setActiveTab('all'); setSelectedSource('built-in'); }}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-all border-none bg-transparent cursor-pointer",
              activeTab === 'all' && selectedSource === 'built-in'
                ? "bg-foreground/[0.08] text-foreground/80"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            {t('filter.builtIn', { count: sourceStats.builtIn }).replace(/\s*\(.*\)/, '')} <span className="opacity-40">{sourceStats.builtIn}</span>
          </button>
          <button
            onClick={() => setActiveTab('marketplace')}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-all border-none bg-transparent cursor-pointer",
              activeTab === 'marketplace'
                ? "bg-foreground/[0.08] text-foreground/80"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            {t('tabs.marketplace')} <span className="opacity-40">{sourceStats.marketplace}</span>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {activeTab === 'all' && (
            <>
              <button onClick={() => bulkToggleVisible(true)} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                {t('actions.enableVisible')}
              </button>
              <span className="text-white/[0.1] text-[11px]">|</span>
              <button onClick={() => bulkToggleVisible(false)} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                {t('actions.disableVisible')}
              </button>
            </>
          )}
          {hasInstalledSkills && (
            <button onClick={handleOpenSkillsFolder} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1" title="Open Skills Folder">
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={fetchSkills} disabled={!isGatewayRunning} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-20 ml-0.5" title="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && activeTab === 'all' && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[12px] flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {['fetchTimeoutError', 'fetchRateLimitError', 'timeoutError', 'rateLimitError'].includes(error)
              ? t(`toast.${error}`, { path: skillsDirPath })
              : error}
          </span>
        </div>
      )}

      {/* Content */}
      {activeTab === 'all' && (
        filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
            <Puzzle className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-[12px]">{searchQuery ? t('noSkillsSearch') : t('noSkillsAvailable')}</p>
          </div>
        ) : (
          <div className="max-h-[480px] overflow-y-auto rounded-lg pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1.5">
            {filteredSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-start gap-2.5 py-3 px-3.5 rounded-lg cursor-pointer transition-colors hover:bg-accent"
                onClick={() => setSelectedSkill(skill)}
              >
                {/* Icon */}
                <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center text-[15px] shrink-0">
                  {skill.icon || '🧩'}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-foreground truncate">{skill.name}</span>
                    {skill.isCore && <Lock className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 line-clamp-2 leading-[1.4]">
                    {skill.description}
                  </p>
                </div>
                {/* Toggle */}
                <div className="shrink-0 mt-1" onClick={e => e.stopPropagation()}>
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={(checked) => handleToggle(skill.id, checked)}
                    disabled={skill.isCore}
                  />
                </div>
              </div>
            ))}
          </div>
          </div>
        )
      )}

      {activeTab === 'marketplace' && (
        <div>
          {searchError && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[12px] flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {['searchTimeoutError', 'searchRateLimitError', 'timeoutError', 'rateLimitError'].includes(searchError.replace('Error: ', ''))
                  ? t(`toast.${searchError.replace('Error: ', '')}`, { path: skillsDirPath })
                  : t('marketplace.searchError')}
              </span>
            </div>
          )}

          {activeTab === 'marketplace' && marketplaceQuery && searching && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
              <LoadingSpinner size="lg" />
              <p className="mt-3 text-[12px]">{t('marketplace.searching')}</p>
            </div>
          )}

          {searchResults.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1.5">
              {searchResults.map((skill) => {
                const isInstalled = safeSkills.some(s => s.id === skill.slug || s.name === skill.name);
                const isInstallLoading = !!installing[skill.slug];

                return (
                  <div
                    key={skill.slug}
                    className="flex items-start gap-2.5 py-3 px-3.5 rounded-lg cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => invokeIpc('shell:openExternal', `https://clawhub.ai/s/${skill.slug}`)}
                  >
                    <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center text-[15px] shrink-0">
                      📦
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-foreground truncate">{skill.name}</span>
                        {skill.author && (
                          <span className="text-[10px] text-muted-foreground/40">by {skill.author}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5 line-clamp-2 leading-[1.4]">
                        {skill.description}
                      </p>
                    </div>
                    <div className="shrink-0 mt-1" onClick={e => e.stopPropagation()}>
                      {isInstalled ? (
                        <button
                          onClick={() => handleUninstall(skill.slug)}
                          disabled={isInstallLoading}
                          className="h-6 px-2 rounded text-[10px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30"
                        >
                          {isInstallLoading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleInstall(skill.slug)}
                          disabled={isInstallLoading}
                          className="h-6 px-2.5 rounded-md text-[10px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-30"
                        >
                          {isInstallLoading ? <LoadingSpinner size="sm" /> : t('marketplace.install', 'Install')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            !searching && marketplaceQuery && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
                <Package className="h-8 w-8 mb-3 opacity-40" />
                <p className="text-[12px]">{t('marketplace.noResults')}</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Skill Detail Dialog */}
      <SkillDetailDialog
        skill={selectedSkill}
        isOpen={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onToggle={(enabled) => {
          if (!selectedSkill) return;
          handleToggle(selectedSkill.id, enabled);
          setSelectedSkill({ ...selectedSkill, enabled });
        }}
        onUninstall={handleUninstall}
      />
    </div>
  );
}

export default Skills;
