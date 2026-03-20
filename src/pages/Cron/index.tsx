/**
 * Cron Page
 * Manage scheduled tasks — dark embedded sub-component
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Clock,
  Play,
  Trash2,
  RefreshCw,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
  Timer,
  History,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCronStore } from '@/stores/cron';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { formatRelativeTime, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CronJob, CronJobCreateInput, ScheduleType } from '@/types/cron';
import { CHANNEL_ICONS, type ChannelType } from '@/types/channel';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// Common cron schedule presets
const schedulePresets: { key: string; value: string; type: ScheduleType }[] = [
  { key: 'everyMinute', value: '* * * * *', type: 'interval' },
  { key: 'every5Min', value: '*/5 * * * *', type: 'interval' },
  { key: 'every15Min', value: '*/15 * * * *', type: 'interval' },
  { key: 'everyHour', value: '0 * * * *', type: 'interval' },
  { key: 'daily9am', value: '0 9 * * *', type: 'daily' },
  { key: 'daily6pm', value: '0 18 * * *', type: 'daily' },
  { key: 'weeklyMon', value: '0 9 * * 1', type: 'weekly' },
  { key: 'monthly1st', value: '0 9 1 * *', type: 'monthly' },
];

// Parse cron schedule to human-readable format
// Handles both plain cron strings and Gateway CronSchedule objects:
//   { kind: "cron", expr: "...", tz?: "..." }
//   { kind: "every", everyMs: number }
//   { kind: "at", at: "..." }
function parseCronSchedule(schedule: unknown, t: TFunction<'cron'>): string {
  // Handle Gateway CronSchedule object format
  if (schedule && typeof schedule === 'object') {
    const s = schedule as { kind?: string; expr?: string; tz?: string; everyMs?: number; at?: string };
    if (s.kind === 'cron' && typeof s.expr === 'string') {
      return parseCronExpr(s.expr, t);
    }
    if (s.kind === 'every' && typeof s.everyMs === 'number') {
      const ms = s.everyMs;
      if (ms < 60_000) return t('schedule.everySeconds', { count: Math.round(ms / 1000) });
      if (ms < 3_600_000) return t('schedule.everyMinutes', { count: Math.round(ms / 60_000) });
      if (ms < 86_400_000) return t('schedule.everyHours', { count: Math.round(ms / 3_600_000) });
      return t('schedule.everyDays', { count: Math.round(ms / 86_400_000) });
    }
    if (s.kind === 'at' && typeof s.at === 'string') {
      try {
        return t('schedule.onceAt', { time: new Date(s.at).toLocaleString() });
      } catch {
        return t('schedule.onceAt', { time: s.at });
      }
    }
    return String(schedule);
  }

  // Handle plain cron string
  if (typeof schedule === 'string') {
    return parseCronExpr(schedule, t);
  }

  return String(schedule ?? t('schedule.unknown'));
}

// Parse a plain cron expression string to human-readable text
function parseCronExpr(cron: string, t: TFunction<'cron'>): string {
  const preset = schedulePresets.find((p) => p.value === cron);
  if (preset) return t(`presets.${preset.key}` as const);

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (minute === '*' && hour === '*') return t('presets.everyMinute');
  if (minute.startsWith('*/')) return t('schedule.everyMinutes', { count: Number(minute.slice(2)) });
  if (hour === '*' && minute === '0') return t('presets.everyHour');
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    return t('schedule.weeklyAt', { day: dayOfWeek, time: `${hour}:${minute.padStart(2, '0')}` });
  }
  if (dayOfMonth !== '*') {
    return t('schedule.monthlyAtDay', { day: dayOfMonth, time: `${hour}:${minute.padStart(2, '0')}` });
  }
  if (hour !== '*') {
    return t('schedule.dailyAt', { time: `${hour}:${minute.padStart(2, '0')}` });
  }

  return cron;
}

