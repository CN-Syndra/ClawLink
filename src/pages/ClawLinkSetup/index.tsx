/**
 * ClawLink Setup Page
 * Registration/login flow for first-time users
 */
import { useState, useEffect } from 'react';
import { useClawLinkStore } from '@/stores/clawlink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function ClawLinkSetup({ isModal = false }: { isModal?: boolean }) {
  const { t } = useTranslation('clawlink');
  const navigate = useNavigate();
  const {
    register,
    login,
    currentUser,
    serverUrl,
    setServerUrl,
    testConnection,
    wsConnected
  } = useClawLinkStore();

  const [autoConnected, setAutoConnected] = useState(false);

  // Registration form
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // Login form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Tab
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  useEffect(() => {
    if (currentUser) {
      navigate('/messages');
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    const autoConnect = async () => {
      if (autoConnected || wsConnected) return;
      setServerUrl(serverUrl);
      await new Promise(r => setTimeout(r, 300));
      await testConnection();
      setAutoConnected(true);
    };
    const timer = setTimeout(() => { autoConnect(); }, 500);
    return () => clearTimeout(timer);
  }, [serverUrl, setServerUrl, testConnection, wsConnected, autoConnected]);

  const handleRegister = async () => {
    if (!regUsername.trim() || !regDisplayName.trim()) {
      setRegError(t('auth.errors.usernameAndDisplayRequired'));
      return;
    }
    if (regUsername.trim().length < 4 || regUsername.trim().length > 10) {
      setRegError(t('auth.errors.usernameLength'));
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(regUsername.trim())) {
      setRegError(t('auth.errors.usernameAlphanumeric'));
      return;
    }
    if (!regPassword) {
      setRegError(t('auth.errors.passwordRequired'));
      return;
    }
    if (regPassword.length < 6) {
      setRegError(t('auth.errors.passwordMinLength'));
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError(t('auth.errors.passwordMismatch'));
      return;
    }
    setRegLoading(true);
    setRegError('');
    try {
      const success = await register(regUsername, regDisplayName, '', '', regPassword);
      if (success) {
        navigate('/messages');
      } else {
        setRegError(t('auth.errors.registerFailed'));
      }
    } catch {
      setRegError(t('auth.errors.registerServerError'));
    } finally {
      setRegLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError(t('auth.errors.loginRequired'));
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const success = await login(loginUsername, loginPassword);
      if (success) {
        navigate('/messages');
      } else {
        setLoginError(t('auth.errors.loginFailed'));
      }
    } catch {
      setLoginError(t('auth.errors.loginServerError'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotError(t('auth.errors.emailRequired'));
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');
    try {
      const res = await fetch(`${serverUrl}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          forgotEmail.includes('@')
            ? { email: forgotEmail.trim() }
            : { username: forgotEmail.trim() }
        ),
      });
      const data = await res.json();
      if (data.success) {
        setForgotMessage(t('auth.forgotSent'));
      } else {
        setForgotMessage(t('auth.forgotSent'));
      }
    } catch {
      setForgotError(t('auth.errors.forgotFailed'));
    } finally {
      setForgotLoading(false);
    }
  };

  if (currentUser) return null;

  // Shared input styles
  const inputClass = "h-9 bg-input border-border placeholder:text-muted-foreground text-foreground focus-visible:ring-1 focus-visible:ring-ring rounded-lg";

  return (
    <div className={cn(
      "flex items-center justify-center",
      // In modal mode, stay transparent to blend with backdrop blur
      isModal ? "w-full h-full" : "min-h-screen bg-background"
    )}>
      <div className="w-full max-w-[360px]">
        {/* Brand header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">ClawLink</h1>
          <p className="text-xs text-muted-foreground mt-1">{t('auth.subtitle')}</p>
        </div>

        {/* Form container */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          {/* Tab switcher */}
          {activeTab !== 'forgot' && (
          <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5">
            <button
              onClick={() => setActiveTab('login')}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                activeTab === 'login'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('auth.login')}
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                activeTab === 'register'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('auth.register')}
            </button>
          </div>
          )}

          {/* Forgot password form */}
          {activeTab === 'forgot' && (
            <div className="space-y-3.5">
              <div className="text-center mb-2">
                <h3 className="text-[15px] font-semibold text-foreground">{t('auth.forgotTitle')}</h3>
                <p className="text-[12px] text-muted-foreground mt-1">{t('auth.forgotDesc')}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-normal">{t('auth.emailOrUsername')}</Label>
                <Input
                  type="text"
                  placeholder={t('auth.emailOrUsernamePlaceholder')}
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                  className={inputClass}
                />
              </div>

              {forgotError && (
                <div className="text-xs text-red-400/90 bg-red-500/10 border border-red-500/10 px-3 py-2 rounded-lg">{forgotError}</div>
              )}
              {forgotMessage && (
                <div className="text-xs text-green-500/90 bg-green-500/10 border border-green-500/10 px-3 py-2 rounded-lg">{forgotMessage}</div>
              )}

              <Button
                className="w-full h-9 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium mt-1"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('auth.sendResetLink')
                )}
              </Button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('login')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </div>
          )}

          {/* Login form */}
          {activeTab === 'login' && (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-normal">{t('auth.username')}</Label>
                <Input
                  placeholder={t('auth.usernamePlaceholder')}
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-normal">{t('auth.password')}</Label>
                <div className="relative">
                  <Input
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder={t('auth.passwordPlaceholder')}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className={cn(inputClass, "pr-9")}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="text-xs text-red-400/90 bg-red-500/10 border border-red-500/10 px-3 py-2 rounded-lg">{loginError}</div>
              )}

              <Button
                className="w-full h-9 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium mt-1"
                onClick={handleLogin}
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>{t('auth.login')}<ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>
                )}
              </Button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => { setActiveTab('forgot'); setForgotError(''); setForgotMessage(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>
            </div>
          )}

          {/* Registration form */}
          {activeTab === 'register' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-normal">{t('auth.username')} {t('auth.required')}</Label>
                  <Input
                    placeholder={t('auth.usernameRegPlaceholder')}
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    maxLength={10}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-normal">{t('auth.displayName')} {t('auth.required')}</Label>
                  <Input
                    placeholder={t('auth.displayNamePlaceholder')}
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-normal">{t('auth.password')} {t('auth.required')}</Label>
                <div className="relative">
                  <Input
                    type={showRegPassword ? 'text' : 'password'}
                    placeholder={t('auth.passwordRegPlaceholder')}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className={cn(inputClass, "pr-9")}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                  >
                    {showRegPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-normal">{t('auth.confirmPassword')} {t('auth.required')}</Label>
                <Input
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              {regError && (
                <div className="text-xs text-red-400/90 bg-red-500/10 border border-red-500/10 px-3 py-2 rounded-lg">{regError}</div>
              )}

              <Button
                className="w-full h-9 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium mt-1"
                onClick={handleRegister}
                disabled={regLoading}
              >
                {regLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>{t('auth.createAccount')}<ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
