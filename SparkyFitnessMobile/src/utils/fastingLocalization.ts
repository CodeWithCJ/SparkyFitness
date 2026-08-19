import type { TFunction } from 'i18next';

/** Translate only application-owned fasting stage identifiers. */
export function localizeFastingStage(
  t: TFunction,
  stage: { key: string; name: string; description: string; rangeLabel: string },
): { name: string; description: string; rangeLabel: string } {
  const copy: Record<string, { name: string; description: string }> = {
    anabolic: {
      name: t('fastingDetail.stages.anabolic.name', { defaultValue: 'Anabolic' }),
      description: t('fastingDetail.stages.anabolic.description', { defaultValue: 'Fed state · insulin elevated' }),
    },
    catabolic: {
      name: t('fastingDetail.stages.catabolic.name', { defaultValue: 'Catabolic' }),
      description: t('fastingDetail.stages.catabolic.description', { defaultValue: 'Glycogen depleting · fat metabolism ramping up' }),
    },
    'fat-burning': {
      name: t('fastingDetail.stages.fatBurning.name', { defaultValue: 'Fat burning' }),
      description: t('fastingDetail.stages.fatBurning.description', { defaultValue: 'Fat burning ramps up' }),
    },
    ketosis: {
      name: t('fastingDetail.stages.ketosis.name', { defaultValue: 'Ketosis' }),
      description: t('fastingDetail.stages.ketosis.description', { defaultValue: 'Ketone production rises' }),
    },
    'deep-ketosis': {
      name: t('fastingDetail.stages.deepKetosis.name', { defaultValue: 'Deep ketosis' }),
      description: t('fastingDetail.stages.deepKetosis.description', { defaultValue: 'Autophagy peak' }),
    },
  };
  const translated = copy[stage.key];
    return translated ? { ...translated, rangeLabel: stage.rangeLabel } : { ...stage, description: stage.description };
}

export function localizeProtocolBadge(t: TFunction, value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return t('fastingDetail.title', { defaultValue: 'Fasting' });
  const ratio = raw.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (ratio) return `${ratio[1]}:${ratio[2]}`;
  switch (raw) {
    case 'Circadian Rhythm': return t('fastingProtocol.presets.circadian.name', { defaultValue: 'Circadian Rhythm' });
    case 'Custom Fast': return t('fastingProtocol.presets.custom.name', { defaultValue: 'Custom Fast' });
    default: return raw;
  }
}
