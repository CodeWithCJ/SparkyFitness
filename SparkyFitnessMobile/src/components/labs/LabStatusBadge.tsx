import React from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LabRangeStatus } from '@workspace/shared';

const STATUS_CLASS: Record<LabRangeStatus, string> = {
  low: 'text-text-warning',
  high: 'text-text-danger-subtle',
  in_range: 'text-text-success',
  unknown: 'text-text-muted',
};

/** "Low", "High" or "In range" against the marker's reference range. */
const LabStatusBadge: React.FC<{ status: LabRangeStatus }> = ({ status }) => {
  const { t } = useTranslation();
  if (status === 'unknown') return null;
  const label =
    status === 'low'
      ? t('labs.status.low', { defaultValue: 'Low' })
      : status === 'high'
        ? t('labs.status.high', { defaultValue: 'High' })
        : t('labs.status.inRange', { defaultValue: 'In range' });
  return (
    <Text className={`text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {label}
    </Text>
  );
};

export default LabStatusBadge;
