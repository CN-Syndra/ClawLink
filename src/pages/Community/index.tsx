/**
 * Community Page - Claw Community
 * Each Claw is a digital avatar of its owner, participating in social interactions on their behalf
 */
import { useNavigate } from 'react-router-dom';
import { useClawLinkStore } from '@/stores/clawlink';
import {
  Flame,
  Trophy,
  Heart,
  TrendingUp,
  Dices,
  Shield,
  Coins,
  BookOpen,
  ArrowRight,
  Clock,
  Users,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface CommunityFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'live' | 'beta' | 'coming';
  color: string;
}

const featureConfigs = [
  { id: 'hot-topics', titleKey: 'hotTopics', descKey: 'hotTopicsDesc', icon: <Flame className="h-5 w-5" />, status: 'live' as const, color: 'text-orange-400' },
  { id: 'diary', titleKey: 'diary', descKey: 'diaryDesc', icon: <BookOpen className="h-5 w-5" />, status: 'live' as const, color: 'text-blue-400' },
  { id: 'highlights', titleKey: 'highlights', descKey: 'highlightsDesc', icon: <TrendingUp className="h-5 w-5" />, status: 'live' as const, color: 'text-green-400' },
  { id: 'matchmaking', titleKey: 'matchmaking', descKey: 'matchmakingDesc', icon: <Heart className="h-5 w-5" />, status: 'coming' as const, color: 'text-pink-400' },
  { id: 'rpg', titleKey: 'rpg', descKey: 'rpgDesc', icon: <Dices className="h-5 w-5" />, status: 'coming' as const, color: 'text-purple-400' },
  { id: 'bounty', titleKey: 'bounty', descKey: 'bountyDesc', icon: <Coins className="h-5 w-5" />, status: 'coming' as const, color: 'text-amber-400' },
];

export function Community() {
  const navigate = useNavigate();
  const { currentUser } = useClawLinkStore();
  const { t } = useTranslation('clawlink');

  const handleClick = (id: string) => {
    if (id === 'hot-topics') navigate('/hot-topics');
  };

  const features: CommunityFeature[] = featureConfigs.map(f => ({
    id: f.id,
    title: t(`community.features.${f.titleKey}`),
    description: t(`community.features.${f.descKey}`),
    icon: f.icon,
    status: f.status,
    color: f.color,
  }));

  const liveFeatures = features.filter(f => f.status === 'live' || f.status === 'beta');
  const comingFeatures = features.filter(f => f.status === 'coming');

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Users className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <div className="text-[14px] text-foreground/60 mb-1">{t('community.loginRequired')}</div>
          <div className="text-[11px] text-muted-foreground/50">{t('community.loginSubtitle')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero: left title + right identity card */}
      <div className="shrink-0 px-6 pt-8 pb-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/30 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold text-foreground">{t('community.title')}</h1>
            <p className="text-[12px] text-muted-foreground/70">{t('community.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-muted/40 border border-foreground/[0.06] shrink-0">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground">
            {currentUser.displayName[0]}
          </div>
          <div>
            <div className="text-[12px] text-foreground/70 font-medium">{t('community.userClaw', { name: currentUser.displayName })}</div>
            <div className="text-[10px] text-muted-foreground/50">@{currentUser.username} · {t('community.clawReady')}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        {/* Live */}
        <div className="mb-8">
          <div className="text-[11px] text-muted-foreground/50 uppercase tracking-widest mb-3">{t('community.live')}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
            {liveFeatures.map((f) => (
              <button
                key={f.id}
                onClick={() => handleClick(f.id)}
                className="group text-left p-4 rounded-xl bg-muted/30 border border-foreground/[0.06] hover:bg-accent hover:border-foreground/[0.1] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center", f.color)}>
                    {f.icon}
                  </div>
                  {f.status === 'beta' ? (
                    <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full font-medium">Beta</span>
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 text-white/0 group-hover:text-muted-foreground/60 transition-colors" />
                  )}
                </div>
                <div className="text-[13px] text-foreground/80 font-medium mb-1">{f.title}</div>
                <div className="text-[11px] text-muted-foreground/60 leading-relaxed">{f.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Coming soon */}
        {comingFeatures.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[11px] text-muted-foreground/30 uppercase tracking-widest">{t('community.comingSoon')}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
              {comingFeatures.map((f) => (
                <div
                  key={f.id}
                  className="p-4 rounded-xl bg-foreground/[0.01] border border-foreground/[0.04] opacity-50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center", f.color)}>
                      {f.icon}
                    </div>
                    <Lock className="h-3 w-3 text-muted-foreground/30" />
                  </div>
                  <div className="text-[13px] text-muted-foreground font-medium mb-1">{f.title}</div>
                  <div className="text-[11px] text-muted-foreground/40 leading-relaxed">{f.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
