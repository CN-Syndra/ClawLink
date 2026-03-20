/**
 * Main Layout Component
 * TitleBar at top, slim LeftDock on left, content fills the rest
 */
import { Outlet } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { LeftDock } from './LeftDock';

export function MainLayout() {
  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: 'var(--app-h, 100vh)' }}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftDock />
        <main className="flex-1 overflow-hidden ml-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
