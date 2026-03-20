import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGatewayStore } from '@/stores/gateway';
import { hostApiFetch } from '@/lib/host-api';
import { trackUiEvent } from '@/lib/telemetry';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { FeedbackState } from '@/components/common/FeedbackState';
import { cn } from '@/lib/utils';

type UsageHistoryEntry = {
  timestamp: string;
  sessionId: string;
  agentId: string;
  model?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd?: number;
};

type UsageWindow = '7d' | '30d' | 'all';

// ── Helpers ──

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

function formatCountFull(value: number): string {
  return Intl.NumberFormat().format(value);
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
}

function filterByWindow(entries: UsageHistoryEntry[], window: UsageWindow): UsageHistoryEntry[] {
  if (window === 'all') return entries;
  const cutoff = Date.now() - (window === '7d' ? 7 : 30) * 86_400_000;
  return entries.filter((e) => { const ts = Date.parse(e.timestamp); return Number.isFinite(ts) && ts >= cutoff; });
}

// ── Donut chart (SVG) ──

function DonutChart({ input, output, cache, total }: { input: number; output: number; cache: number; total: number }) {
  const r = 46;
  const C = 2 * Math.PI * r;
  const safe = Math.max(total, 1);
  const gap = total === 0 ? 0 : 10;
  const segments = [
    { value: input, color: 'rgba(56,189,248,0.75)' },
    { value: output, color: 'rgba(139,92,246,0.75)' },
    { value: cache, color: 'rgba(245,158,11,0.6)' },
  ].filter(s => s.value > 0);
  const totalGap = gap * segments.length;
  const usable = C - totalGap;

  let cursor = 0;
  const arcs = segments.map(s => {
    const len = Math.max((s.value / safe) * usable, 4);
    const offset = cursor;
    cursor += len + gap;
    return { ...s, len, offset };
  });

  return (
    <div className="relative w-[120px] h-[120px]">
      <svg viewBox="0 0 120 120" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="10" />
        {arcs.map((arc, i) => (
          <circle key={i} cx="60" cy="60" r={r} fill="none"
            stroke={arc.color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${arc.len} ${C - arc.len}`}
            strokeDashoffset={-arc.offset} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[16px] font-semibold text-foreground tracking-tight">{formatCount(total)}</div>
        <div className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">tokens</div>
      </div>
    </div>
  );
}

// ── Pill button ──

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("px-2.5 py-1 rounded-md text-[11px] transition-colors",
        active ? "bg-foreground/[0.08] text-foreground/80" : "text-muted-foreground/60 hover:text-muted-foreground")}>
      {children}
    </button>
  );
}

// ── Main component ──

export function Models() {
  const { t } = useTranslation(['dashboard', 'settings']);
  const { t: tcl } = useTranslation('clawlink');
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isRunning = gatewayStatus.state === 'running';

  const [history, setHistory] = useState<UsageHistoryEntry[]>([]);
  const [window, setWindow] = useState<UsageWindow>('7d');
  const [page, setPage] = useState(1);

  useEffect(() => { trackUiEvent('models.page_viewed'); }, []);

  useEffect(() => {
    if (isRunning) {
      hostApiFetch<UsageHistoryEntry[]>('/api/usage/recent-token-history')
        .then((e) => { setHistory(Array.isArray(e) ? e : []); setPage(1); })
        .catch(() => setHistory([]));
    }
  }, [isRunning]);

  const visible = isRunning ? history : [];
  const filtered = filterByWindow(visible, window);
  const loading = isRunning && visible.length === 0;

  // Aggregate totals for donut
  const totals = useMemo(() => {
    let input = 0, output = 0, cache = 0;
    for (const e of filtered) { input += e.inputTokens; output += e.outputTokens; cache += e.cacheReadTokens + e.cacheWriteTokens; }
    return { input, output, cache, total: input + output + cache };
  }, [filtered]);

  // Pagination
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-10">
      {/* AI Providers */}
      <ProvidersSettings />

      {/* Token Usage - Donut + Records panel */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground/60 rounded-xl border border-foreground/[0.06] border-dashed">
            <FeedbackState state="loading" title={t('dashboard:recentTokenHistory.loading')} />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground/60 rounded-xl border border-foreground/[0.06] border-dashed">
            <FeedbackState state="empty" title={t('dashboard:recentTokenHistory.empty')} />
          </div>
        ) : (
          <div className="rounded-xl bg-muted/30 border border-foreground/[0.06] overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/[0.06]">
              <span className="text-[11px] text-muted-foreground/50 uppercase tracking-widest">{tcl('settings.usageStats')}</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40">
                <Pill active={window === '7d'} onClick={() => { setWindow('7d'); setPage(1); }}>{tcl('settings.days7')}</Pill>
                <Pill active={window === '30d'} onClick={() => { setWindow('30d'); setPage(1); }}>{tcl('settings.days30')}</Pill>
                <Pill active={window === 'all'} onClick={() => { setWindow('all'); setPage(1); }}>{tcl('settings.all')}</Pill>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground/50 text-[12px]">
                {t('dashboard:recentTokenHistory.emptyForWindow')}
              </div>
            ) : (
              <div className="flex min-h-[240px]">
                {/* Left: Donut */}
                <div className="w-[200px] shrink-0 flex flex-col items-center justify-center px-4 py-4 border-r border-foreground/[0.06]">
                  <DonutChart input={totals.input} output={totals.output} cache={totals.cache} total={totals.total} />

                  <div className="flex flex-col gap-1.5 mt-5 w-full px-2">
                    {([
                      ['Input', totals.input, 'bg-sky-400/70'],
                      ['Output', totals.output, 'bg-violet-500/70'],
                      ['Cache', totals.cache, 'bg-amber-500/50'],
                    ] as const).map(([label, val, color]) => (
                      <div key={label} className="flex items-center gap-2 text-[11px]">
                        <span className={cn("w-[6px] h-[6px] rounded-full shrink-0", color)} />
                        <span className="text-muted-foreground/50 flex-1">{label}</span>
                        <span className="text-foreground/70 font-medium tabular-nums">{formatCount(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Records */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Records header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-foreground/[0.06]">
                    <span className="text-[11px] text-muted-foreground/50">{tcl('settings.recentRequests')}</span>
                    <span className="text-[10px] text-muted-foreground/60">{tcl('settings.records', { count: filtered.length })}</span>
                  </div>

                  {/* Record rows */}
                  <div className="flex-1">
                    {paged.map((entry) => (
                      <div key={`${entry.sessionId}-${entry.timestamp}`}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-foreground/[0.03] hover:bg-foreground/[0.02] transition-colors">
                        <div className="min-w-0">
                          <div className="text-[12px] text-foreground/70">{entry.model || 'Unknown'}</div>
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {entry.sessionId?.slice(0, 8)} · {formatTime(entry.timestamp)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[12px] text-foreground/70 font-medium tabular-nums min-w-[48px] text-right">
                            {formatCountFull(entry.totalTokens)}
                          </span>
                          <div className="flex gap-1">
                            <span className="text-[9px] px-1.5 py-px rounded bg-sky-400/[0.12] text-sky-400/80 tabular-nums font-medium">
                              {formatCount(entry.inputTokens)}
                            </span>
                            <span className="text-[9px] px-1.5 py-px rounded bg-violet-500/[0.12] text-violet-400/80 tabular-nums font-medium">
                              {formatCount(entry.outputTokens)}
                            </span>
                            {(entry.cacheReadTokens + entry.cacheWriteTokens) > 0 && (
                              <span className="text-[9px] px-1.5 py-px rounded bg-amber-500/[0.1] text-amber-400/70 tabular-nums font-medium">
                                {formatCount(entry.cacheReadTokens + entry.cacheWriteTokens)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pager */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-foreground/[0.06] mt-auto">
                    <span className="text-[10px] text-muted-foreground/60">{safePage} / {totalPages}</span>
                    <div className="flex gap-0.5">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                        className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 transition-colors">
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                        className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 transition-colors">
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Models;
