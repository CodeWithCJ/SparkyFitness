import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  penDosesLeft,
  penExpiryStatus,
  type PenExpiryStatus,
} from '../../utils/glp1';
import { useMedicationPens } from '../../hooks/useGlp1';
import { getTodayDate } from '../../utils/dateUtils';

interface Glp1InventoryCardProps {
  medicationId: string;
  onAdd: () => void;
  onEdit: (penId: string) => void;
}

const Glp1InventoryCard: React.FC<Glp1InventoryCardProps> = ({
  medicationId,
  onAdd,
  onEdit,
}) => {
  const { t } = useTranslation();
  const { data: pens = [] } = useMedicationPens(medicationId);
  const today = getTodayDate();

  const expiryText = (status: PenExpiryStatus | null, date: string | null) => {
    if (!date || !status) return null;
    return status === 'expired'
      ? t('medications.glp1.inventory.expired', {
          defaultValue: 'Expired {{date}}',
          date,
        })
      : t('medications.glp1.inventory.expires', {
          defaultValue: 'Expires {{date}}',
          date,
        });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base font-semibold text-text-primary">
          {t('medications.glp1.inventory.title', {
            defaultValue: 'Pens and vials',
          })}
        </Text>
        <TouchableOpacity
          onPress={onAdd}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-accent-primary">
            {t('medications.glp1.inventory.add', { defaultValue: 'Add' })}
          </Text>
        </TouchableOpacity>
      </View>
      {pens.length === 0 ? (
        <Text className="text-sm text-text-muted">
          {t('medications.glp1.inventory.empty', {
            defaultValue:
              'No pens or vials yet. Add one to track doses left and expiry.',
          })}
        </Text>
      ) : (
        pens.map((pen, index) => {
          const left = penDosesLeft(pen);
          const expiry = penExpiryStatus(pen.expiry_date, today);
          const lowStock =
            pen.reorder_flag &&
            left != null &&
            pen.reorder_threshold != null &&
            left <= pen.reorder_threshold;
          const name =
            pen.label ||
            (pen.kind === 'vial'
              ? t('medications.glp1.inventory.vial', { defaultValue: 'Vial' })
              : t('medications.glp1.inventory.pen', { defaultValue: 'Pen' }));
          const statusLabel =
            pen.status === 'in_use'
              ? t('medications.glp1.inventory.status.in_use', {
                  defaultValue: 'In use',
                })
              : pen.status === 'finished'
                ? t('medications.glp1.inventory.status.finished', {
                    defaultValue: 'Finished',
                  })
                : t('medications.glp1.inventory.status.sealed', {
                    defaultValue: 'Sealed',
                  });
          const details = [
            pen.dose_mg != null ? `${pen.dose_mg} mg` : null,
            left != null
              ? t('medications.glp1.inventory.left', {
                  defaultValue: '{{count}} left',
                  count: left,
                })
              : null,
            expiryText(expiry, pen.expiry_date),
          ].filter(Boolean);
          return (
            <View key={pen.id}>
              {index > 0 && <View className="h-px bg-chrome-border my-2" />}
              <TouchableOpacity
                onPress={() => onEdit(pen.id)}
                activeOpacity={0.6}
                accessibilityRole="button"
                className="flex-row items-center"
              >
                <View className="flex-1">
                  <Text className="text-base text-text-primary">{name}</Text>
                  <Text className="text-xs text-text-muted mt-0.5">
                    {[statusLabel, ...details].join(' · ')}
                  </Text>
                  {(lowStock || expiry === 'expired' || expiry === 'soon') && (
                    <Text className="text-xs font-medium text-text-warning mt-0.5">
                      {lowStock
                        ? t('medications.glp1.inventory.reorder', {
                            defaultValue: 'Time to reorder',
                          })
                        : expiry === 'expired'
                          ? t('medications.glp1.inventory.expiredWarning', {
                              defaultValue: 'Past its expiry date',
                            })
                          : t('medications.glp1.inventory.expiringSoon', {
                              defaultValue: 'Expires within a week',
                            })}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
};

export default Glp1InventoryCard;
