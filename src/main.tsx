import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/base.css';
import './styles.css';
import App from './App';

// Offline support + "install as app". Only in production builds, so dev reloads stay fresh.
// Every deploy ships a changed sw.js; when the new worker takes over, reload once so the new
// version shows up without the user having to force-refresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update());
      })
      .catch(() => {}),
  );
}

// The page itself never zooms. iOS ignores maximum-scale=1, and a pinch outside the board (on a
// photo, a panel…) would blow up the whole app and push its bars off screen. The board and the
// photo viewer handle pinches themselves.
const noPageZoom = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', noPageZoom, { passive: false });
document.addEventListener('gesturechange', noPageZoom, { passive: false });
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
