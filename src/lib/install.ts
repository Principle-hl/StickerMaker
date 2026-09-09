import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPrompt {
  /** True when the browser offers to install the app and it is not already installed. */
  canInstall: boolean;
  prompt: () => void;
}

/**
 * Chromium browsers fire `beforeinstallprompt` when the page qualifies as an
 * installable app; holding on to that event lets a button in the page trigger
 * the install dialog. Safari has no such API (File → Add to Dock), so there the
 * button never appears. Once running as an installed app, it hides itself.
 */
export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;

  const prompt = useCallback(() => {
    if (!deferred) return;
    void deferred.prompt();
    void deferred.userChoice.then(() => setDeferred(null));
  }, [deferred]);

  return { canInstall: !!deferred && !standalone, prompt };
}
