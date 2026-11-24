import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Global error handlers to capture unexpected runtime issues gracefully
window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver') || event.message?.includes('Script error')) {
    return;
  }
  console.warn('[Runtime Warning]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  // Prevent unhandled promise rejections (like background auth or network glitches) from crashing or throwing noisy error logs
  const reasonMsg = event.reason?.message || String(event.reason || '');
  if (
    event.reason?.name === 'AbortError' ||
    reasonMsg.includes('Failed to fetch') ||
    reasonMsg.includes('WebSocket') ||
    reasonMsg.includes('ws://') ||
    reasonMsg.includes('wss://')
  ) {
    event.preventDefault();
    return;
  }
  console.warn('[Unhandled Rejection caught]', event.reason);
});

// R2 Block 8: build marker — proves the running JS bundle matches the latest
// build. The build_id is injected by Vite (`__APP_VERSION__` in vite.config.ts)
// and changes on every rebuild, so a stale tab caching old chunks is visible
// in console.
declare const __APP_VERSION__: string;
try {
  // eslint-disable-next-line no-console
  console.info('[rr_build]', { build_id: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown' });
} catch { /* ignore */ }

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => { /* silently ignore in restricted iframe/http contexts */ });
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event?.data?.type === 'RR_PUSH_RECEIVED') {
      window.dispatchEvent(new CustomEvent('notifications-refresh'));
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
