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

    const determine = async (): Promise<void> => {
      // Language initialization and route selection are independent failure
      // domains: a broken locale must never change the route, and a missing
      // server config must never block language startup.
      try {
        await initializeAppLanguage();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to initialize app language: ${message}`, 'ERROR');
      }

      if (cancelled) return;

      try {
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
      }

      // Splash hiding is the last step and never rejects `determine`: a failure
      // is logged and must not change the route.
      if (cancelled) return;
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to hide splash screen: ${message}`, 'ERROR');
      }
    };

    // determine() handles every expected failure internally, so the floating
    // promise cannot reject.
    void determine();

    return () => {
      cancelled = true;
    };
  }, []);

  return { initialRoute, linkingEnabled, setLinkingEnabled };
}
