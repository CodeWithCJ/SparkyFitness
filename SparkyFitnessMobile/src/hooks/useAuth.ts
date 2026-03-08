import { useState, useEffect, useCallback } from 'react';
import { setOnSessionExpired, setOnNoConfigs, suppressSessionExpired } from '../services/api/authService';
import { getActiveServerConfig, clearServerConfigCache } from '../services/storage';

export function useAuth() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [expiredConfigId, setExpiredConfigId] = useState<string | null>(null);

  useEffect(() => {
    setOnSessionExpired((configId) => {
      setExpiredConfigId(configId);
      setShowLoginModal((prev) => {
        if (!prev) {
          clearServerConfigCache();
          suppressSessionExpired(true);
        }
        return true;
      });
    });
    setOnNoConfigs(() => {
      setShowLoginModal(true);
    });
  }, []);

  // Show login if no config exists at all
  useEffect(() => {
    const check = async () => {
      const config = await getActiveServerConfig();
      if (!config) {
        setShowLoginModal(true);
      }
    };
    check();
  }, []);

  const dismissLoginModal = useCallback(() => {
    setShowLoginModal(false);
    setExpiredConfigId(null);
    suppressSessionExpired(false);
  }, []);
  const handleLoginSuccess = useCallback(() => {
    setShowLoginModal(false);
    setExpiredConfigId(null);
    suppressSessionExpired(false);
  }, []);

  return {
    showLoginModal,
    expiredConfigId,
    dismissLoginModal,
    handleLoginSuccess,
  };
}
