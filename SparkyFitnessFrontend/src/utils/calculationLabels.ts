import type { TFunction } from 'i18next';
import { BmrAlgorithm } from '@/services/bmrService';
import { BodyFatAlgorithm } from '@/services/bodyCompositionService';

interface TranslationLabel {
  key: string;
  defaultValue: string;
}

const BMR_ALGORITHM_LABELS: Record<string, TranslationLabel> = {
  [BmrAlgorithm.MIFFLIN_ST_JEOR]: {
    key: 'calculationSettings.bmrAlgorithmOptions.mifflinStJeor',
    defaultValue: 'Mifflin-St Jeor',
  },
  [BmrAlgorithm.REVISED_HARRIS_BENEDICT]: {
    key: 'calculationSettings.bmrAlgorithmOptions.revisedHarrisBenedict',
    defaultValue: 'Revised Harris-Benedict',
  },
  [BmrAlgorithm.KATCH_MCARDLE]: {
    key: 'calculationSettings.bmrAlgorithmOptions.katchMcArdle',
    defaultValue: 'Katch-McArdle',
  },
  [BmrAlgorithm.CUNNINGHAM]: {
    key: 'calculationSettings.bmrAlgorithmOptions.cunningham',
    defaultValue: 'Cunningham',
  },
  [BmrAlgorithm.OXFORD]: {
    key: 'calculationSettings.bmrAlgorithmOptions.oxford',
    defaultValue: 'Oxford',
  },
};

const BODY_FAT_ALGORITHM_LABELS: Record<string, TranslationLabel> = {
  [BodyFatAlgorithm.US_NAVY]: {
    key: 'calculationSettings.bodyFatAlgorithmOptions.usNavy',
    defaultValue: 'U.S. Navy',
  },
  [BodyFatAlgorithm.BMI]: {
    key: 'calculationSettings.bodyFatAlgorithmOptions.bmiMethod',
    defaultValue: 'BMI Method',
  },
};

const GOAL_MODE_LABELS: Record<string, TranslationLabel> = {
  maintain: {
    key: 'settings.goalMode.modeNames.maintain',
    defaultValue: 'Maintain',
  },
  recomp: {
    key: 'settings.goalMode.modeNames.recomp',
    defaultValue: 'Body Recomposition',
  },
  cut: {
    key: 'settings.goalMode.modeNames.cut',
    defaultValue: 'Cut',
  },
  high_cut: {
    key: 'settings.goalMode.modeNames.highCut',
    defaultValue: 'High Cut',
  },
  lean_bulk: {
    key: 'settings.goalMode.modeNames.leanBulk',
    defaultValue: 'Lean Bulk',
  },
  bulk: {
    key: 'settings.goalMode.modeNames.bulk',
    defaultValue: 'Bulk',
  },
  manual: {
    key: 'settings.goalMode.modeNames.manual',
    defaultValue: 'Manual',
  },
};

const getMappedLabel = (
  t: TFunction,
  labels: Record<string, TranslationLabel>,
  value: string
): string => {
  const label = labels[value];
  return label ? t(label.key, label.defaultValue) : value;
};

export const getBmrAlgorithmLabel = (t: TFunction, algorithm: string): string =>
  getMappedLabel(t, BMR_ALGORITHM_LABELS, algorithm);

export const getBodyFatAlgorithmLabel = (
  t: TFunction,
  algorithm: string
): string => getMappedLabel(t, BODY_FAT_ALGORITHM_LABELS, algorithm);

export const getGoalModeLabel = (t: TFunction, goalMode: string): string =>
  getMappedLabel(t, GOAL_MODE_LABELS, goalMode);
