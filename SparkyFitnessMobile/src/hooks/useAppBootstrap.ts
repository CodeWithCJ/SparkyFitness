import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { initializeAppLanguage } from '../localization';
import { getActiveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';

export type BootstrapRoute = 'Tabs' | 'Onboarding';

export interface AppBootstrapResult {
  initialRoute: BootstrapRoute | null;
  linkingEnabled: boolean;
  setLinkingEnabled: (value: boolean) => void;
}

export function useAppBootstrap(): AppBootstrapResult {
  const [initialRoute, setInitialRoute] = useState<BootstrapRoute | null>(null);
  const [linkingEnabled, setLinkingEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const determine = async () => {
      try {
        await initializeAppLanguage();
        if (cancelled) return;

        const config = await getActiveServerConfig();
        if (cancelled) return;

        const route: BootstrapRoute = config ? 'Tabs' : 'Onboarding';
        setInitialRoute(route);
        setLinkingEnabled(route === 'Tabs');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to load active server config on startup: ${message}`, 'ERROR');
        setInitialRoute('Onboarding');
      } finally {
        if (cancelled) return;
        await SplashScreen.hideAsync();
      }
    };

    determine();

    return () => {
      cancelled = true;
    };
  }, []);

  return { initialRoute, linkingEnabled, setLinkingEnabled };
}
