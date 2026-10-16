import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import Button from './ui/Button';
import {
  DIRECTION_COLORS,
  NUTRIENT_DIRECTION_GUIDES,
  type NutrientDirectionGuideKey,
} from '../constants/nutrientDirectionGuides';

interface NutrientDirectionGuideProps {
  onApply: (key: NutrientDirectionGuideKey) => void;
}

const LEGEND = [
  { key: 'minimum', color: DIRECTION_COLORS.minimum },
  { key: 'maximum', color: DIRECTION_COLORS.maximum },
  { key: 'target', color: DIRECTION_COLORS.target },
] as const;

const NutrientDirectionGuide: React.FC<NutrientDirectionGuideProps> = ({
  onApply,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const textMuted = useCSSVariable('--color-text-muted') as string;

  const guideCopy: Record<
    NutrientDirectionGuideKey,
    { title: string; body: string }
  > = {
    loseWeight: {
      title: t('goals.directions.guide.loseWeight.title', {
        defaultValue: 'Losing weight',
      }),
      body: t('goals.directions.guide.loseWeight.body', {
        defaultValue: 'Set Calories to Maximum (a ceiling) or a Target range.',
      }),
    },
    gainWeight: {
      title: t('goals.directions.guide.gainWeight.title', {
        defaultValue: 'Gaining weight or building muscle',
      }),
      body: t('goals.directions.guide.gainWeight.body', {
        defaultValue: 'Set Calories and Protein to Minimum (a floor to reach).',
      }),
    },
    maintain: {
      title: t('goals.directions.guide.maintain.title', {
        defaultValue: 'Maintaining weight',
      }),
      body: t('goals.directions.guide.maintain.body', {
        defaultValue:
          'Set Calories to a Target range around your maintenance level.',
      }),
    },
    diabetes: {
      title: t('goals.directions.guide.diabetes.title', {
        defaultValue: 'Managing blood sugar (diabetes)',
      }),
      body: t('goals.directions.guide.diabetes.body', {
        defaultValue: 'Set Carbohydrates and Sugars to Maximum.',
      }),
    },
    heart: {
      title: t('goals.directions.guide.heart.title', {
        defaultValue: 'High cholesterol or heart health',
      }),
      body: t('goals.directions.guide.heart.body', {
        defaultValue:
          'Keep Cholesterol, Saturated fat, and Sodium as Maximum (the defaults).',
      }),
    },
    lowCarb: {
      title: t('goals.directions.guide.lowCarb.title', {
        defaultValue: 'Low-carb or keto',
      }),
      body: t('goals.directions.guide.lowCarb.body', {
        defaultValue:
          'Set Carbohydrates to Maximum; keep Fat and Protein as Minimum.',
      }),
    },
  };

  const legendCopy = {
    minimum: {
      label: t('goals.directions.legend.minimum.label', {
        defaultValue: 'Min',
      }),
      body: t('goals.directions.legend.minimum.body', {
        defaultValue: 'More is better — progress fills toward the goal',
      }),
    },
    maximum: {
      label: t('goals.directions.legend.maximum.label', {
        defaultValue: 'Max',
      }),
      body: t('goals.directions.legend.maximum.body', {
        defaultValue: 'Less is better — stay at or under the goal',
      }),
    },
    target: {
      label: t('goals.directions.legend.target.label', {
        defaultValue: 'Range',
      }),
      body: t('goals.directions.legend.target.body', {
        defaultValue: 'Hit a band between a minimum and a maximum',
      }),
    },
  };

  return (
    <View className="gap-2 rounded-lg bg-raised p-3">
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        className="flex-row items-center justify-between gap-2"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID="direction-guide-toggle"
      >
        <Text className="flex-1 text-sm font-semibold text-accent-primary">
          {t('goals.directions.guide.title', {
            defaultValue: 'Not sure which to choose? It depends on your goal',
          })}
        </Text>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={textMuted}
        />
      </Pressable>
      {open && (
        <View className="gap-3">
          <Text className="text-sm text-text-secondary">
            {t('goals.directions.guide.intro', {
              defaultValue:
                'These are only display directions — they change how progress is judged, not your goal numbers. Pick what fits what you are trying to do, or tap Apply to set the directions for you:',
            })}
          </Text>
          {NUTRIENT_DIRECTION_GUIDES.map((guide) => (
            <View key={guide.key} className="gap-1 rounded-md bg-surface p-3">
              <Text className="text-sm font-semibold text-text-primary">
                {guideCopy[guide.key].title}
              </Text>
              <Text className="text-sm text-text-secondary">
                {guideCopy[guide.key].body}
              </Text>
              <Button
                variant="secondary"
                onPress={() => onApply(guide.key)}
                className="mt-1 self-start py-2"
                textClassName="text-xs"
                testID={`direction-guide-apply-${guide.key}`}
              >
                {t('goals.directions.guide.apply', {
                  defaultValue: 'Apply to my goals',
                })}
              </Button>
            </View>
          ))}
          <View className="gap-1">
            {LEGEND.map((item) => (
              <View key={item.key} className="flex-row items-center gap-2">
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: item.color,
                  }}
                />
                <Text className="flex-1 text-sm text-text-secondary">
                  <Text className="font-semibold text-text-primary">
                    {legendCopy[item.key].label}
                  </Text>{' '}
                  {legendCopy[item.key].body}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

export default NutrientDirectionGuide;
