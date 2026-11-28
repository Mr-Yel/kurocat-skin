import type { KuroCatEngine } from '../catEngine';

type PointerButton = 'left' | 'middle' | 'right';

function pointerButton(button: number): PointerButton | null {
  if (button === 0) return 'left';
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return null;
}

/**
 * Feed the Vite/browser preview with the same cursor and click signals that the
 * Tauri input hooks provide in the desktop app. This intentionally does not
 * install anything when running inside Tauri, so production input remains owned
 * by the native backend.
 */
export function installBrowserInputBridge(engine: KuroCatEngine): void {
  if (typeof window === 'undefined' || '__TAURI_INTERNALS__' in window) return;

  window.addEventListener(
    'pointermove',
    (event) => {
      const relX = event.clientX / Math.max(1, window.innerWidth);
      const relY = event.clientY / Math.max(1, window.innerHeight);
      engine.onGlobalMouseMove(relX, relY);
      engine.onWindowCursor(relX, relY, false);
    },
    { passive: true },
  );

  window.addEventListener(
    'pointerdown',
    (event) => {
      const button = pointerButton(event.button);
      if (button) engine.onMouseDown(button);
    },
    { passive: true },
  );

  window.addEventListener(
    'pointerup',
    (event) => {
      const button = pointerButton(event.button);
      if (button) engine.onMouseUp(button);
    },
    { passive: true },
  );
}
