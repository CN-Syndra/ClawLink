/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { MainLayout } from './components/layout/MainLayout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { Messages } from './pages/Messages';
import { Community } from './pages/Community';
import { HotTopics } from './pages/HotTopics';
import { TaskResults } from './pages/TaskResults';
import { ClawLinkSetup } from './pages/ClawLinkSetup';
import { useSettingsStore } from './stores/settings';
import { useGatewayStore } from './stores/gateway';
import { useClawLinkStore } from './stores/clawlink';
import { applyGatewayTransportPreference } from './lib/api-client';


/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#f87171',
          background: '#0f172a',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#1e293b',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const initSettings = useSettingsStore((state) => state.init);
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const initGateway = useGatewayStore((state) => state.init);
  const clawLinkCurrentUser = useClawLinkStore((state) => state.currentUser);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  // Sync i18n language with persisted settings on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);

  // Redirect to setup wizard if not complete
  useEffect(() => {
    if (!setupComplete && !location.pathname.startsWith('/setup')) {
      navigate('/setup');
    }
  }, [setupComplete, location.pathname, navigate]);

  // Listen for navigation events from main process
  useEffect(() => {
    const handleNavigate = (...args: unknown[]) => {
      const path = args[0];
      if (typeof path === 'string') {
        navigate(path);
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on('navigate', handleNavigate);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);

  // Apply theme (light mode uses CSS class swap, not filter invert)
  const theme = useSettingsStore((s) => s.theme);
  const fontScale = useSettingsStore((s) => s.fontScale);
  useEffect(() => {
    const html = window.document.documentElement;

    const resolvedLight = theme === 'system'
      ? !window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'light';

    // Clean up legacy filter-invert artifacts
    document.getElementById('__clawlink-light-mode')?.remove();
    document.getElementById('__clawlink-emoji-fix')?.remove();
    document.getElementById('__clawlink-light-boost')?.remove();
    document.body.style.filter = '';
    html.style.background = '';
    document.querySelectorAll('[style*="invert"]').forEach(el => {
      (el as HTMLElement).style.filter = '';
    });

    const applyLight = (light: boolean) => {
      html.classList.remove('light', 'dark');
      html.classList.add(light ? 'light' : 'dark');
    };

    applyLight(resolvedLight);

    if (theme === 'system') {
      const listener = (e: MediaQueryListEvent) => applyLight(!e.matches);
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (fontScale !== 1) {
      root.style.zoom = `${fontScale}`;
      root.style.setProperty('--app-h', `calc(100vh / ${fontScale})`);
    } else {
      root.style.zoom = '';
      root.style.setProperty('--app-h', '100vh');
    }
  }, [fontScale]);

  useEffect(() => {
    applyGatewayTransportPreference();
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Routes>
          {/* Setup wizard (shown on first launch) */}
          <Route path="/setup/*" element={<Setup />} />

          {/* ClawLink Setup - only render when not on setup route */}
          <Route path="/clawlink-setup" element={
            !clawLinkCurrentUser ? <ClawLinkSetup isModal={false} /> : <Navigate to="/messages" replace />
          } />

          {/* Main application routes */}
          <Route element={<MainLayout />}>
            {/* Redirect root to messages */}
            <Route path="/" element={<Navigate to="/messages" replace />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/tasks" element={<TaskResults />} />
            <Route path="/community" element={<Community />} />
            <Route path="/hot-topics" element={<HotTopics />} />
            <Route path="/settings/*" element={<Settings />} />
          </Route>
        </Routes>

        {/* ClawLink blur overlay - shown when not logged in and not on setup routes */}
        {!clawLinkCurrentUser && !location.pathname.startsWith('/setup') && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
            <ClawLinkSetup isModal={true} />
          </div>
        )}

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          style={{ zIndex: 99999 }}
        />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
