import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import StatusView from './StatusView';
import { useServerConnection } from '../hooks';
import type { RootStackParamList } from '../types/navigation';

/**
 * What a screen shows instead of its content while the server is not
 * connected: a spinner during the first check or a retry, "No server
 * configured" when none is set up, and "Can't reach your server" with a retry
 * when one is set up but does not answer (#3385). Screens that wrap their
 * content use `ServerGate`; use this directly only where the screen needs its
 * own layout around the message (such as a header that hides while offline).
 */
export function ServerStatusView() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, isFetching, refetch } = useServerConnection();

  if (status === 'loading' || (status !== 'connected' && isFetching)) {
    return <StatusView loading />;
  }
  if (status === 'connected') return null;

  const goToSettings = {
    label: t('serverStatus.goToSettings', { defaultValue: 'Go to Settings' }),
    onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
  };

  if (status === 'notConfigured') {
    return (
      <StatusView
        icon="cloud-offline"
        iconTone="muted"
        iconSize={64}
        title={t('serverStatus.notConfiguredTitle', {
          defaultValue: 'No server configured',
        })}
        subtitle={t('serverStatus.notConfiguredSubtitle', {
          defaultValue: 'Set up your server connection in Settings.',
        })}
        action={{ ...goToSettings, variant: 'primary' }}
      />
    );
  }

  return (
    <StatusView
      icon="cloud-offline"
      iconTone="muted"
      iconSize={64}
      title={t('serverStatus.unreachableTitle', {
        defaultValue: "Can't reach your server",
      })}
      subtitle={t('serverStatus.unreachableSubtitle', {
        defaultValue: 'Check your connection or try again.',
      })}
      action={{
        label: t('serverStatus.tryAgain', { defaultValue: 'Try again' }),
        // Screen data reloads in queryClient once the check succeeds.
        onPress: () => void refetch(),
        variant: 'primary',
      }}
      secondaryAction={goToSettings}
    />
  );
}

/**
 * Renders `children` only while the server is connected, otherwise the shared
 * server status view. Wrap a screen's content area (below its header) so every
 * screen handles "no server" and "can't reach the server" the same way.
 */
export default function ServerGate({ children }: { children: ReactNode }) {
  const { isConnected } = useServerConnection();
  if (isConnected) return <>{children}</>;
  return <ServerStatusView />;
}
