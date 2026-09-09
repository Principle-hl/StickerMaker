import { useEffect, useState } from 'react';

/** Identifies the build this page was served from. */
export const BUILD_ID: string = __BUILD_ID__;

const POLL_MS = 5 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

/**
 * True once a newer build is live. Polls `version.json` (emitted at build time
 * next to the bundle) every few minutes, when the tab regains focus and when the
 * network comes back. A reload picks up the new build; all state is in
 * localStorage, so nothing is lost. Never fires under the dev server.
 */
export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!stopped && build && build !== BUILD_ID) setAvailable(true);
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

  return available;
}
