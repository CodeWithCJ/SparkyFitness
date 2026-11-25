import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { ActionTagResponse } from '@workspace/shared';
import StatusView from '../components/StatusView';
import {
  ConfirmAmountPicker,
  type ScanConfirmOptions,
} from '../components/actionTags';
import { useServerConnection } from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { ApiError } from '../services/api/errors';
import { scanActionTag } from '../services/api/actionTagsApi';
import { refreshAfterTagAction, undoTagAction } from '../services/tagActions';
import type { RootStackScreenProps } from '../types/navigation';
import { toLocalDateString } from '../utils/dateUtils';

type ActionTagScanScreenProps = RootStackScreenProps<'ActionTagScan'>;

type Phase =
  | { kind: 'running' }
  | { kind: 'confirm'; tag: ActionTagResponse }
  | { kind: 'unknown' }
  | { kind: 'missing'; tag: ActionTagResponse }
  | { kind: 'failed'; serverTooOld: boolean };

const UNDO_VISIBLE_MS = 7000;

const ActionTagScanScreen: React.FC<ActionTagScanScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { code } = route.params;
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const [phase, setPhase] = useState<Phase>({ kind: 'running' });
  const lastTagRef = useRef<ActionTagResponse | null>(null);
  const startedRef = useRef(false);

  const entryDate = useMemo(() => toLocalDateString(new Date()), []);

  const leave = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Tabs', { screen: 'Dashboard' });
    }
  }, [navigation]);

  const run = useCallback(
    async (confirmed: boolean, options?: ScanConfirmOptions) => {
      try {
        const result = await scanActionTag({
          tag_code: code,
          entry_date: entryDate,
          confirmed: confirmed || undefined,
          ...(confirmed && options?.override ? options.override : undefined),
          ...(confirmed && options?.mealTypeId
            ? { meal_type_id: options.mealTypeId }
            : undefined),
          ...(confirmed && options?.entryTime
            ? { entry_time: options.entryTime }
            : undefined),
        });
        switch (result.status) {
          case 'done': {
            const tag = result.tag;
            if (tag) refreshAfterTagAction(queryClient, tag.action, entryDate);
            Toast.show({
              type: 'success',
              text1: t('actionTags.scan.logged', {
                defaultValue: 'Logged {{summary}}',
                summary: result.summary ?? tag?.label ?? '',
              }),
              text2: t('actionTags.scan.tapToUndo', {
                defaultValue: 'Tap to undo',
              }),
              visibilityTime: UNDO_VISIBLE_MS,
              onPress: () => {
                Toast.hide();
                if (!tag) return;
                undoTagAction(tag.action, entryDate, result.logged)
                  .then(() =>
                    refreshAfterTagAction(queryClient, tag.action, entryDate)
                  )
                  .catch(() =>
                    Toast.show({
                      type: 'error',
                      text1: t('actionTags.scan.undoFailed', {
                        defaultValue: 'Could not undo that',
                      }),
                    })
                  );
              },
            });
            leave();
            return;
          }
          case 'too_soon': {
            Toast.show({
              type: 'info',
              text1: t('actionTags.scan.tooSoon', {
                defaultValue: 'Already logged a moment ago',
              }),
            });
            leave();
            return;
          }
          case 'needs_confirmation':
            if (result.tag) {
              lastTagRef.current = result.tag;
              setPhase({ kind: 'confirm', tag: result.tag });
            }
            return;
          case 'target_missing':
            if (result.tag) setPhase({ kind: 'missing', tag: result.tag });
            return;
          case 'unknown_tag':
            setPhase({ kind: 'unknown' });
            return;
        }
      } catch (error) {
        setPhase({
          kind: 'failed',
          serverTooOld: error instanceof ApiError && error.statusCode === 404,
        });
      }
    },
    [code, entryDate, leave, queryClient, t]
  );

  const retry = useCallback(
    (confirmed: boolean, options?: ScanConfirmOptions) => {
      setPhase({ kind: 'running' });
      void run(confirmed, options);
    },
    [run]
  );

  useEffect(() => {
    if (!isConnected || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void run(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isConnected, run]);

  const header = useScreenHeader({
    title: t('actionTags.scan.title', { defaultValue: 'NFC tag' }),
    left: { kind: 'dismiss', onPress: leave, identifier: 'action-tag-close' },
  });

  const content = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          title={t('actionTags.scan.noServer', {
            defaultValue: 'Could not reach your server',
          })}
          subtitle={t('actionTags.scan.noServerSubtitle', {
            defaultValue: 'Check your connection, then tap the tag again.',
          })}
        />
      );
    }
    switch (phase.kind) {
      case 'running':
        return (
          <StatusView
            loading
            title={t('actionTags.scan.running', {
              defaultValue: 'Logging\u2026',
            })}
          />
        );
      case 'confirm': {
        const showPicker = Boolean(
          phase.tag.allow_amount_adjustment || phase.tag.allow_custom_timestamp
        );
        if (showPicker) {
          return (
            <ConfirmAmountPicker
              tag={phase.tag}
              entryDate={entryDate}
              onOpenSettings={() =>
                navigation.navigate('ActionTagForm', { tagId: phase.tag.id })
              }
              onConfirm={(options) => retry(true, options)}
              onCancel={leave}
            />
          );
        }
        return (
          <StatusView
            icon="nfc"
            title={t('actionTags.scan.confirmTitle', {
              defaultValue: 'Log {{label}}?',
              label: phase.tag.label,
            })}
            action={{
              label: t('actionTags.scan.confirmAction', {
                defaultValue: 'Log it',
              }),
              onPress: () => retry(true),
              variant: 'primary',
            }}
          />
        );
      }
      case 'unknown':
        return (
          <StatusView
            icon="nfc"
            iconTone="muted"
            title={t('actionTags.scan.unknownTitle', {
              defaultValue: 'This tag is not set up on your account',
            })}
            subtitle={t('actionTags.scan.unknownSubtitle', {
              defaultValue:
                'Nothing was logged. Set it up to choose what a tap does.',
            })}
            action={{
              label: t('actionTags.scan.setUp', {
                defaultValue: 'Set up this tag',
              }),
              onPress: () =>
                navigation.replace('ActionTagForm', { tagCode: code }),
              variant: 'primary',
            }}
          />
        );
      case 'missing':
        return (
          <StatusView
            icon="alert-circle"
            iconTone="danger"
            title={t('actionTags.scan.missingTitle', {
              defaultValue: 'This tag points to something that was deleted',
            })}
            subtitle={t('actionTags.scan.missingSubtitle', {
              defaultValue:
                'Nothing was logged. Choose what the tag should do.',
            })}
            action={{
              label: t('actionTags.scan.fix', { defaultValue: 'Fix this tag' }),
              onPress: () =>
                navigation.replace('ActionTagForm', { tagId: phase.tag.id }),
              variant: 'primary',
            }}
          />
        );
      case 'failed':
        return (
          <StatusView
            icon="alert-circle"
            iconTone="danger"
            title={
              phase.serverTooOld
                ? t('actionTags.scan.serverTooOld', {
                    defaultValue: 'Your server does not support NFC tags yet',
                  })
                : t('actionTags.scan.failed', {
                    defaultValue: 'Could not log that',
                  })
            }
            subtitle={
              phase.serverTooOld
                ? t('actionTags.scan.serverTooOldSubtitle', {
                    defaultValue:
                      'Update your SparkyFitness server, then try again.',
                  })
                : t('actionTags.scan.failedSubtitle', {
                    defaultValue:
                      'Nothing was logged. Check your connection and try again.',
                  })
            }
            action={
              phase.serverTooOld
                ? undefined
                : {
                    label: t('common.retry', { defaultValue: 'Retry' }),
                    onPress: () => retry(false),
                    variant: 'primary',
                  }
            }
          />
        );
    }
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      {content()}
    </View>
  );
};

export default ActionTagScanScreen;
