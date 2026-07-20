import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';

export interface CycleAlert {
  key: string;
  severity: 'info' | 'attention';
  message: string;
}

interface CycleAlertsProps {
  alerts: CycleAlert[];
}

const CycleAlerts: React.FC<CycleAlertsProps> = ({ alerts }) => {
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
            className={`flex-row items-start p-3 rounded-xl border ${
              isAttention
                ? 'border-red-200 bg-red-50/50'
                : 'border-blue-200 bg-blue-50/50'
            }`}
          >
            <View className="mr-3 mt-0.5">
              <Icon
                name={isAttention ? 'warning' : 'info-circle'}
                size={18}
                color={isAttention ? dangerColor : accentColor}
              />
            </View>
            <Text className="flex-1 text-sm text-text-primary leading-5">
              {alert.message}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default CycleAlerts;
