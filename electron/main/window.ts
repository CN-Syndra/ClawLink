/**
 * Window Management Utilities
 * Handles window state persistence and multi-window management
 */
import { BrowserWindow, screen } from 'electron';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Lazy-load electron-store (ESM module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let windowStateStore: any = null;

async function getStore() {
  if (!windowStateStore) {
    const Store = (await import('electron-store')).default;
    windowStateStore = new Store<{ windowState: WindowState }>({
      name: 'window-state',
      defaults: {
        windowState: {
          width: 1280,
          height: 800,
          isMaximized: false,
        },
      },
    });
  }
  return windowStateStore;
}

/**
 * Get saved window state with bounds validation
 */
export async function getWindowState(): Promise<WindowState> {
  const store = await getStore();
  const state = store.get('windowState');
  
  // Validate that the window is visible on a screen
  if (state.x !== undefined && state.y !== undefined) {
    const displays = screen.getAllDisplays();
    const isVisible = displays.some((display) => {
      const { x, y, width, height } = display.bounds;
      return (
        state.x! >= x &&
        state.x! < x + width &&
        state.y! >= y &&
        state.y! < y + height
      );
    });
    
    if (!isVisible) {
      // Reset position if not visible
      delete state.x;
      delete state.y;
    }
  }
  
  return state;
}

/**
 * Save window state
 */
export async function saveWindowState(win: BrowserWindow): Promise<void> {
  const store = await getStore();
  const isMaximized = win.isMaximized();
  
  if (!isMaximized) {
    const bounds = win.getBounds();
    store.set('windowState', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  } else {
    store.set('windowState.isMaximized', true);
  }
}

/**
 * Track window state changes
 */
export function trackWindowState(win: BrowserWindow): void {
  // Save state on window events
  ['resize', 'move', 'close'].forEach((event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    win.on(event as any, () => saveWindowState(win));
  });
}
