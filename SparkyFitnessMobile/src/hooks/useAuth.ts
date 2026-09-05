import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  setOnSessionExpired,
  setOnNoConfigs,
  setOnIdentityChanged,
  suppressSessionExpired,
} from '../services/api/authService';
import { clearServerConfigCache } from '../services/storage';
import type { ServerConfig } from '../services/storage';

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
    setOnIdentityChanged(() => {
      queryClient.clear();
      // expo-image keys on the URI alone, so it ignores the Authorization
      // header that made the request account-specific. Check-in photos and
      // exercise images are served from per-server paths that two accounts can
      // both produce, which is enough for the previous account's picture to be
      // painted for the new one. Fire and forget: nothing waits on the result,
      // and a rejection here must not take down the sign-in that caused it.
      void Image.clearMemoryCache().catch(() => {});
      void Image.clearDiskCache().catch(() => {});
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
