import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FooterActionBar from '../components/FooterActionBar';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import WatchSymbol from '../components/WatchSymbol';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useWatchComplicationList } from '../hooks/useWatchComplicationList';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  ComplicationFileTooLargeError,
  pickComplicationsFile,
  shareComplicationsFile,
} from '../services/watchComplicationFile';
import type { RootStackScreenProps } from '../types/navigation';
import { newUuid } from '../utils/ids';
import {
  COMPLICATION_COLOR_HEX,
  COMPLICATION_FORMAT_LABELS,
  allowedFormats,
  complicationSourceLabel,
  itemsOf,
  moveComplication,
  parseComplicationsImport,
  removeComplication,
  sourceHasProgress,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';

type WatchComplicationsScreenProps = RootStackScreenProps<'WatchComplications'>;

/**
 * Settings → Apple Watch → Complications: the complications the wearer has
 * made. Each can be edited, moved, deleted, and the whole list exported to a
 * file or replaced from one. The watch's picker lists them in this order; the
 * saved list reaches the watch through `useWatchComplicationSync`.
 */
const WatchComplicationsScreen: React.FC<WatchComplicationsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { list, isStarter, commit } = useWatchComplicationList();

  const addComplication = useCallback(
    () => navigation.navigate('WatchComplicationEdit', {}),
    [navigation]
  );

  const confirmDelete = useCallback(
    (definition: WatchComplicationDefinition) => {
      Alert.alert(
        t('watchComplications.deleteTitle', {
          defaultValue: 'Delete complication',
        }),
        t('watchComplications.deleteMessage', {
          defaultValue:
            'Delete {{name}}? A watch face slot that shows it will go blank.',
          name: definition.name,
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('common.delete', { defaultValue: 'Delete' }),
            style: 'destructive',
            onPress: () => commit(removeComplication(list, definition.id)),
          },
        ]
      );
    },
    [commit, list, t]
  );

  const handleExport = useCallback(async () => {
    try {
      await shareComplicationsFile(list);
    } catch {
      Toast.show({
        type: 'error',
        text1: t('watchComplications.exportFailed', {
          defaultValue: 'Could not export your complications',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  }, [list, t]);

  const handleImport = useCallback(async () => {
    let text: string | null;
    try {
      text = await pickComplicationsFile();
    } catch (error) {
      Toast.show({
        type: 'error',
        text1:
          error instanceof ComplicationFileTooLargeError
            ? t('watchComplications.importTooLarge', {
                defaultValue: 'That file is too large',
              })
            : t('watchComplications.importFailed', {
                defaultValue: 'Could not read that file',
              }),
      });
      return;
    }
    if (text === null) return;
    const result = parseComplicationsImport(text, newUuid);
    if (!result || result.complications.length === 0) {
      Toast.show({
        type: 'error',
        text1: t('watchComplications.importInvalid', {
          defaultValue: 'Not a complications file',
        }),
        text2: t('watchComplications.importInvalidSubtitle', {
          defaultValue: 'Choose a file exported from the Complications screen.',
        }),
      });
      return;
    }
    const imported = result.complications;
    const finish = (next: WatchComplicationDefinition[]) => {
      commit(next);
      Toast.show({
        type: 'success',
        text1: t('watchComplications.importDone', {
          defaultValue: 'Imported {{count}} complications',
          count: imported.length,
        }),
        text2:
          result.skipped > 0
            ? t('watchComplications.importSkipped', {
                defaultValue: '{{count}} entries could not be used.',
                count: result.skipped,
              })
            : undefined,
      });
    };
    Alert.alert(
      t('watchComplications.importTitle', {
        defaultValue: 'Import complications',
      }),
      t('watchComplications.importMessage', {
        defaultValue:
          'Found {{count}} complications in the file. Add them to your list, or replace your list with them?',
        count: imported.length,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('watchComplications.importAdd', { defaultValue: 'Add' }),
          onPress: () => finish([...list, ...imported]),
        },
        {
          text: t('watchComplications.importReplace', {
            defaultValue: 'Replace',
          }),
          style: 'destructive',
          onPress: () => finish(imported),
        },
      ]
    );
  }, [commit, list, t]);

  const confirmReset = useCallback(() => {
    Alert.alert(
      t('watchComplications.resetTitle', {
        defaultValue: 'Reset to starters',
      }),
      t('watchComplications.resetMessage', {
        defaultValue:
          'Replace your complications with the starter set? Yours will be lost.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('watchComplications.resetConfirm', { defaultValue: 'Reset' }),
          style: 'destructive',
          onPress: () => commit(null),
        },
      ]
    );
  }, [commit, t]);

  const header = useScreenHeader({
    title: t('watchComplications.title', { defaultValue: 'Complications' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'icon',
        sfSymbol: 'plus',
        ionicon: 'add',
        accessibilityLabel: t('watchComplications.add', {
          defaultValue: 'Add complication',
        }),
        onPress: addComplication,
      },
      {
        kind: 'menu',
        accessibilityLabel: t('watchComplications.menu', {
          defaultValue: 'Complication options',
        }),
        items: [
          {
            label: t('watchComplications.export', { defaultValue: 'Export' }),
            sfSymbol: 'square.and.arrow.up',
            icon: 'share',
            onPress: () => void handleExport(),
          },
          {
            label: t('watchComplications.import', { defaultValue: 'Import' }),
            sfSymbol: 'square.and.arrow.down',
            onPress: () => void handleImport(),
          },
          ...(isStarter
            ? []
            : [
                {
                  label: t('watchComplications.reset', {
                    defaultValue: 'Reset to starters',
                  }),
                  sfSymbol: 'arrow.counterclockwise',
                  onPress: confirmReset,
                },
              ]),
        ],
      },
    ],
  });

  const renderRow = (
    definition: WatchComplicationDefinition,
    index: number
  ) => {
    const color = COMPLICATION_COLOR_HEX[definition.color];
    // Several values are listed by name; one value shows how it is written.
    const items = itemsOf(definition);
    const details =
      items.length > 1
        ? items
            .map((item) => complicationSourceLabel(item.source, t))
            .join(' + ')
        : [
            complicationSourceLabel(definition.source, t),
            COMPLICATION_FORMAT_LABELS[
              allowedFormats(definition.source).includes(definition.format)
                ? definition.format
                : 'value'
            ](t),
            definition.gauge && sourceHasProgress(definition.source)
              ? t('watchComplications.withGauge', { defaultValue: 'Gauge' })
              : null,
          ]
            .filter(Boolean)
            .join(' • ');
    return (
      <View
        key={definition.id}
        testID={`watch-complication-row-${definition.id}`}
        className="bg-surface rounded-xl mb-3 shadow-sm flex-row items-center"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watchComplications.editNamed', {
            defaultValue: 'Edit {{name}}',
            name: definition.name,
          })}
          className="flex-1 flex-row items-center px-4 py-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          onPress={() =>
            navigation.navigate('WatchComplicationEdit', {
              complicationId: definition.id,
            })
          }
        >
          <View
            className="items-center justify-center rounded-full mr-3"
            style={{
              width: 40,
              height: 40,
              backgroundColor: 'rgba(0,0,0,0.85)',
            }}
          >
            <WatchSymbol name={definition.icon} size={20} color={color} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-text-primary">
              {definition.name}
            </Text>
            <Text className="text-sm text-text-secondary mt-0.5">
              {details}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watchComplications.moveUp', {
            defaultValue: 'Move {{name}} up',
            name: definition.name,
          })}
          disabled={index === 0}
          className="p-2"
          style={index === 0 ? { opacity: 0.3 } : null}
          onPress={() => commit(moveComplication(list, definition.id, -1))}
        >
          <Icon name="chevron-up" size={18} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watchComplications.moveDown', {
            defaultValue: 'Move {{name}} down',
            name: definition.name,
          })}
          disabled={index === list.length - 1}
          className="p-2"
          style={index === list.length - 1 ? { opacity: 0.3 } : null}
          onPress={() => commit(moveComplication(list, definition.id, 1))}
        >
          <Icon name="chevron-down" size={18} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watchComplications.deleteNamed', {
            defaultValue: 'Delete {{name}}',
            name: definition.name,
          })}
          className="p-3"
          onPress={() => confirmDelete(definition)}
        >
          <Icon name="trash" size={20} color="#dc2626" />
        </Pressable>
      </View>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 96,
          flexGrow: 1,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('watchComplications.intro', {
            defaultValue:
              'Make your own complications for the watch face. Each one shows a number from your day. On the watch, add the Custom Complication to a slot and pick one of these.',
          })}
        </Text>
        {isStarter && list.length > 0 ? (
          <Text
            testID="watch-complications-starter-note"
            className="text-text-muted text-xs mb-4"
          >
            {t('watchComplications.starterNote', {
              defaultValue:
                'These are the starter complications. Change or add one and the list becomes yours.',
            })}
          </Text>
        ) : null}
        {list.length === 0 ? (
          <StatusView
            inline
            icon="watch-settings"
            title={t('watchComplications.emptyTitle', {
              defaultValue: 'No complications yet',
            })}
            subtitle={t('watchComplications.emptySubtitle', {
              defaultValue:
                'Add one such as protein left today, or import a file.',
            })}
          />
        ) : (
          list.map(renderRow)
        )}
      </ScrollView>
      <FooterActionBar>
        <Button onPress={addComplication}>
          {t('watchComplications.add', { defaultValue: 'Add complication' })}
        </Button>
      </FooterActionBar>
    </View>
  );
};

export default WatchComplicationsScreen;
