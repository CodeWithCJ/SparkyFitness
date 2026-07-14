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
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
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

import type { RootStackScreenProps } from '../types/navigation';

type PasskeySettingsScreenProps = RootStackScreenProps<'PasskeySettings'>;

const passkeyAuthMethods =
  Platform.OS === 'ios'
    ? 'Face ID, Touch ID, or your device PIN'
    : 'your fingerprint, face unlock, or device PIN';
const passkeyNameExample = Platform.OS === 'ios' ? 'My iPhone' : 'My Android Phone';

const PasskeySettingsScreen: React.FC<PasskeySettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const [
    accentPrimary,
    textMuted,
  ] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

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
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: `Failed to load passkeys: ${msg}`,
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
      text1: 'Success',
      text2: 'Passkey registered successfully!',
    });
    setNewPasskeyName('');
    await fetchList();
  };

  const reportAddError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('cancelled') || msg.includes('cancel')) {
      Toast.show({
        type: 'info',
        text1: 'Cancelled',
        text2: 'Passkey registration was cancelled.',
      });
    } else {
      Alert.alert('Registration Failed', msg);
    }
  };

  const handleAddPasskey = async () => {
    if (!activeConfig || !activeConfig.sessionToken) return;
    const name = newPasskeyName.trim();
    if (!name) {
      Alert.alert('Required', 'Please enter a name for this passkey.');
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
        throw new Error('No active session. Please sign in again.');
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
      'Delete Passkey',
      `Are you sure you want to delete "${name || 'Unnamed Passkey'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!activeConfig || !activeConfig.sessionToken) return;
            setActionLoading(true);
            try {
              await deletePasskey(activeConfig.url, activeConfig.sessionToken, id);
              Toast.show({
                type: 'success',
                text1: 'Deleted',
                text2: 'Passkey was removed.',
              });
              await fetchList();
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              Alert.alert('Error', `Failed to delete passkey: ${msg}`);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: 'Passkeys',
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
              Passkeys are only supported on servers using session-based authentication.
            </Text>
            <Text className="text-sm text-text-muted text-center mt-2">
              If you connect via an API Key, passkeys cannot be used.
            </Text>
          </View>
        ) : (
          <>
            <View className="mb-4">
              <Text
                className="text-base font-semibold text-text-primary"
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {activeConfig?.url}
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
                  No Passkeys Registered
                </Text>
                <Text className="text-sm text-text-muted text-center mt-2">
                  Add this device or biometric credentials to sign in quickly next time.
                </Text>
              </View>
            ) : (
              <SettingsRowGroup>
                {passkeys.map((passkey) => (
                  <SettingsRow
                    key={passkey.id}
                    icon="fingerprint"
                    iconColor={accentPrimary}
                    title={passkey.name || 'Unnamed Passkey'}
                    subtitle={`Registered ${new Date(passkey.createdAt).toLocaleDateString()}`}
                    rightAccessory={
                      <TouchableOpacity
                        onPress={() => handleDeletePasskey(passkey.id, passkey.name)}
                        disabled={actionLoading}
                        accessibilityLabel="Delete passkey"
                        className="p-2"
                      >
                        <Icon name="remove-circle" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    }
                  />
                ))}
              </SettingsRowGroup>
            )}

            <Button
              variant="primary"
              disabled={loading || actionLoading}
              onPress={() => {
                setNewPasskeyName('');
                setModalVisible(true);
              }}
              className="w-full flex-row items-center justify-center"
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              ) : (
                <View style={{ marginRight: 8 }}>
                  <Icon name="fingerprint" size={20} color="#fff" />
                </View>
              )}
              <Text className="text-base font-semibold text-white">
                Add Passkey
              </Text>
            </Button>

            <Text className="text-xs text-text-muted mt-4">
              Passkeys allow you to sign in securely using {passkeyAuthMethods} without entering your password.
            </Text>
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
                Register Passkey
              </Text>
              <Text className="text-sm text-text-secondary mb-4">
                Give this passkey a friendly name to identify it later (e.g. {passkeyNameExample}).
              </Text>

              <FormInput
                placeholder={`e.g. ${passkeyNameExample}`}
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
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onPress={handleAddPasskey}
                  className="flex-1 py-2.5"
                  style={{ backgroundColor: accentPrimary }}
                >
                  Continue
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
