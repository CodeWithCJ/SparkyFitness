import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';
import { localizeCycleAlert } from '../../utils/cycleLocalization';

export interface CycleAlert {
  key: string;
  severity: 'info' | 'attention';
  message: string;
  /** Structured numeric parameters referenced by the message (e.g. days). */
  params?: Record<string, number>;
}

interface CycleAlertsProps {
  alerts: CycleAlert[];
}

const CycleAlerts: React.FC<CycleAlertsProps> = ({ alerts }) => {
  const { t } = useTranslation();
  const [dangerColor, accentColor] = useCSSVariable([
    '--color-icon-danger',
    '--color-accent-primary',
  ]) as [string, string];

  if (!alerts || alerts.length === 0) return null;

  return (
    <View className="gap-2">
      {alerts.map((alert) => {
        const isAttention = alert.severity === 'attention';
        return (
          <View
            key={alert.key}
            className="flex-row items-center p-4 rounded-xl border-0 bg-surface shadow-sm"
          >
            <View className="mr-3 mt-0.5">
              <Icon
                name={isAttention ? 'warning' : 'info-circle'}
                size={18}
                color={isAttention ? dangerColor : accentColor}
              />
            </View>
            <Text className="flex-1 text-sm text-text-primary leading-5">
              {localizeCycleAlert(alert.key, alert.message, t, alert.params)}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default CycleAlerts;
