import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  clearAuthCookies,
  setOnSessionExpired,
  setOnNoConfigs,
  setOnIdentityChanged,
  suppressSessionExpired,
} from '../services/api/authService';
import { clearServerConfigCache } from '../services/storage';
import type { ServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';

export type AuthModalReason = 'session_expired' | 'no_configs' | null;

export function useAuth() {
  const queryClient = useQueryClient();
  const [authModalReason, setAuthModalReason] = useState<AuthModalReason>(null);
  const [expiredConfigId, setExpiredConfigId] = useState<string | null>(null);
  const [switchToApiKeyConfig, setSwitchToApiKeyConfig] =
    useState<ServerConfig | null>(null);

  useEffect(() => {
    setOnSessionExpired((configId) => {
      setSwitchToApiKeyConfig(null);
      setExpiredConfigId(configId);
      setAuthModalReason((prev) => {
        if (!prev) {
          clearServerConfigCache();
          suppressSessionExpired(true);
        }
        return 'session_expired';
      });
    });
    setOnNoConfigs(() => {
      setSwitchToApiKeyConfig(null);
      setAuthModalReason('no_configs');
    });
    // Everything cached under the previous account has to go, or the new one
    // reads it until each query happens to refetch.
    setOnIdentityChanged(async () => {
      queryClient.clear();
      // The cookie jar is the third thing carrying identity, and the only one
      // that survives dropping every cache: it belongs to the native HTTP
      // client and is keyed by host, not by configured server, so two accounts
      // on one server share it. The sign-in paths already clear it for exactly
      // this reason; the identity changes that skip sign-in (switching the
      // active server, deleting it) reach here instead. Left in place, the
      // server resolves the stale cookie ahead of the Bearer token this app
      // sends and answers as the account we just left. Awaited, unlike the
      // image sweep below, because the next request must not overtake it.
      // A failure is reported rather than passed over: it leaves a session
      // cookie that a server which prefers it over the Bearer token would
      // answer from, so the reader needs to know the sweep did not happen.
      if (!(await clearAuthCookies())) {
        addLog(
          'Identity changed but the cookie jar was not cleared; requests may still carry the previous session.',
          'ERROR'
        );
      }
      // The image caches go too, but for data at rest rather than for what the
      // next account can see: every server-backed image URI carries a uuid --
      // `check-in-photos/file/{uuid}` and `/uploads/{domain}/{id}/{uuid}-name`
      // -- so the new account cannot request a path that resolves to the
      // previous one's bytes. What it can do is leave a departed account's
      // progress photos sitting in the app's disk cache indefinitely, which is
      // why this is deliberately not awaited: nothing on screen depends on it,
      // and blocking a sign-in on a disk sweep would buy nothing. A failure is
      // logged rather than swallowed, since it leaves those files behind.
      void Image.clearMemoryCache().catch((err: unknown) => {
        addLog(`Failed to clear the image memory cache: ${err}`, 'WARNING');
      });
      void Image.clearDiskCache().catch((err: unknown) => {
        addLog(`Failed to clear the image disk cache: ${err}`, 'WARNING');
      });
    });
  }, [queryClient]);

  const dismissModal = useCallback(() => {
    setAuthModalReason(null);
    setExpiredConfigId(null);
    setSwitchToApiKeyConfig(null);
    suppressSessionExpired(false);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setAuthModalReason(null);
    setExpiredConfigId(null);
    setSwitchToApiKeyConfig(null);
    suppressSessionExpired(false);
  }, []);

  // Transition from ReauthModal to ServerConfigModal in API key mode.
  // Keeps suppressSessionExpired(true) active so 401s don't re-trigger
  // the reauth modal while the user is entering an API key.
  const handleSwitchToApiKey = useCallback((config: ServerConfig) => {
    setAuthModalReason(null);
    setExpiredConfigId(null);
    setSwitchToApiKeyConfig(config);
  }, []);

  const handleSwitchToApiKeyDone = useCallback(() => {
    setSwitchToApiKeyConfig(null);
    suppressSessionExpired(false);
  }, []);

  return {
    authModalReason,
    showReauthModal: authModalReason === 'session_expired',
    showSetupModal: authModalReason === 'no_configs',
    showApiKeySwitchModal: switchToApiKeyConfig !== null,
    expiredConfigId,
    switchToApiKeyConfig,
    dismissModal,
    handleLoginSuccess,
    handleSwitchToApiKey,
    handleSwitchToApiKeyDone,
  };
}
