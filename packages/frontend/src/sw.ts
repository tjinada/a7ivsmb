/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache the built static assets (JS/CSS/icons/fonts).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Deliberately NO NavigationRoute / index.html fallback.
//
// The app is online-only (Cloudflare tunnel + Access + Unraid all required), so
// a cached navigation shell buys nothing AND actively hides Cloudflare Access
// session expiry: serving index.html from the precache means the browser never
// hits the network, so Access can't 302 us to the email login screen. The PWA
// would boot its own shell, show the app login, and every API call would die at
// the Access gate. Letting navigations reach the network fixes this — Express
// serves the SPA shell via its own '*' fallback (backend app.ts), and Access
// can gate/redirect the request when the session has lapsed.

// Let the update prompt activate a waiting SW immediately.
// No push handlers: this app has no push notifications (per design).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
