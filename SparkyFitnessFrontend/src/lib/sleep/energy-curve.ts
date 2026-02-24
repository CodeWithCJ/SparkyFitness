/**
 * Energy Curve Generator
 *
 * Generates the 24-hour energy prediction curve using the Two-Process Model.
 * The curve predicts subjective alertness throughout the day based on:
 * - Process S (homeostatic sleep pressure)
 * - Process C (circadian rhythm)
 * - Sleep debt penalty
 * - Nap effects
 *
 * Output: 96 data points (15-minute intervals over 24 hours)
 */

import {
  type ChronotypeData,
  type CircadianPoint,
  type CircadianConfig,
  type EnergyCurve,
  type NapData,
  type DailyVitalsMinimal,
  type EnergyZone,
  CIRCADIAN_DEFAULTS,
} from './circadian-types';

import {
  calculateProcessS,
  calculateProcessSDecay,
  calculateProcessC,
  calculateEnergy,
  applyDebtPenalty,
  determineEnergyZone,
  findNextPeak,
  findNextDip,
  getDefaultConfig,
  hoursBetween,
  addHours,
  setTime,
  getTimeOfDayHours,
} from './circadian-math';

// === NAP DETECTION ===

/**
 * Detect naps from daily vitals.
 *
 * Identifies sleep periods that occur outside the main sleep window.
 * Typically between 10:00 and 18:00 (daytime naps).
 *
 * @param history - Daily vitals data
 * @param targetDate - Date to check for naps
 * @returns Array of detected naps
 */
export function detectNaps(
  history: DailyVitalsMinimal[],
  targetDate: Date
): NapData[] {
  // This would require additional data from Garmin that tracks
  // intraday sleep/nap events. For now, return empty array.
  // In a real implementation, this would parse the sleep_levels_map
  // or similar Garmin data to detect daytime sleep periods.

  // Placeholder: In future, integrate with Garmin nap detection
  return [];
}

/**
 * Apply nap effect to the energy curve.
 *
 * Naps reduce Process S (sleep pressure), resulting in higher
 * energy levels after the nap. The effect depends on nap duration:
 * - 10-20 min: Modest S reduction, no grogginess
 * - 30-60 min: Larger S reduction, possible sleep inertia
 * - 90+ min: Full sleep cycle, significant S reduction
 *
 * @param points - Original curve points
 * @param naps - Array of naps to apply
 * @param config - Circadian configuration
 * @returns Modified curve with nap effects
 */
export function applyNapEffect(
  points: CircadianPoint[],
  naps: NapData[],
  config?: Partial<CircadianConfig>
): CircadianPoint[] {
  if (naps.length === 0) {
    return points;
  }

  // Clone points to avoid mutation
  const modifiedPoints = points.map((p) => ({ ...p }));

  for (const nap of naps) {
    const napStart = nap.startTime;
    const napEnd = nap.endTime;
    const napDurationHours = nap.duration / 60;

    // Find the index of nap start
    let napStartIndex = -1;
    for (let i = 0; i < modifiedPoints.length; i++) {
      if (modifiedPoints[i].time >= napStart) {
        napStartIndex = i;
        break;
      }
    }

    if (napStartIndex === -1) continue;

    // Get Process S at nap start
    const sAtNapStart = modifiedPoints[napStartIndex].processS;

    // Calculate S decay during nap
    const sAfterNap = calculateProcessSDecay(napDurationHours, sAtNapStart, config);

    // Apply effect to all points after the nap
    for (let i = 0; i < modifiedPoints.length; i++) {
      const point = modifiedPoints[i];

      if (point.time >= napEnd) {
        // Recalculate Process S from nap end
        const hoursAfterNap = hoursBetween(napEnd, point.time);

        if (hoursAfterNap >= 0) {
          // S rises again from the reduced post-nap level
          const newProcessS = calculateProcessS(hoursAfterNap, config, sAfterNap);

          // Recalculate energy with new S
          const newEnergy = calculateEnergy(newProcessS, point.processC);

          modifiedPoints[i] = {
            ...point,
            processS: newProcessS,
            energy: newEnergy,
          };
        }
      }
    }
  }

  // Re-determine zones for modified points
  return modifiedPoints;
}

// === CURVE GENERATION ===

/**
 * Generate the complete 24-hour energy curve.
 *
 * @param chronotype - Individual chronotype data
 * @param sleepDebt - Current sleep debt in hours
 * @param currentTime - Current time for reference
 * @param wakeTime - Today's wake time
 * @param naps - Optional array of naps to include
 * @param config - Optional custom circadian configuration
 * @returns Complete energy curve with 96 data points
 */
