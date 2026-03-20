/**
 * Left Dock Component
 * Slim icon dock navigation with gateway status + language + profile
 */
import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  MessageCircle,
  ClipboardCheck,
  Sparkles,
  Settings,
  LogOut,
  RefreshCw,
  Languages,
  User,
  X,
  Save,
  Lock,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useClawLinkStore } from '@/stores/clawlink';
import { fetchWithAuth } from '@/stores/clawlink/auth';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useTranslation } from 'react-i18next';

// ── Profile Modal ──
function ProfileModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('clawlink');
  const { currentUser, currentAgent, serverUrl, token } = useClawLinkStore();
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [agentName, setAgentName] = useState(currentAgent?.name || '');
  const [saving, setSaving] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Email binding
  const [showEmailBind, setShowEmailBind] = useState(false);
  const [bindEmail, setBindEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [emailBinding, setEmailBinding] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [currentEmail, setCurrentEmail] = useState(currentUser?.email || '');

  if (!currentUser) return null;

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!oldPassword) { setPasswordError(t('profile.passwordOldRequired')); return; }
    if (newPassword.length < 6) { setPasswordError(t('auth.errors.passwordMinLength')); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t('auth.errors.passwordMismatch')); return; }
    setPasswordSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${serverUrl}/api/password`, { method: 'PUT', headers, body: JSON.stringify({ oldPassword, newPassword }) });
      const data = await res.json();
      if (data.success) {
        setShowPasswordChange(false);
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
        toast.success(t('profile.passwordChanged'));
      } else {
        setPasswordError(data.error || t('profile.passwordChangeFailed'));
      }
    } catch { setPasswordError(t('profile.passwordChangeFailed')); }
    setPasswordSaving(false);
  };

  const handleSendCode = async () => {
    setEmailError('');
    setEmailSuccess('');
    if (!bindEmail.trim() || !bindEmail.includes('@')) {
      setEmailError(t('profile.codeSendFailed'));
      return;
    }
    setCodeSending(true);
    try {
      const res = await fetchWithAuth(token, `${serverUrl}/api/email/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bindEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCodeSent(true);
        setEmailSuccess(t('profile.codeSent'));
      } else {
        setEmailError(data.error || t('profile.codeSendFailed'));
      }
    } catch {
      setEmailError(t('profile.codeSendFailed'));
    }
    setCodeSending(false);
  };

  const handleBindEmail = async () => {
    setEmailError('');
    setEmailSuccess('');
    if (!bindEmail.trim() || !emailCode.trim()) {
      setEmailError(t('profile.invalidCode'));
      return;
    }
    setEmailBinding(true);
    try {
      const res = await fetchWithAuth(token, `${serverUrl}/api/email/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bindEmail.trim(), code: emailCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentEmail(bindEmail.trim());
        setEmailSuccess(t('profile.emailBound'));
        setShowEmailBind(false);
        setBindEmail('');
        setEmailCode('');
        setCodeSent(false);
        // Update store
        if (currentUser) {
          useClawLinkStore.setState({
            currentUser: { ...currentUser, email: bindEmail.trim() },
          });
        }
      } else {
        setEmailError(data.error || t('profile.emailBindFailed'));
      }
    } catch {
      setEmailError(t('profile.emailBindFailed'));
    }
    setEmailBinding(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Update profile
      await fetch(`${serverUrl}/api/profile`, {
        method: 'PUT', headers,
        body: JSON.stringify({ displayName, bio, avatar: '' }),
      });

      // Update agent name
      if (currentAgent && agentName !== currentAgent.name) {
        await fetch(`${serverUrl}/api/agent/name`, {
          method: 'PUT', headers,
          body: JSON.stringify({ agentId: currentAgent.id, name: agentName }),
        });
      }

      // Update local store
      if (currentUser) {
        useClawLinkStore.setState({
          currentUser: { ...currentUser, displayName, bio },
          ...(currentAgent ? { currentAgent: { ...currentAgent, name: agentName } } : {}),
        });
      }

      onClose();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-foreground/[0.06]">
          <span className="text-[14px] font-medium text-foreground">{t('profile.title')}</span>
          <button onClick={onClose} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground/60 hover:bg-accent transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(128,128,128,0.15) transparent' }}>
          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-[20px] font-bold text-primary-foreground shrink-0">
              {displayName[0] || currentUser.displayName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-foreground">{displayName || currentUser.displayName}</div>
              <div className="text-[12px] text-muted-foreground">@{currentUser.username}</div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-2.5">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">{t('profile.nickname')}</div>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/[0.12] transition-colors"
                placeholder={t('profile.nicknamePlaceholder')} />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">{t('profile.bio')}</div>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/[0.12] transition-colors resize-none"
                placeholder={t('profile.bioPlaceholder')} />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">{t('profile.agentName')} <span className="text-muted-foreground/60">({t('profile.agentNameHint')})</span></div>
              <input value={agentName} onChange={e => setAgentName(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/[0.12] transition-colors"
                placeholder={t('profile.agentNamePlaceholder')} />
            </div>
          </div>

          {/* My Agent preview */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">{t('profile.myAgent')}</div>
            <div className="p-2.5 rounded-lg bg-muted/30 border border-foreground/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm">🦞</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-foreground">{agentName || t('profile.unnamedAgent')}</div>
                  <div className="text-[11px] text-muted-foreground">{bio || currentUser.bio || `@${currentUser.username}`}</div>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              </div>
            </div>
          </div>

          {/* Account & Security */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">{t('profile.accountSecurity', 'Account & Security')}</div>
            <div className="rounded-lg border border-foreground/[0.06] overflow-hidden divide-y divide-foreground/[0.06]">
              {/* Email row */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] text-foreground">{t('profile.email')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentEmail
                      ? <span className="text-[11px] text-muted-foreground">{currentEmail}</span>
                      : <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">⚠ {t('profile.emailWarning')}</span>
                    }
                    <button onClick={() => { setShowEmailBind(!showEmailBind); setEmailError(''); setEmailSuccess(''); }}
                      className="text-[11px] text-primary hover:text-primary/80 transition-colors shrink-0">
                      {currentEmail ? t('profile.changeEmail') : t('profile.bindEmail')}
                    </button>
                  </div>
                </div>
                {showEmailBind && (
                  <div className="mt-2.5 space-y-2 pt-2.5 border-t border-foreground/[0.04]">
                    <div className="flex gap-2">
                      <input type="email" value={bindEmail} onChange={e => setBindEmail(e.target.value)}
                        placeholder={t('profile.newEmailPlaceholder')}
                        className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground/80 placeholder:text-muted-foreground/40 outline-none focus:border-foreground/[0.12] transition-colors" />
                      <button onClick={handleSendCode} disabled={codeSending || !bindEmail.trim()}
                        className="px-3 h-8 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-30 transition-colors whitespace-nowrap">
                        {codeSending ? '...' : codeSent ? t('profile.codeSent') : t('profile.sendCode')}
                      </button>
                    </div>
                    {codeSent && (
                      <div className="flex gap-2">
                        <input type="text" value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                          placeholder={t('profile.codePlaceholder')} maxLength={6}
                          onKeyDown={e => e.key === 'Enter' && handleBindEmail()}
                          className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground/80 placeholder:text-muted-foreground/40 outline-none focus:border-foreground/[0.12] transition-colors" />
                        <button onClick={handleBindEmail} disabled={emailBinding || emailCode.length !== 6}
                          className="px-3 h-8 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-30 transition-colors whitespace-nowrap">
                          {emailBinding ? '...' : t('profile.verifyAndBind')}
                        </button>
                      </div>
                    )}
                    {emailError && <div className="text-[11px] text-destructive">{emailError}</div>}
                    {emailSuccess && <div className="text-[11px] text-green-500">{emailSuccess}</div>}
                  </div>
                )}
              </div>

              {/* Password row */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] text-foreground">{t('profile.changePassword')}</span>
                  </div>
                  <button onClick={() => setShowPasswordChange(!showPasswordChange)}
                    className="text-[11px] text-primary hover:text-primary/80 transition-colors">
                    {showPasswordChange ? t('profile.cancel') : t('profile.confirmChange')}
                  </button>
                </div>
                {showPasswordChange && (
                  <div className="mt-2.5 space-y-2 pt-2.5 border-t border-foreground/[0.04]">
                    <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                      placeholder={t('profile.currentPassword')}
                      className="w-full h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground/80 placeholder:text-muted-foreground/40 outline-none focus:border-foreground/[0.12] transition-colors" />
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      placeholder={t('profile.newPassword')}
                      className="w-full h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground/80 placeholder:text-muted-foreground/40 outline-none focus:border-foreground/[0.12] transition-colors" />
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder={t('profile.confirmNewPassword')}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                      className="w-full h-8 px-3 rounded-lg bg-muted/50 border border-foreground/[0.06] text-[13px] text-foreground/80 placeholder:text-muted-foreground/40 outline-none focus:border-foreground/[0.12] transition-colors" />
                    {passwordError && <div className="text-[11px] text-destructive">{passwordError}</div>}
                    <button onClick={handleChangePassword} disabled={passwordSaving}
                      className="px-3 h-8 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-30 transition-colors">
                      {passwordSaving ? t('profile.saving') : t('profile.confirmChange')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-foreground/[0.06]">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground/80 hover:text-foreground/70 hover:bg-accent transition-colors">{t('profile.cancel')}</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-30 transition-colors flex items-center gap-1.5">
            <Save className="h-3 w-3" />
            {saving ? t('profile.saving') : t('profile.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export function LeftDock() {
  const { t } = useTranslation('clawlink');
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [gatewayMenuOpen, setGatewayMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gatewayMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const { currentUser, logout, hasUnreadTaskResults } = useClawLinkStore();
  const { status: gatewayStatus, restart: restartGateway } = useGatewayStore();
  const { language, setLanguage } = useSettingsStore();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (gatewayMenuRef.current && !gatewayMenuRef.current.contains(e.target as Node)) setGatewayMenuOpen(false);
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeAll = () => { setMenuOpen(false); setGatewayMenuOpen(false); setLangMenuOpen(false); };

  const navItems: Array<{ to: string; icon: typeof MessageCircle; label: string; badge?: boolean | number }> = [
    { to: '/messages', icon: MessageCircle, label: t('nav.messages') },
    { to: '/tasks', icon: ClipboardCheck, label: t('nav.tasks'), badge: hasUnreadTaskResults ? true : undefined },
    { to: '/community', icon: Sparkles, label: t('nav.community') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  const isRunning = gatewayStatus.state === 'running';
  const isError = gatewayStatus.state === 'error';

  return (
    <>
      <div className="fixed left-0 top-[38px] bottom-0 w-16 bg-background border-r border-border z-40 flex flex-col items-center py-3 gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => {
              const active = isActive || (item.to === '/community' && location.pathname === '/hot-topics');
              return cn(
                'relative flex flex-col items-center justify-center w-10 h-10 rounded-[10px] transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted',
                active && 'text-primary bg-primary/10'
              );
            }}
          >
            {({ isActive: rawActive }) => {
              const isActive = rawActive || (item.to === '/community' && location.pathname === '/hot-topics');
              return (<>
                {isActive && <div className="absolute left-[-2px] top-4 bottom-4 w-[3px] rounded-r-sm bg-primary" />}
                <item.icon className={cn("h-[18px] w-[18px]", isActive && "text-primary")} />
                <span className={cn("text-[9px] mt-0.5 font-medium", isActive && "text-primary")}>{item.label}</span>
                {item.badge && typeof item.badge === 'number' ? (
                  <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-medium">{item.badge}</span>
                ) : item.badge && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
                )}
              </>
            );}}
          </NavLink>
        ))}

        <div className="mt-auto flex flex-col items-center gap-1.5 pt-2">
          {/* Gateway */}
          <div ref={gatewayMenuRef} className="relative">
            <button type="button" title={`Gateway: ${gatewayStatus.state}`}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
              onClick={() => { closeAll(); setGatewayMenuOpen(!gatewayMenuOpen); }}>
              <div className={cn("w-2.5 h-2.5 rounded-full transition-colors",
                isRunning ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" :
                isError ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" :
                "bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.5)]"
              )} />
            </button>
            {gatewayMenuOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-44 bg-popover border border-border rounded-xl shadow-lg p-1.5 z-[100]">
                <div className="px-2.5 py-2 border-b border-border mb-1">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", isRunning ? "bg-green-500" : isError ? "bg-red-500" : "bg-yellow-500")} />
                    <span className="text-xs font-medium">{gatewayStatus.state}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Port: {gatewayStatus.port}</div>
                </div>
                <button type="button" className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg hover:bg-muted transition-colors"
                  onClick={() => { restartGateway(); setGatewayMenuOpen(false); }}>
                  <RefreshCw className="h-3.5 w-3.5" />{t('nav.restartGateway')}
                </button>
              </div>
            )}
          </div>

          {/* Language */}
          <div ref={langMenuRef} className="relative">
            <button type="button" title={t('nav.language')}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => { closeAll(); setLangMenuOpen(!langMenuOpen); }}>
              <Languages className="h-[15px] w-[15px]" />
            </button>
            {langMenuOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-36 bg-popover border border-border rounded-xl shadow-lg p-1.5 z-[100]">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button key={lang.code} type="button"
                    className={cn("w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg transition-colors",
                      language === lang.code ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted")}
                    onClick={() => { setLanguage(lang.code); setLangMenuOpen(false); }}>
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div ref={menuRef} className="relative">
            <button type="button"
              className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
              onClick={() => { closeAll(); setMenuOpen(!menuOpen); }}>
              {currentUser ? (
                <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground">{currentUser.displayName[0]}</div>
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center"><Settings className="h-3.5 w-3.5 text-muted-foreground" /></div>
              )}
            </button>
            {menuOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-40 bg-popover border border-border rounded-xl shadow-lg p-1.5 z-[100]">
                {currentUser && (
                  <div className="px-2.5 py-2 border-b border-border mb-1">
                    <div className="font-medium text-xs">{currentUser.displayName}</div>
                    <div className="text-[10px] text-muted-foreground">@{currentUser.username}</div>
                  </div>
                )}
                <button type="button"
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg hover:bg-muted transition-colors text-foreground"
                  onClick={() => { setProfileOpen(true); setMenuOpen(false); }}>
                  <User className="h-3.5 w-3.5" />{t('nav.profileCenter')}
                </button>
                <button type="button"
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  onClick={() => { logout(); setMenuOpen(false); }}>
                  <LogOut className="h-3.5 w-3.5" />{t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}
