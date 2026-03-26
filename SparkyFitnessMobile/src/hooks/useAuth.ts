import { useState, useEffect, useCallback } from 'react';
import { setOnSessionExpired, setOnNoConfigs, suppressSessionExpired } from '../services/api/authService';
import { getActiveServerConfig, clearServerConfigCache } from '../services/storage';
import type { ServerConfig } from '../services/storage';

export type AuthModalReason = 'session_expired' | 'no_configs' | null;

export function useAuth() {
  const [authModalReason, setAuthModalReason] = useState<AuthModalReason>(null);
  const [expiredConfigId, setExpiredConfigId] = useState<string | null>(null);
  const [switchToApiKeyConfig, setSwitchToApiKeyConfig] = useState<ServerConfig | null>(null);

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
  }, []);

  // Show setup modal if no config exists at all
  useEffect(() => {
    const check = async () => {
      const config = await getActiveServerConfig();
      if (!config) {
        setAuthModalReason('no_configs');
      }
    };
    check();
  }, []);

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
