import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import type { ShoeResponse } from '@workspace/shared';

/** Asks whether to retire a pair that has just reached its retire-at distance. */
export function promptToRetireShoe(
  t: TFunction,
  shoe: Pick<ShoeResponse, 'name' | 'nickname'>,
  onRetire: () => void
): void {
  Alert.alert(
    t('shoes.limitReachedTitle', { defaultValue: 'Time for new shoes?' }),
    t('shoes.limitReachedMessage', {
      defaultValue:
        '{{name}} has reached its mileage limit. Do you want to retire it?',
      name: shoe.nickname || shoe.name,
    }),
    [
      {
        text: t('common.notNow', { defaultValue: 'Not now' }),
        style: 'cancel',
      },
      {
        text: t('shoes.retire', { defaultValue: 'Retire' }),
        style: 'destructive',
        onPress: onRetire,
      },
    ]
  );
}
