import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import { useSymptomDefinitions } from '../hooks/useSymptoms';
import { BUILT_IN_SYMPTOM_DEFINITIONS } from '@workspace/shared';
import {
  getBuiltInSymptomLabels,
  translateBuiltInSymptomLabel,
} from '../utils/symptomLabels';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ManageSymptoms'>;

export default function ManageSymptomsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const builtInLabels = getBuiltInSymptomLabels(t);
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { definitions } = useSymptomDefinitions();

  const header = useScreenHeader({
    title: t('symptoms.manageTitle', { defaultValue: 'Manage Symptoms' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add-outline',
      onPress: () => navigation.navigate('SymptomDefinitionEditor'),
      accessibilityLabel: t('symptoms.createFirst', {
        defaultValue: '+ Create Custom Symptom',
      }),
      identifier: 'manage-symptoms-add',
    },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      <ScrollView className="flex-1 px-4 py-4 space-y-5">
        {/* Custom Definitions */}
        <View className="space-y-3">
          <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
            {t('symptoms.yourCustomSymptoms', {
              defaultValue: 'Your Custom Symptoms',
            })}
          </Text>

          {definitions.length === 0 ? (
            <View className="bg-surface border border-border rounded-2xl p-6 items-center space-y-2">
              <Text className="text-sm font-semibold text-text-muted text-center">
                {t('symptoms.noCustomSymptoms', {
                  defaultValue: 'No custom symptoms created yet.',
                })}
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('SymptomDefinitionEditor')}
                className="bg-accent-primary/10 border border-accent-primary/20 px-4 py-2 rounded-xl"
              >
                <Text className="text-xs font-semibold text-accent-primary">
                  {t('symptoms.createFirst', {
                    defaultValue: '+ Create Custom Symptom',
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            definitions.map((def) => (
              <TouchableOpacity
                key={def.id}
                onPress={() =>
                  navigation.navigate('SymptomDefinitionEditor', {
                    definitionId: def.id,
                  })
                }
                className="bg-surface border border-border rounded-2xl p-4 flex-row items-center justify-between"
              >
                <View className="space-y-1 flex-1">
                  <View className="flex-row items-center space-x-2">
                    {def.is_pinned && (
                      <Icon name="star" size={14} color="#f59e0b" />
                    )}
                    <Text className="text-base font-bold text-text-primary">
                      {def.name}
                    </Text>
                  </View>
                  <Text className="text-xs text-text-muted">
                    {t('symptoms.template', {
                      defaultValue: 'Template (Pre-configured Sections)',
                    })}
                    : {def.template} ·{' '}
                    {t('symptoms.scaleType', {
                      defaultValue: 'Severity Scale',
                    })}
                    : {def.scale_type}
                    {def.is_episodic
                      ? ` · ${t('symptoms.isEpisodic', { defaultValue: 'Duration-based episodes' })}`
                      : ''}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Built-in Presets */}
        <View className="space-y-3">
          <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
            {t('symptoms.builtInTemplates', {
              defaultValue: 'Standard Templates',
            })}
          </Text>
          <View className="bg-surface border border-border rounded-2xl p-3 space-y-2">
            {BUILT_IN_SYMPTOM_DEFINITIONS.map((builtIn) => (
              <View
                key={builtIn.name}
                className="py-2.5 px-2 border-b border-border/40 last:border-b-0 flex-row justify-between items-center"
              >
                <View>
                  <Text className="text-sm font-semibold text-text-primary">
                    {translateBuiltInSymptomLabel(
                      builtInLabels,
                      builtIn.displayName
                    )}
                  </Text>
                  <Text className="text-xs text-text-muted">
                    {builtIn.category}
                  </Text>
                </View>
                <View className="bg-raised px-2 py-0.5 rounded-md">
                  <Text className="text-[10px] font-semibold text-text-muted uppercase">
                    {t('common.builtIn', { defaultValue: 'Built-in' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="h-16" />
      </ScrollView>
    </View>
  );
}
