import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTitrationSteps } from '../../hooks/useGlp1';

interface Glp1TitrationCardProps {
  medicationId: string;
  onAdd: () => void;
  onEdit: (stepId: string) => void;
}

const Glp1TitrationCard: React.FC<Glp1TitrationCardProps> = ({
  medicationId,
  onAdd,
  onEdit,
}) => {
  const { t } = useTranslation();
  const { data: steps = [] } = useTitrationSteps(medicationId);

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base font-semibold text-text-primary">
          {t('medications.glp1.titration.title', {
            defaultValue: 'Dose titration plan',
          })}
        </Text>
        <TouchableOpacity
          onPress={onAdd}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-accent-primary">
            {t('medications.glp1.titration.add', { defaultValue: 'Add step' })}
          </Text>
        </TouchableOpacity>
      </View>
      {steps.length === 0 ? (
        <Text className="text-sm text-text-muted">
          {t('medications.glp1.titration.empty', {
            defaultValue:
              'No steps yet. Add each planned dose and mark the current one active.',
          })}
        </Text>
      ) : (
        steps.map((step, index) => {
          const statusLabel =
            step.status === 'active'
              ? t('medications.glp1.titration.status.active', {
                  defaultValue: 'Current',
                })
              : step.status === 'done'
                ? t('medications.glp1.titration.status.done', {
                    defaultValue: 'Done',
                  })
                : t('medications.glp1.titration.status.planned', {
                    defaultValue: 'Planned',
                  });
          const parts = [
            step.start_date,
            step.planned_weeks
              ? t('medications.glp1.titration.weeks', {
                  defaultValue: '{{count}} wk',
                  count: step.planned_weeks,
                })
              : null,
            step.is_taper
              ? t('medications.glp1.titration.taper', {
                  defaultValue: 'Taper',
                })
              : null,
          ].filter(Boolean);
          return (
            <View key={step.id}>
              {index > 0 && <View className="h-px bg-chrome-border my-2" />}
              <TouchableOpacity
                onPress={() => onEdit(step.id)}
                activeOpacity={0.6}
                accessibilityRole="button"
                className="flex-row items-center justify-between"
              >
                <View className="flex-1">
                  <Text className="text-base text-text-primary">
                    {step.dose_mg} {step.dose_unit}
                  </Text>
                  {parts.length > 0 && (
                    <Text className="text-xs text-text-muted mt-0.5">
                      {parts.join(' · ')}
                    </Text>
                  )}
                </View>
                <Text
                  className={`text-sm font-semibold ${
                    step.status === 'active'
                      ? 'text-accent-primary'
                      : 'text-text-muted'
                  }`}
                >
                  {statusLabel}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
};

export default Glp1TitrationCard;
