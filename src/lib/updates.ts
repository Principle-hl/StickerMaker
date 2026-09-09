import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Identifies the build this page was served from. */
export const BUILD_ID: string = __BUILD_ID__;

const POLL_MS = 5 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;
const SW_CHECK_MS = 60 * 60 * 1000;

export interface AppUpdate {
  /** True once a newer build is live. */
  available: boolean;
  /** Switch to the new build. Reloads the page; all state is in localStorage. */
  apply: () => void;
}

/**
 * New-build detection with two sources:
 *
 * 1. The service worker (installed app, offline-capable). Workbox notices a new
 *    `sw.js`, installs it in the background and waits; `needRefresh` flips and
 *    `apply` tells it to take over, which reloads the page.
 * 2. `version.json`, emitted at build time next to the bundle and never cached.
 *    Polled every few minutes, on focus and when the network returns. Covers
 *    browsers without a service worker and the window before one is registered.
 *
 * Never fires under the dev server.
 */
export function useAppUpdate(): AppUpdate {
  const [versionChanged, setVersionChanged] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), SW_CHECK_MS);
    },
  });

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!stopped && build && build !== BUILD_ID) setVersionChanged(true);
      } catch {
        // Offline or blocked; try again on the next tick.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    const first = setTimeout(check, FIRST_CHECK_MS);
    const timer = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, []);

  const apply = useCallback(() => {
    if (needRefresh) {
      // Tells the waiting worker to take over; workbox reloads on controllerchange.
      // If that event never comes (page not yet controlled), reload anyway.
      void updateServiceWorker(true);
      setTimeout(() => location.reload(), 1500);
    } else {
      location.reload();
    }
  }, [needRefresh, updateServiceWorker]);

  return { available: needRefresh || versionChanged, apply };
}
