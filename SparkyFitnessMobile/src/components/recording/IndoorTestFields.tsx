import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DECIMAL_INPUT_REGEX } from '../../utils/numericInput';
import type { FitnessTestType } from '@workspace/shared';
import FormInput from '../FormInput';
import RecordingSwitchRow from './RecordingSwitchRow';

export interface IndoorTestFieldsProps {
  type: FitnessTestType;
  /** Distance unit label for the 10-minute distance ("km" or "mi"). */
  unitLabel: string;
  /** 5K: the time at 5 km as typed ("24:30"). */
  timeText: string;
  onTimeChange: (text: string) => void;
  /** 30-minute run: the treadmill's distance at 10:00, in the display unit. */
  splitText: string;
  onSplitChange: (text: string) => void;
  /** Treadmill incline, percent. */
  inclineText: string;
  onInclineChange: (text: string) => void;
  adjustForIncline: boolean;
  onAdjustChange: (value: boolean) => void;
  /** The incline entered is not a number from 0 to 15. */
  inclineInvalid: boolean;
}

/**
 * What a treadmill test asks for after Finish, beside the distance the Record
 * screen already collects for an indoor run: the 5K time, the 30-minute run's
 * distance at 10:00, and the incline with the switch for its correction.
 */
const IndoorTestFields: React.FC<IndoorTestFieldsProps> = ({
  type,
  unitLabel,
  timeText,
  onTimeChange,
  splitText,
  onSplitChange,
  inclineText,
  onInclineChange,
  adjustForIncline,
  onAdjustChange,
  inclineInvalid,
}) => {
  const { t } = useTranslation();
  return (
    <View testID="indoor-test-fields">
      <View className="bg-surface rounded-xl p-4 mb-4">
        {type === '5k' ? (
          <>
            <Text className="text-text-primary text-base font-bold mb-1">
              {t('fitnessTest.indoor.timeTitle', {
                defaultValue: 'Time to 5 km',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mb-3">
              {t('fitnessTest.indoor.timeHint', {
                defaultValue:
                  'Your clock time is filled in. Change it if your treadmill showed another time at 5 km.',
              })}
            </Text>
            <FormInput
              keyboardType="numbers-and-punctuation"
              value={timeText}
              placeholder="24:30"
              accessibilityLabel={t('fitnessTest.indoor.timeTitle', {
                defaultValue: 'Time to 5 km',
              })}
              onChangeText={onTimeChange}
              testID="indoor-test-time"
            />
          </>
        ) : type === '30min' ? (
          <>
            <Text className="text-text-primary text-base font-bold mb-1">
              {t('fitnessTest.indoor.splitTitle', {
                defaultValue: 'Distance at 10:00',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mb-3">
              {t('fitnessTest.indoor.splitHint', {
                defaultValue:
                  'The distance your treadmill showed after 10 minutes. The last 20 minutes set your threshold pace. Leave it empty to assume a steady pace.',
              })}
            </Text>
            <View className="flex-row items-center">
              <FormInput
                className="flex-1"
                keyboardType="decimal-pad"
                value={splitText}
                placeholder="0.00"
                accessibilityLabel={t('fitnessTest.indoor.splitTitle', {
                  defaultValue: 'Distance at 10:00',
                })}
                onChangeText={(text) => {
                  if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
                  onSplitChange(text);
                }}
                testID="indoor-test-split"
              />
              <Text className="text-text-secondary text-base ml-3">
                {unitLabel}
              </Text>
            </View>
          </>
        ) : (
          <Text className="text-text-secondary text-sm">
            {t('fitnessTest.indoor.cooperHint', {
              defaultValue:
                'Enter the distance your treadmill showed after 12 minutes in the Distance box above.',
            })}
          </Text>
        )}
      </View>

      <View className="bg-surface rounded-xl p-4 mb-4">
        <Text className="text-text-primary text-base font-bold mb-1">
          {t('fitnessTest.indoor.inclineTitle', { defaultValue: 'Incline' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-3">
          {t('fitnessTest.indoor.inclineHint', {
            defaultValue:
              'A treadmill at 0% understates outdoor effort; 1% is about the same as running flat outdoors. Enter the incline you ran at.',
          })}
        </Text>
        <View className="flex-row items-center">
          <FormInput
            className="flex-1"
            keyboardType="decimal-pad"
            value={inclineText}
            placeholder="1"
            accessibilityLabel={t('fitnessTest.indoor.inclineTitle', {
              defaultValue: 'Incline',
            })}
            onChangeText={(text) => {
              if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
              onInclineChange(text);
            }}
            testID="indoor-test-incline"
          />
          <Text className="text-text-secondary text-base ml-3">%</Text>
        </View>
        {inclineInvalid ? (
          <Text className="text-text-danger-subtle text-sm mt-2">
            {t('fitnessTest.indoor.inclineInvalid', {
              defaultValue: 'Enter an incline from 0 to 15.',
            })}
          </Text>
        ) : null}
        <RecordingSwitchRow
          testID="indoor-test-adjust"
          title={t('fitnessTest.indoor.adjustTitle', {
            defaultValue: 'Adjust for incline',
          })}
          description={t('fitnessTest.indoor.adjustDescription', {
            defaultValue:
              'Counts your effort as it would be on a flat outdoor course, using the running cost of each percent of incline. At 1% nothing changes. Turn off to use the numbers as they are.',
          })}
          value={adjustForIncline}
          onValueChange={onAdjustChange}
        />
      </View>
    </View>
  );
};

export default IndoorTestFields;
