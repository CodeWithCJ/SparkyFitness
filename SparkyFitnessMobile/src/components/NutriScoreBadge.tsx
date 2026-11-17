import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  NUTRI_SCORE_GRADE_COLORS,
  NUTRI_SCORE_GRADES,
  type NutriScoreResult,
} from '@workspace/shared';

interface NutriScoreBadgeProps {
  nutriScore: NutriScoreResult;
}

/** The five-letter Nutri-Score strip with the food's grade highlighted. */
const NutriScoreBadge: React.FC<NutriScoreBadgeProps> = ({ nutriScore }) => {
  const { t } = useTranslation();
  const grade = nutriScore.grade.toUpperCase();
  const label =
    nutriScore.source === 'provider'
      ? t('foodDetail.nutriScoreProvider', {
          grade,
          defaultValue: 'Nutri-Score {{grade}} (from Open Food Facts)',
        })
      : t('foodDetail.nutriScoreComputed', {
          grade,
          defaultValue: 'Nutri-Score {{grade}} (calculated from nutrients)',
        });

  return (
    <View
      testID="nutri-score-badge"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="flex-row self-start overflow-hidden rounded-full border border-border-subtle"
    >
      {NUTRI_SCORE_GRADES.map((letter) => {
        const active = letter === nutriScore.grade;
        return (
          <View
            key={letter}
            className={`items-center justify-center ${active ? 'w-8 h-8' : 'w-6 h-8'}`}
            style={
              active
                ? { backgroundColor: NUTRI_SCORE_GRADE_COLORS[letter] }
                : undefined
            }
          >
            <Text
              className={
                active
                  ? 'text-white text-base font-bold'
                  : 'text-text-secondary text-xs font-semibold'
              }
            >
              {letter.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default NutriScoreBadge;
