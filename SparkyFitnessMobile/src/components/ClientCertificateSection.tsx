import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import Icon from './Icon';
import FormInput from './FormInput';
import {
  clientCertificateExpiry,
  discardClientCertificateFile,
  getClientCertificateInfo,
  hasClientCertificateGap,
  importClientCertificate,
  isClientCertificateSupported,
  pickClientCertificateFile,
  refreshClientCertificateHosts,
  removeClientCertificate,
  type ClientCertificateImportError,
  type ClientCertificateInfo,
  type PickedClientCertificateFile,
} from '../services/clientCertificate';
import { addLog } from '../services/LogService';

/**
 * Import, replace or remove the TLS client certificate for a server behind a
 * reverse proxy that requires one (mutual TLS). One certificate for the whole
 * app. Renders nothing in a build without the native module.
 */
const ClientCertificateSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const iconWarning = useCSSVariable('--color-icon-warning') as string;
  const supported = isClientCertificateSupported();
  const [info, setInfo] = useState<ClientCertificateInfo | null>(() =>
    supported ? getClientCertificateInfo() : null
  );
  const [picked, setPicked] = useState<PickedClientCertificateFile | null>(
    null
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientCertificateImportError | null>(null);
  // iPhone only: the app's network session remembers what it answered for the
  // server earlier in this run (no certificate, or the old one) and keeps
  // answering the same until the app is restarted, which creates a new session.
  // Resetting the session does not clear it (checked). Android starts fresh
  // sessions on every change.
  const [restartHint, setRestartHint] = useState(false);

  useEffect(() => {
    if (!supported) return;
    // Saved servers from before this build have never been sent to the
    // native side; without them a stored certificate is offered to no one.
    void refreshClientCertificateHosts();
  }, [supported]);

  // The picked file is a copy of the certificate in the app's cache. It is
  // tracked in a ref as well, because the copy must also be removed when the
  // screen closes mid-import, and state is no longer readable by then.
  const pickedRef = useRef<PickedClientCertificateFile | null>(null);

  const replacePicked = useCallback(
    (next: PickedClientCertificateFile | null, discardPrevious: boolean) => {
      const previous = pickedRef.current;
      if (discardPrevious && previous && previous.uri !== next?.uri) {
        discardClientCertificateFile(previous);
      }
      pickedRef.current = next;
      setPicked(next);
    },
    []
  );

  // iPhone only. A popup as well as the note on the screen, because this is a
  // step the user has to take and a line of text is easy to miss.
  const announceRestartNeeded = (change: 'import' | 'remove') => {
    if (Platform.OS !== 'ios') return;
    setRestartHint(true);
    Alert.alert(
      t('auth.clientCertificate.restartTitle', {
        defaultValue: 'Restart the app',
      }),
      change === 'import'
        ? t('auth.clientCertificate.restartAfterImport', {
            defaultValue:
              'To use the new certificate, fully close the app (swipe it away in the app switcher) and open it again, then connect.',
          })
        : t('auth.clientCertificate.restartAfterRemove', {
            defaultValue:
              'To stop using the old certificate, fully close the app (swipe it away in the app switcher) and open it again.',
          }),
      [{ text: t('common.ok', { defaultValue: 'OK' }) }]
    );
  };

  const cancelImport = useCallback(() => {
    replacePicked(null, true);
    setPassword('');
    setError(null);
  }, [replacePicked]);

  useEffect(
    () => () => {
      if (pickedRef.current) {
        discardClientCertificateFile(pickedRef.current);
        pickedRef.current = null;
      }
    },
    []
  );

  const handlePick = async () => {
    setError(null);
    try {
      const file = await pickClientCertificateFile();
      if (!file) return;
      replacePicked(file, true);
      setPassword('');
    } catch (err) {
      addLog(`[ClientCertificate] File pick failed: ${String(err)}`, 'ERROR');
      setError('invalidFile');
    }
  };

  const handleImport = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    const result = await importClientCertificate(picked, password);
    setBusy(false);
    if (result.ok) {
      setInfo(result.info);
      // The import already removed the cached copy.
      replacePicked(null, false);
      setPassword('');
      announceRestartNeeded('import');
    } else {
      setError(result.error);
    }
  };

  const handleRemove = () => {
    try {
      removeClientCertificate();
    } catch (err) {
      // Show what is really stored rather than assuming it is gone.
      addLog(`[ClientCertificate] Remove failed: ${String(err)}`, 'ERROR');
    }
    const remaining = getClientCertificateInfo();
    setInfo(remaining);
    // Only when it is really gone: a failed removal changed nothing.
    if (remaining == null) announceRestartNeeded('remove');
  };

  if (!supported) return null;

  const errorText: Record<ClientCertificateImportError, string> = {
    wrongPassword: t('auth.clientCertificate.errors.wrongPassword', {
      defaultValue: 'That password does not open this file.',
    }),
    invalidFile: t('auth.clientCertificate.errors.invalidFile', {
      defaultValue:
        'This file could not be read. Check the password, and that it is a .p12 or .pfx file. A file made with a recent OpenSSL may need to be exported again in the legacy format.',
    }),
    noPrivateKey: t('auth.clientCertificate.errors.noPrivateKey', {
      defaultValue:
        'This file has a certificate but no private key. Export it again with the key included.',
    }),
    storage: t('auth.clientCertificate.errors.storage', {
      defaultValue: 'The certificate could not be saved on this device.',
    }),
  };

  const expiry = info ? clientCertificateExpiry(info) : null;
  const expiryDate =
    info?.expiresAt != null
      ? new Date(info.expiresAt).toLocaleDateString(i18n.language, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null;

  return (
    <View className="mt-4">
      <View className="flex-row items-center mb-1">
        <Text className="text-sm font-medium text-text-secondary">
          {t('auth.clientCertificate.title', {
            defaultValue: 'Client certificate',
          })}
        </Text>
        <View className="ml-2 rounded-full bg-raised px-2 py-0.5">
          <Text className="text-xs font-semibold text-text-warning">
            {t('auth.clientCertificate.experimental', {
              defaultValue: 'Experimental',
            })}
          </Text>
        </View>
      </View>
      <Text className="text-xs text-text-warning mb-2">
        {t('auth.clientCertificate.experimentalNote', {
          defaultValue:
            'This feature is new and may not work with every proxy or phone. If something fails, remove the certificate and report the problem.',
        })}
      </Text>

      {info ? (
        <View className="mb-2">
          <Text className="text-sm text-text-primary" numberOfLines={2}>
            {info.subject ||
              t('auth.clientCertificate.installed', {
                defaultValue: 'Certificate installed',
              })}
          </Text>
          {expiryDate && (
            <Text
              className={`text-xs ${
                expiry === 'valid' ? 'text-text-muted' : 'text-text-warning'
              }`}
            >
              {expiry === 'expired'
                ? t('auth.clientCertificate.expired', {
                    defaultValue: 'Expired on {{date}}. Import a new one.',
                    date: expiryDate,
                  })
                : expiry === 'expiring'
                  ? t('auth.clientCertificate.expiresSoon', {
                      defaultValue: 'Expires soon, on {{date}}',
                      date: expiryDate,
                    })
                  : t('auth.clientCertificate.expires', {
                      defaultValue: 'Expires on {{date}}',
                      date: expiryDate,
                    })}
            </Text>
          )}
        </View>
      ) : (
        <Text className="text-xs text-text-muted mb-2">
          {t('auth.clientCertificate.help', {
            defaultValue:
              'Only needed when your reverse proxy requires a client certificate (mutual TLS). It is sent only to your saved servers.',
          })}
        </Text>
      )}

      {restartHint && (
        <View
          accessible
          accessibilityRole="alert"
          className="flex-row items-start gap-2 rounded-lg bg-bg-warning px-3 py-2.5 mb-2"
        >
          <Icon name="warning" size={18} color={iconWarning} />
          <Text className="flex-1 text-sm font-medium text-text-warning">
            {t('auth.clientCertificate.restartHint', {
              defaultValue:
                'Fully close and reopen the app so this applies. Until then the server may still answer as before.',
            })}
          </Text>
        </View>
      )}

      {hasClientCertificateGap() && (
        <Text className="text-xs text-text-warning mb-2">
          {t('auth.clientCertificate.gap', {
            defaultValue:
              'This version of the app cannot use the certificate for every request. Please report this.',
          })}
        </Text>
      )}

      {picked ? (
        <View>
          <Text className="text-xs text-text-muted mb-1.5" numberOfLines={1}>
            {picked.name}
          </Text>
          <FormInput
            className="rounded-lg"
            placeholder={t('auth.clientCertificate.passwordPlaceholder', {
              defaultValue: 'Certificate password',
            })}
            accessibilityLabel={t(
              'auth.clientCertificate.passwordPlaceholder',
              { defaultValue: 'Certificate password' }
            )}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            onSubmitEditing={handleImport}
            style={{ fontSize: 14 }}
          />
          {error && (
            <Text className="text-xs text-text-warning mt-1.5">
              {errorText[error]}
            </Text>
          )}
          <View className="flex-row gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1 py-2.5"
              onPress={handleImport}
              loading={busy}
            >
              {t('auth.clientCertificate.import', {
                defaultValue: 'Import',
              })}
            </Button>
            <Button
              variant="ghost"
              tone="neutral"
              className="flex-1 py-2.5"
              onPress={cancelImport}
              disabled={busy}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </View>
        </View>
      ) : (
        <View>
          {error && (
            <Text className="text-xs text-text-warning mb-1.5">
              {errorText[error]}
            </Text>
          )}
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 py-2.5"
              onPress={handlePick}
            >
              {info
                ? t('auth.clientCertificate.replace', {
                    defaultValue: 'Replace certificate',
                  })
                : t('auth.clientCertificate.choose', {
                    defaultValue: 'Import certificate',
                  })}
            </Button>
            {info && (
              <Button
                variant="destructive"
                className="flex-1 py-2.5"
                onPress={handleRemove}
              >
                {t('auth.clientCertificate.remove', {
                  defaultValue: 'Remove',
                })}
              </Button>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

export default ClientCertificateSection;