export function generateEnergyCurve(
  chronotype: ChronotypeData,
  sleepDebt: number,
  currentTime: Date,
  wakeTime: Date,
  naps?: NapData[],
  config?: Partial<CircadianConfig>
): EnergyCurve {
  const fullConfig = { ...getDefaultConfig(), ...config };
  const points: CircadianPoint[] = [];

  // Generate 96 points (24 hours × 4 points per hour)
  const pointsCount = 24 * CIRCADIAN_DEFAULTS.POINTS_PER_HOUR;
  const intervalMinutes = 60 / CIRCADIAN_DEFAULTS.POINTS_PER_HOUR; // 15 minutes

  // Start from midnight of the current day
  const dayStart = new Date(currentTime);
  dayStart.setHours(0, 0, 0, 0);

  // Expected sleep time (from chronotype)
  const sleepTime = new Date(dayStart);
  sleepTime.setHours(
    chronotype.averageSleepTime.getHours(),
    chronotype.averageSleepTime.getMinutes(),
    0,
    0
  );

  // If sleep time is before current time but after midnight, it's for tomorrow
  if (sleepTime < dayStart) {
    sleepTime.setDate(sleepTime.getDate() + 1);
  }

  // Adjust wake time to be on today's date
  const todayWakeTime = new Date(dayStart);
  todayWakeTime.setHours(wakeTime.getHours(), wakeTime.getMinutes(), 0, 0);

  for (let i = 0; i < pointsCount; i++) {
    const time = new Date(dayStart);
    time.setMinutes(time.getMinutes() + i * intervalMinutes);

    // Calculate hours awake (from wake time)
    let hoursAwake = hoursBetween(todayWakeTime, time);

    // Handle times before wake (sleeping or pre-wake)
    if (hoursAwake < 0) {
      // Before wake time - in sleep period or early morning
      // Use the previous day's wake calculation or assume sleeping
      hoursAwake = 0; // Treat as just woken
    }

    // Calculate Process S
    const processS = calculateProcessS(hoursAwake, fullConfig);

    // Calculate Process C
    const processC = calculateProcessC(time, chronotype.circadianNadir, fullConfig);

    // Calculate base energy
    let energy = calculateEnergy(processS, processC);

    // Apply sleep debt penalty
    const { energy: adjustedEnergy, penalty } = applyDebtPenalty(energy, sleepDebt);
    energy = adjustedEnergy;

    // Determine energy zone
    const zone = determineEnergyZone(
      energy,
      processC,
      time,
      chronotype.melatoninWindow.start,
      todayWakeTime,
      sleepTime
    );

    points.push({
      time,
      processS,
      processC,
      energy: Math.round(energy * 10) / 10,
      zone,
    });
  }

  // Apply nap effects if any
  const finalPoints = naps && naps.length > 0
    ? applyNapEffect(points, naps, fullConfig)
    : points;

  // Find current energy
  let currentEnergy = 50; // Default
  let currentZone: EnergyZone = 'rising';

  for (const point of finalPoints) {
    if (point.time <= currentTime) {
      currentEnergy = point.energy;
      currentZone = point.zone;
    } else {
      break;
    }
  }

  // Find next peak and dip
  const nextPeak = findNextPeak(finalPoints, currentTime) || {
    time: addHours(currentTime, 4),
    energy: 80,
  };

  const nextDip = findNextDip(finalPoints, currentTime) || {
    time: addHours(currentTime, 8),
    energy: 40,
  };

  // Calculate sleep debt penalty for reference
  const { penalty: sleepDebtPenalty } = applyDebtPenalty(100, sleepDebt);

  return {
    points: finalPoints,
    currentEnergy: Math.round(currentEnergy * 10) / 10,
    currentZone,
    nextPeak,
    nextDip,
    melatoninWindow: chronotype.melatoninWindow,
    wakeTime: todayWakeTime,
    sleepDebtPenalty,
  };
}

// === QUICK ENERGY CALCULATION ===

/**
 * Calculate current energy without generating full curve.
 *
 * Useful for quick energy display without the overhead of full curve generation.
 *
 * @param chronotype - Individual chronotype data
 * @param sleepDebt - Current sleep debt in hours
 * @param currentTime - Current time
 * @param wakeTime - Today's wake time
 * @returns Current energy level (0-100) and zone
 */
