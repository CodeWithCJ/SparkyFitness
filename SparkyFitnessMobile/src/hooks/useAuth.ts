import { useState, useEffect, useCallback } from 'react';
import { setOnSessionExpired } from '../services/api/authService';
import { getActiveServerConfig, clearServerConfigCache } from '../services/storage';

export function useAuth() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [expiredConfigId, setExpiredConfigId] = useState<string | null>(null);

  useEffect(() => {
    setOnSessionExpired((configId) => {
      setExpiredConfigId(configId);
      setShowLoginModal((prev) => {
        if (!prev) clearServerConfigCache();
        return true;
      });
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
  }, []);
  const handleLoginSuccess = useCallback(() => {
    setShowLoginModal(false);
    setExpiredConfigId(null);
  }, []);

  return {
    showLoginModal,
    expiredConfigId,
    dismissLoginModal,
    handleLoginSuccess,
  };
}
