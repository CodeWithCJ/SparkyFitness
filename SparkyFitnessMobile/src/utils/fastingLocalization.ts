import type { TFunction } from 'i18next';

/** Translate only application-owned fasting stage identifiers and range metadata. */
export function localizeFastingStage(
  t: TFunction,
  stage: { key: string; name: string; description: string; minHours?: number; maxHours?: number | null; rangeLabel: string },
): { name: string; description: string; rangeLabel: string } {
  const copy: Record<string, { name: string; description: string }> = {
    anabolic: {
      name: t('fastingDetail.stages.anabolic.name', { defaultValue: 'Anabolic' }),
      description: t('fastingDetail.stages.anabolic.description', { defaultValue: 'Fed state · insulin elevated' }),
    },
    catabolic: {
      name: t('fastingDetail.stages.catabolic.name', { defaultValue: 'Catabolic' }),
      description: t('fastingDetail.stages.catabolic.description', { defaultValue: 'Glycogen depletion · increased use of fat for energy' }),
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
      description: t('fastingDetail.stages.deepKetosis.description', { defaultValue: 'A stage often associated with increased autophagy' }),
    },
  };
  const rangeLabel = stage.minHours == null
    ? stage.rangeLabel
    : stage.maxHours == null
      ? t('fastingDetail.rangeOpen', {
          defaultValue: '{{start}} {{unit}}+',
          start: stage.minHours,
          unit: t('time.hoursShort', { defaultValue: 'h' }),
        })
      : t('fastingDetail.range', {
          defaultValue: '{{start}}–{{end}} {{unit}}',
          start: stage.minHours,
          end: stage.maxHours,
          unit: t('time.hoursShort', { defaultValue: 'h' }),
        });
  const translated = copy[stage.key];
  return translated ? { ...translated, rangeLabel } : { ...stage, rangeLabel, description: stage.description };
}

export function localizeProtocolBadge(t: TFunction, value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return t('fastingDetail.title', { defaultValue: 'Fasting' });
  // Pure ratio ("16:8", "18 : 6") -> compact form.
  const pureRatio = raw.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (pureRatio) return `${pureRatio[1]}:${pureRatio[2]}`;
  // Known controlled presets encode the ratio as a prefix with an English
  // name tail ("16:8 Leangains", "18:6 Warrior", "20:4 Warrior"). Extract the
  // ratio so the badge never leaks the English name into Polish UI.
  const presetRatio = raw.match(/^(\d{1,2})\s*:\s*(\d{1,2})\s+(?:Leangains|Warrior)$/i);
  if (presetRatio) return `${presetRatio[1]}:${presetRatio[2]}`;
  // Localize the remaining controlled presets by exact name.
  switch (raw) {
    case 'Circadian Rhythm': return t('fastingProtocol.presets.circadian.name', { defaultValue: 'Circadian Rhythm' });
    case 'Custom Fast': return t('fastingProtocol.presets.custom.name', { defaultValue: 'Custom Fast' });
    default: return raw;
  }
}