export function calculateCurrentEnergy(
  chronotype: ChronotypeData,
  sleepDebt: number,
  currentTime: Date,
  wakeTime: Date
): { energy: number; zone: EnergyZone } {
  const config = getDefaultConfig();

  // Calculate hours awake
  let hoursAwake = hoursBetween(wakeTime, currentTime);
  if (hoursAwake < 0) hoursAwake = 0;

  // Calculate Process S
  const processS = calculateProcessS(hoursAwake, config);

  // Calculate Process C
  const processC = calculateProcessC(currentTime, chronotype.circadianNadir, config);

  // Calculate energy with debt penalty
  const baseEnergy = calculateEnergy(processS, processC);
  const { energy } = applyDebtPenalty(baseEnergy, sleepDebt);

  // Get expected sleep time
  const sleepTime = new Date(currentTime);
  sleepTime.setHours(
    chronotype.averageSleepTime.getHours(),
    chronotype.averageSleepTime.getMinutes(),
    0,
    0
  );

  // Determine zone
  const zone = determineEnergyZone(
    energy,
    processC,
    currentTime,
    chronotype.melatoninWindow.start,
    wakeTime,
    sleepTime
  );

  return {
    energy: Math.round(energy * 10) / 10,
    zone,
  };
}

// === ZONE INSIGHTS ===

/**
 * Get insight text for current energy zone.
 *
 * @param zone - Current energy zone
 * @returns Contextual insight in Portuguese
 */
export function getZoneInsight(zone: EnergyZone): string {
  switch (zone) {
    case 'peak':
      return 'Momento ideal para tarefas complexas e decisoes importantes.';
    case 'rising':
      return 'Sua energia esta subindo. Bom momento para planejar o dia.';
    case 'dip':
      return 'Baixa natural de energia. Considere uma soneca de 20 minutos.';
    case 'wind-down':
      return 'Fase de preparo para o sono. Reduza exposicao a telas.';
    case 'sleep':
      return 'Periodo de descanso. Priorize qualidade do sono.';
  }
}

/**
 * Get zone label in Portuguese.
 *
 * @param zone - Energy zone
 * @returns Portuguese label
 */
export function getZoneLabel(zone: EnergyZone): string {
  switch (zone) {
    case 'peak':
      return 'Pico de Energia';
    case 'rising':
      return 'Energia Subindo';
    case 'dip':
      return 'Baixa de Energia';
    case 'wind-down':
      return 'Preparando para Dormir';
    case 'sleep':
      return 'Periodo de Sono';
  }
}

/**
 * Get zone color.
 *
 * @param zone - Energy zone
 * @returns Color hex code
 */
export function getZoneColor(zone: EnergyZone): string {
  switch (zone) {
    case 'peak':
      return '#00F19F'; // Teal/green
    case 'rising':
      return '#67AEE6'; // Blue
    case 'dip':
      return '#FFDE00'; // Yellow
    case 'wind-down':
      return '#9B59B6'; // Purple
    case 'sleep':
      return '#5A778A'; // Dark blue-gray
  }
}

/**
 * Get zone icon/emoji.
 *
 * @param zone - Energy zone
 * @returns Emoji for the zone
 */
export function getZoneEmoji(zone: EnergyZone): string {
  switch (zone) {
    case 'peak':
      return '\u26A1'; // Lightning bolt
    case 'rising':
      return '\u2197\uFE0F'; // Arrow up-right
    case 'dip':
      return '\u{1F634}'; // Sleeping face
    case 'wind-down':
      return '\u{1F319}'; // Crescent moon
    case 'sleep':
      return '\u{1F4A4}'; // Zzz
  }
}

// === CURVE UTILITIES ===

/**
 * Get energy at a specific time from the curve.
 *
 * @param curve - Energy curve
 * @param time - Time to look up
 * @returns Energy level at that time, or null if not found
 */
export function getEnergyAtTime(curve: EnergyCurve, time: Date): number | null {
  // Find the closest point
  let closestPoint: CircadianPoint | null = null;
  let closestDistance = Infinity;

  for (const point of curve.points) {
    const distance = Math.abs(point.time.getTime() - time.getTime());
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPoint = point;
    }
  }

  return closestPoint ? closestPoint.energy : null;
}

/**
 * Get points within a time range.
 *
 * @param curve - Energy curve
 * @param start - Range start
 * @param end - Range end
 * @returns Points within the range
 */
export function getPointsInRange(
  curve: EnergyCurve,
  start: Date,
  end: Date
): CircadianPoint[] {
  return curve.points.filter((p) => p.time >= start && p.time <= end);
}

/**
 * Calculate average energy for a time range.
 *
 * @param curve - Energy curve
 * @param start - Range start
 * @param end - Range end
 * @returns Average energy in the range
 */
export function getAverageEnergy(curve: EnergyCurve, start: Date, end: Date): number {
  const points = getPointsInRange(curve, start, end);

  if (points.length === 0) return 0;

  const sum = points.reduce((acc, p) => acc + p.energy, 0);
  return Math.round((sum / points.length) * 10) / 10;
}
