import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConfigs } from '../hooks';
import {
  getPasskeys,
  addPasskey,
  deletePasskey,
  LoginError,
  type MobilePasskeyRecord,
} from '../services/api/authService';
import ReauthModal from '../components/ReauthModal';
import { getActiveServerConfig } from '../services/storage';
import { mobileT, MOBILE_LOCALE } from '../localization';
import { addLog } from '../services/LogService';

import type { RootStackScreenProps } from '../types/navigation';

type PasskeySettingsScreenProps = RootStackScreenProps<'PasskeySettings'>;

const PasskeySettingsScreen: React.FC<PasskeySettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const [
    accentPrimary,
    borderSubtle,
    textMuted,
  ] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
    '--color-text-muted',
  ]) as [string, string, string];

  const { activeConfig } = useServerConfigs();

  const [passkeys, setPasskeys] = useState<MobilePasskeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // New Passkey Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [reauthVisible, setReauthVisible] = useState(false);
  const pendingPasskeyName = useRef<string | null>(null);

  const fetchList = React.useCallback(async () => {
    if (!activeConfig || activeConfig.authType !== 'session' || !activeConfig.sessionToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getPasskeys(activeConfig.url, activeConfig.sessionToken);
      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPasskeys(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[PasskeySettings] Failed to load passkeys: ${msg}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: mobileT('passkeys.loadFailed'),
        text2: mobileT('passkeys.tryAgain'),
      });
    } finally {
      setLoading(false);
    }
  }, [activeConfig]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const registerPasskeyWithConfig = async (
    url: string,
    token: string,
    name: string
  ) => {
    await addPasskey(url, token, name);
    Toast.show({
      type: 'success',
      text1: mobileT('passkeys.registered'),
      text2: mobileT('passkeys.registeredDescription'),
    });
    setNewPasskeyName('');
    await fetchList();
  };

  const reportAddError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    addLog(`[PasskeySettings] Failed to register passkey: ${msg}`, 'ERROR');
    if (msg.includes('cancelled') || msg.includes('cancel')) {
      Toast.show({
        type: 'info',
        text1: mobileT('passkeys.cancelled'),
        text2: mobileT('passkeys.cancelledDescription'),
      });
    } else {
      Alert.alert(
        mobileT('passkeys.registrationFailed'),
        mobileT('passkeys.tryAgain'),
      );
    }
  };

  const handleAddPasskey = async () => {
    if (!activeConfig || !activeConfig.sessionToken) return;
    const name = newPasskeyName.trim();
    if (!name) {
      Alert.alert(
        mobileT('passkeys.nameRequiredTitle'),
        mobileT('passkeys.nameRequiredDescription'),
      );
      return;
    }

    setModalVisible(false);
    setActionLoading(true);

    try {
      await registerPasskeyWithConfig(
        activeConfig.url,
        activeConfig.sessionToken,
        name
      );
    } catch (err) {
      // Adding a credential requires a fresh session; on a stale one the server
      // returns SESSION_NOT_FRESH — re-authenticate, then retry once.
      if (err instanceof LoginError && err.message === 'SESSION_NOT_FRESH') {
        pendingPasskeyName.current = name;
        setReauthVisible(true);
        return;
      }
      reportAddError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReauthSuccess = async () => {
    setReauthVisible(false);
    const name = pendingPasskeyName.current;
    pendingPasskeyName.current = null;
    if (!name) return;

    setActionLoading(true);
    try {
      // Re-read the config so we use the freshly-minted session token.
      const fresh = await getActiveServerConfig();
      if (!fresh || !fresh.sessionToken) {
        throw new Error('NO_ACTIVE_SESSION');
      }
      await registerPasskeyWithConfig(fresh.url, fresh.sessionToken, name);
    } catch (err) {
      reportAddError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePasskey = (id: string, name: string | null) => {
    Alert.alert(
      mobileT('passkeys.deleteTitle'),
      mobileT('passkeys.deleteDescription', {
        name: name || mobileT('passkeys.unnamed'),
      }),
      [
        { text: mobileT('common.cancel'), style: 'cancel' },
        {
          text: mobileT('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!activeConfig || !activeConfig.sessionToken) return;
            setActionLoading(true);
            try {
              await deletePasskey(activeConfig.url, activeConfig.sessionToken, id);
              Toast.show({
                type: 'success',
                text1: mobileT('passkeys.deleted'),
                text2: mobileT('passkeys.deletedDescription'),
              });
              await fetchList();
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              addLog(`[PasskeySettings] Failed to delete passkey: ${msg}`, 'ERROR');
              Alert.alert(
                mobileT('passkeys.deleteFailed'),
                mobileT('passkeys.tryAgain'),
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: mobileT('screens.passkeySettings'),
    left: { kind: 'back' },
  });

  const isSessionAuth = activeConfig && activeConfig.authType === 'session';

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {!isSessionAuth ? (
          <View className="bg-surface rounded-xl p-6 items-center shadow-sm border border-border-subtle">
            <Icon name="lock-closed" size={48} color={textMuted} />
            <Text className="text-base text-text-primary text-center mt-4">
              {mobileT('passkeys.sessionOnly')}
            </Text>
            <Text className="text-sm text-text-muted text-center mt-2">
              {mobileT('passkeys.apiKeyUnsupported')}
            </Text>
          </View>
        ) : (
          <>
            <View className="mb-4">
              <Text className="text-sm text-text-secondary mb-2">
                {mobileT('passkeys.server')}{' '}
                <Text style={{ writingDirection: 'ltr' }}>{activeConfig?.url}</Text>
              </Text>
              <Text className="text-xs text-text-muted">
                {mobileT('passkeys.description')}
              </Text>
            </View>

            {loading ? (
              <View className="py-10 items-center justify-center">
                <ActivityIndicator size="large" color={accentPrimary} />
              </View>
            ) : passkeys.length === 0 ? (
              <View className="bg-surface rounded-xl p-6 items-center shadow-sm border border-border-subtle mb-6">
                <View style={{ marginBottom: 12 }}>
                  <Icon name="fingerprint" size={40} color={textMuted} />
                </View>
                <Text className="text-base font-semibold text-text-primary text-center">
                  {mobileT('passkeys.emptyTitle')}
                </Text>
                <Text className="text-sm text-text-muted text-center mt-2">
                  {mobileT('passkeys.emptyDescription')}
                </Text>
              </View>
            ) : (
              <View className="bg-surface rounded-xl shadow-sm border border-border-subtle mb-6 overflow-hidden">
                {passkeys.map((passkey, index) => (
                  <View
                    key={passkey.id}
                    className={`flex-row items-center justify-between p-4 ${
                      index < passkeys.length - 1 ? 'border-b border-border-subtle' : ''
                    }`}
                  >
                    <View className="flex-1 me-4">
                      <Text className="text-base font-semibold text-text-primary">
                        {passkey.name || mobileT('passkeys.unnamed')}
                      </Text>
                      <Text className="text-xs text-text-muted mt-1">
                        {mobileT('passkeys.registeredAt', {
                          date: new Date(passkey.createdAt).toLocaleDateString(
                            `${MOBILE_LOCALE}-u-ca-gregory`,
                            { dateStyle: 'medium' },
                          ),
                        })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeletePasskey(passkey.id, passkey.name)}
                      disabled={actionLoading}
                      accessibilityLabel={mobileT('passkeys.deleteAccessibility', {
                        name: passkey.name || mobileT('passkeys.unnamed'),
                      })}
                      className="p-2"
                    >
                      <Icon name="trash" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Button
              variant="outline"
              disabled={loading || actionLoading}
              onPress={() => {
                setNewPasskeyName('');
                setModalVisible(true);
              }}
              className="w-full flex-row items-center justify-center p-3 rounded-lg border bg-surface"
              style={{
                borderColor: borderSubtle,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={accentPrimary} style={{ marginEnd: 8 }} />
              ) : (
                <View style={{ marginEnd: 8 }}>
                  <Icon name="fingerprint" size={20} color={accentPrimary} />
                </View>
              )}
              <Text className="text-base font-semibold text-text-primary">
                {mobileT('passkeys.add')}
              </Text>
            </Button>
          </>
        )}
      </ScrollView>

      {/* Name Passkey Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            className="flex-1 justify-center items-center p-6"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          >
            <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm border border-border-subtle">
              <Text className="text-[20px] font-bold text-center text-text-primary mb-4">
                {mobileT('passkeys.registerTitle')}
              </Text>
              <Text className="text-sm text-text-secondary mb-4">
                {mobileT('passkeys.registerDescription')}
              </Text>

              <FormInput
                placeholder={mobileT('passkeys.namePlaceholder')}
                value={newPasskeyName}
                onChangeText={setNewPasskeyName}
                autoCapitalize="sentences"
                autoFocus
              />

              <View className="flex-row gap-3 mt-5">
                <Button
                  variant="ghost"
                  onPress={() => setModalVisible(false)}
                  className="flex-1 py-2.5"
                >
                  {mobileT('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleAddPasskey}
                  className="flex-1 py-2.5"
                  style={{ backgroundColor: accentPrimary }}
                >
                  {mobileT('common.continue')}
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ReauthModal
        visible={reauthVisible}
        expiredConfigId={activeConfig?.id ?? null}
        onLoginSuccess={handleReauthSuccess}
        onDismiss={() => {
          pendingPasskeyName.current = null;
          setReauthVisible(false);
        }}
      />
    </View>
  );
};

export default PasskeySettingsScreen;