function estimateNextRun(scheduleExpr: string): string | null {
  const now = new Date();
  const next = new Date(now.getTime());

  if (scheduleExpr === '* * * * *') {
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === '*/5 * * * *') {
    const delta = 5 - (next.getMinutes() % 5 || 5);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + delta);
    return next.toLocaleString();
  }

  if (scheduleExpr === '*/15 * * * *') {
    const delta = 15 - (next.getMinutes() % 15 || 15);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + delta);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 * * * *') {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 9 * * *' || scheduleExpr === '0 18 * * *') {
    const targetHour = scheduleExpr === '0 9 * * *' ? 9 : 18;
    next.setSeconds(0, 0);
    next.setHours(targetHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 9 * * 1') {
    next.setSeconds(0, 0);
    next.setHours(9, 0, 0, 0);
    const day = next.getDay();
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
    next.setDate(next.getDate() + daysUntilMonday);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 9 1 * *') {
    next.setSeconds(0, 0);
    next.setDate(1);
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toLocaleString();
  }

  return null;
}

// Create/Edit Task Dialog
interface TaskDialogProps {
  job?: CronJob;
  onClose: () => void;
  onSave: (input: CronJobCreateInput) => Promise<void>;
}

function TaskDialog({ job, onClose, onSave }: TaskDialogProps) {
  const { t } = useTranslation('cron');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(job?.name || '');
  const [message, setMessage] = useState(job?.message || '');
  // Extract cron expression string from CronSchedule object or use as-is if string
  const initialSchedule = (() => {
    const s = job?.schedule;
    if (!s) return '0 9 * * *';
    if (typeof s === 'string') return s;
    if (typeof s === 'object' && 'expr' in s && typeof (s as { expr: string }).expr === 'string') {
      return (s as { expr: string }).expr;
    }
    return '0 9 * * *';
  })();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [customSchedule, setCustomSchedule] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const schedulePreview = estimateNextRun(useCustom ? customSchedule : schedule);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('toast.nameRequired'));
      return;
    }
    if (!message.trim()) {
      toast.error(t('toast.messageRequired'));
      return;
    }

    const finalSchedule = useCustom ? customSchedule : schedule;
    if (!finalSchedule.trim()) {
      toast.error(t('toast.scheduleRequired'));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        message: message.trim(),
        schedule: finalSchedule,
        enabled,
      });
      onClose();
      toast.success(job ? t('toast.updated') : t('toast.created'));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full h-8 rounded-lg bg-muted/50 border border-foreground/[0.06] text-foreground/80 placeholder:text-white/[0.12] font-mono text-[11px] px-2.5 outline-none transition-colors focus:border-foreground/[0.15]";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-[14px] font-medium text-foreground">{job ? t('dialog.editTitle') : t('dialog.createTitle')}</h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{t('dialog.description')}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors -mr-1 -mt-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5 px-6 pb-6 overflow-y-auto flex-1">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground/50 uppercase tracking-widest font-medium">{t('dialog.taskName')}</label>
            <input
              placeholder={t('dialog.taskNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground/50 uppercase tracking-widest font-medium">{t('dialog.message')}</label>
            <textarea
              placeholder={t('dialog.messagePlaceholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-muted/50 border border-foreground/[0.06] text-foreground/80 placeholder:text-white/[0.12] font-mono text-[11px] px-2.5 py-2 outline-none transition-colors focus:border-foreground/[0.15] resize-none"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground/50 uppercase tracking-widest font-medium">{t('dialog.schedule')}</label>
            {!useCustom ? (
              <div className="grid grid-cols-2 gap-1.5">
                {schedulePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSchedule(preset.value)}
                    className={cn(
                      "flex items-center gap-2 h-8 px-3 rounded-lg text-[11px] font-medium transition-all",
                      schedule === preset.value
                        ? "bg-primary text-white"
                        : "bg-foreground/[0.02] border border-foreground/[0.06] text-muted-foreground/80 hover:text-foreground/60 hover:bg-accent"
                    )}
                  >
                    <Timer className="h-3 w-3 opacity-60" />
                    {t(`presets.${preset.key}` as const)}
                  </button>
                ))}
              </div>
            ) : (
              <input
                placeholder={t('dialog.cronPlaceholder')}
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                className={inputCls}
              />
            )}
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-muted-foreground/40">
                {schedulePreview ? `${t('card.next')}: ${schedulePreview}` : t('dialog.cronPlaceholder')}
              </p>
              <button
                type="button"
                onClick={() => setUseCustom(!useCustom)}
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {useCustom ? t('dialog.usePresets') : t('dialog.useCustomCron')}
              </button>
            </div>
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between bg-muted/30 border border-foreground/[0.06] p-3 rounded-lg">
            <div>
              <div className="text-[12px] text-foreground/60 font-medium">{t('dialog.enableImmediately')}</div>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {t('dialog.enableImmediatelyDesc')}
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="h-8 px-4 rounded-lg text-[11px] font-medium text-muted-foreground/80 border border-foreground/[0.06] hover:text-foreground/60 hover:border-foreground/[0.1] transition-colors">
              {t('common:actions.cancel', 'Cancel')}
            </button>
            <button onClick={handleSubmit} disabled={saving} className="h-8 px-4 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('common:status.saving', 'Saving...')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  {job ? t('dialog.saveChanges') : t('dialog.createTitle')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Job Card Component
interface CronJobCardProps {
  job: CronJob;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => Promise<void>;
}

function CronJobCard({ job, onToggle, onEdit, onDelete, onTrigger }: CronJobCardProps) {
  const { t } = useTranslation('cron');
  const [triggering, setTriggering] = useState(false);

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTriggering(true);
    try {
      await onTrigger();
      toast.success(t('toast.triggered'));
    } catch (error) {
      console.error('Failed to trigger cron job:', error);
      toast.error(t('toast.failedTrigger', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setTriggering(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      className="group rounded-xl bg-muted/30 border border-foreground/[0.06] p-4 cursor-pointer transition-all hover:bg-accent hover:border-foreground/[0.1]"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-muted/50">
            <Clock className={cn("h-4 w-4", job.enabled ? "text-foreground/60" : "text-muted-foreground/40")} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-medium text-foreground truncate">{job.name}</h3>
              <div
                className={cn("w-1.5 h-1.5 rounded-full shrink-0", job.enabled ? "bg-green-500" : "bg-foreground/20")}
                title={job.enabled ? t('stats.active') : t('stats.paused')}
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
              <Timer className="h-3 w-3" />
              {parseCronSchedule(job.schedule, t)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <Switch
            checked={job.enabled}
            onCheckedChange={onToggle}
          />
        </div>
      </div>

      <div className="pl-11">
        <div className="flex items-start gap-1.5 mb-2">
          <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground/30 shrink-0" />
          <p className="text-[11px] text-muted-foreground/70 line-clamp-2 leading-[1.4]">
            {job.message}
          </p>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/40 mb-2">
          {job.target && (
            <span className="flex items-center gap-1">
              {CHANNEL_ICONS[job.target.channelType as ChannelType]}
              {job.target.channelName}
            </span>
          )}

          {job.lastRun && (
            <span className="flex items-center gap-1">
              <History className="h-3 w-3" />
              {t('card.last')}: {formatRelativeTime(job.lastRun.time)}
              {job.lastRun.success ? (
                <CheckCircle2 className="h-3 w-3 text-green-500/70" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500/70" />
              )}
            </span>
          )}

          {job.nextRun && job.enabled && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {t('card.next')}: {new Date(job.nextRun).toLocaleString()}
            </span>
          )}
        </div>

        {/* Last Run Error */}
        {job.lastRun && !job.lastRun.success && job.lastRun.error && (
          <div className="flex items-start gap-1.5 p-2 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-400/80">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{job.lastRun.error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="h-6 px-2 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent rounded transition-colors flex items-center gap-1 disabled:opacity-30"
          >
            {triggering ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {t('card.runNow')}
          </button>
          <button
            onClick={handleDelete}
            className="h-6 px-2 text-[10px] text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            {t('common:actions.delete', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Cron() {
  const { t } = useTranslation('cron');
  const { jobs, loading, error, fetchJobs, createJob, updateJob, toggleJob, deleteJob, triggerJob } = useCronStore();
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [showDialog, setShowDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | undefined>();
  const [jobToDelete, setJobToDelete] = useState<{ id: string } | null>(null);

  const isGatewayRunning = gatewayStatus.state === 'running';

  // Fetch jobs on mount
  useEffect(() => {
    if (isGatewayRunning) {
      fetchJobs();
    }
  }, [fetchJobs, isGatewayRunning]);

  // Statistics
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const activeJobs = safeJobs.filter((j) => j.enabled);
  const pausedJobs = safeJobs.filter((j) => !j.enabled);


  const handleSave = useCallback(async (input: CronJobCreateInput) => {
    if (editingJob) {
      await updateJob(editingJob.id, input);
    } else {
      await createJob(input);
    }
  }, [editingJob, createJob, updateJob]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      await toggleJob(id, enabled);
      toast.success(enabled ? t('toast.enabled') : t('toast.paused'));
    } catch {
      toast.error(t('toast.failedUpdate'));
    }
  }, [toggleJob, t]);



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
      {!isGatewayRunning && (
        <div className="mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-500/70" />
          <span className="text-yellow-400/80 text-[12px]">
            {t('gatewayWarning')}
          </span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="text-red-400 text-[12px]">
            {error}
          </span>
        </div>
      )}

      {/* Stat boxes: 3 horizontal */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1 bg-muted/30 border border-foreground/[0.06] rounded-lg py-3 px-4 text-center">
          <div className="text-[20px] font-semibold text-foreground">{safeJobs.length}</div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mt-0.5">{t('stats.total')}</div>
        </div>
        <div className="flex-1 bg-muted/30 border border-foreground/[0.06] rounded-lg py-3 px-4 text-center">
          <div className="text-[20px] font-semibold text-foreground">{activeJobs.length}</div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mt-0.5">{t('stats.active')}</div>
        </div>
        <div className="flex-1 bg-muted/30 border border-foreground/[0.06] rounded-lg py-3 px-4 text-center">
          <div className="text-[20px] font-semibold text-foreground">{pausedJobs.length}</div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mt-0.5">{t('stats.paused')}</div>
        </div>
      </div>

      {/* Jobs List or Empty State */}
      {safeJobs.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-[12px] text-muted-foreground/50 mb-1">{t('empty.title')}</p>
          <p className="text-[11px] text-white/[0.12]">{t('empty.description')}</p>
          <button
            onClick={() => {
              setEditingJob(undefined);
              setShowDialog(true);
            }}
            disabled={!isGatewayRunning}
            className="mt-3 h-8 px-4 rounded-lg bg-primary text-white text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {t('empty.create')}
          </button>
        </div>
      ) : (
        <div>
          {/* Header row with actions */}
          <div className="flex items-center justify-end gap-2 mb-3">
            <button
              onClick={fetchJobs}
              disabled={!isGatewayRunning}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors disabled:opacity-20"
            >
              <RefreshCw className="h-3 w-3" />
              {t('refresh')}
            </button>
            <button
              onClick={() => {
                setEditingJob(undefined);
                setShowDialog(true);
              }}
              disabled={!isGatewayRunning}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors disabled:opacity-20"
            >
              <Plus className="h-3 w-3" />
              {t('newTask')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeJobs.map((job) => (
              <CronJobCard
                key={job.id}
                job={job}
                onToggle={(enabled) => handleToggle(job.id, enabled)}
                onEdit={() => {
                  setEditingJob(job);
                  setShowDialog(true);
                }}
                onDelete={() => setJobToDelete({ id: job.id })}
                onTrigger={() => triggerJob(job.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <TaskDialog
          job={editingJob}
          onClose={() => {
            setShowDialog(false);
            setEditingJob(undefined);
          }}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!jobToDelete}
        title={t('common:actions.confirm', 'Confirm')}
        message={t('card.deleteConfirm')}
        confirmLabel={t('common:actions.delete', 'Delete')}
        cancelLabel={t('common:actions.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (jobToDelete) {
            await deleteJob(jobToDelete.id);
            setJobToDelete(null);
            toast.success(t('toast.deleted'));
          }
        }}
        onCancel={() => setJobToDelete(null)}
      />
    </div>
  );
}

export default Cron;
