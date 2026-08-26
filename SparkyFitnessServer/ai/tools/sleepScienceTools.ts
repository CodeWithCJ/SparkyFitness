import { tool } from 'ai';
import { log } from '../../config/logging.js';
import sleepScienceService from '../../services/sleepScienceService.js';
import { ERRORS, formatZodError } from './errors.js';
import {
  SLEEP_SCIENCE_ACTIONS,
  sleepScienceSchema,
  sleepScienceInput,
  type SleepScienceInput,
} from './schemas/sleepScience.js';
import { normalizeActionArgs } from './dates.js';
import { todayInZone } from '@workspace/shared';

const VALID_ACTIONS = [...SLEEP_SCIENCE_ACTIONS];

interface SleepDebtView {
  currentDebt: number;
  debtCategory: string;
  sleepNeed: number;
  paybackTime: number;
  trend: { direction: string; change7d: number };
  last14Days: unknown[];
}

interface MctqStatsView {
  profile: {
    baselineSleepNeed: number;
    method: string;
    confidence: number;
    basedOnDays: number;
    socialJetlag: number | null;
  } | null;
}

interface DailyNeedView {
  date: string;
  baseline_need: number;
  strain_addition: number;
  debt_addition: number;
  nap_subtraction: number;
  total_need: number;
  method: string;
  confidence: number;
  current_debt_hours: number;
}

interface InsufficientView {
  success: false;
  message?: string;
  error?: string;
}

interface EnergyCurveView {
  success: true;
  currentEnergy: number;
  currentZone: string;
  nextPeak: { hour: number; energy: number } | null;
  nextDip: { hour: number; energy: number } | null;
  melatoninWindow: { start: string; end: string };
  wakeTime: string;
  sleepDebtPenalty: number;
}

interface ChronotypeView {
  success: true;
  chronotype: string;
  averageWakeTime: string;
  averageSleepTime: string;
  melatoninWindowStart: string;
  melatoninWindowEnd: string;
  basedOnDays: number;
  confidence: number;
}

interface DataSufficiencyView {
  sufficient: boolean;
  totalDays: number;
  daysWithTimestamps: number;
  workdaysAvailable: number;
  freedaysAvailable: number;
  projectedConfidence: number;
  recommendation: string;
}

interface BaselineView {
  success: boolean;
  message?: string;
  error?: string;
  sleepNeedIdeal?: number;
  confidence?: number;
  method?: string;
  basedOnDays?: number;
}

function isInsufficient(result: {
  success?: boolean;
}): result is InsufficientView {
  return result.success === false;
}

export function buildSleepScienceTools(userId: string, tz: string) {
  return {
    sparky_get_sleep_science: tool({
      description:
        'Read sleep-science analytics: sleep debt (sleep_debt), MCTQ chronotype stats (mctq_stats), daily sleep need for a date (daily_need), circadian energy curve (energy_curve), chronotype summary (chronotype), data sufficiency check (data_sufficiency), and recalculate the baseline sleep need (recalculate_baseline). Mostly read-only; recalculate_baseline persists an updated baseline.',
      inputSchema: sleepScienceInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'sleep_debt'
        );

        const parsed = sleepScienceSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: SleepScienceInput = parsed.data;

        try {
          switch (args.action) {
            case 'sleep_debt': {
              const debt = (await sleepScienceService.calculateSleepDebt(
                userId
              )) as unknown as SleepDebtView;
              return [
                '# Sleep Debt',
                '',
                `- Current debt: ${debt.currentDebt} h (${debt.debtCategory})`,
                `- Sleep need: ${debt.sleepNeed} h`,
                `- Trend: ${debt.trend.direction} (${debt.trend.change7d >= 0 ? '+' : ''}${debt.trend.change7d} h over 7d)`,
                `- Estimated payback time: ${debt.paybackTime} day(s)`,
                `- Based on ${debt.last14Days.length} of last 14 days`,
              ].join('\n');
            }
            case 'mctq_stats': {
              const stats = (await sleepScienceService.getMCTQStats(
                userId
              )) as unknown as MctqStatsView;
              if (stats.profile === null) {
                return 'No MCTQ baseline profile has been calculated yet. Try recalculate_baseline once enough sleep history exists.';
              }
              const p = stats.profile;
              return [
                '# MCTQ Chronotype Stats',
                '',
                `- Baseline sleep need: ${p.baselineSleepNeed} h`,
                `- Method: ${p.method} (confidence ${p.confidence})`,
                `- Based on ${p.basedOnDays} days`,
                `- Social jetlag: ${p.socialJetlag ?? 'n/a'} h`,
              ].join('\n');
            }
            case 'daily_need': {
              const date = args.date ?? todayInZone(tz);
              const need = (await sleepScienceService.getDailyNeed(
                userId,
                date
              )) as unknown as DailyNeedView;
              return [
                `# Daily Sleep Need (${need.date})`,
                '',
                `- Total need: ${need.total_need} h`,
                `- Baseline: ${need.baseline_need} h`,
                `- Strain addition: ${need.strain_addition} h`,
                `- Debt addition: ${need.debt_addition} h`,
                `- Nap subtraction: ${need.nap_subtraction} h`,
                `- Method: ${need.method} (confidence ${need.confidence})`,
                `- Current debt: ${need.current_debt_hours} h`,
              ].join('\n');
            }
            case 'energy_curve': {
              const curve = (await sleepScienceService.getEnergyCurve(
                userId
              )) as unknown as EnergyCurveView | InsufficientView;
              if (isInsufficient(curve)) {
                return (
                  curve.message ??
                  'Not enough sleep history to compute an energy curve yet.'
                );
              }
              const peak = curve.nextPeak
                ? `${curve.nextPeak.hour}:00 (${curve.nextPeak.energy})`
                : 'n/a';
              const dip = curve.nextDip
                ? `${curve.nextDip.hour}:00 (${curve.nextDip.energy})`
                : 'n/a';
              return [
                '# Circadian Energy Curve',
                '',
                `- Current energy: ${curve.currentEnergy} (${curve.currentZone})`,
                `- Next peak: ${peak}`,
                `- Next dip: ${dip}`,
                `- Melatonin window: ${curve.melatoninWindow.start} – ${curve.melatoninWindow.end}`,
                `- Wake time: ${curve.wakeTime}`,
                `- Sleep-debt penalty: ${curve.sleepDebtPenalty}`,
              ].join('\n');
            }
            case 'chronotype': {
              const chrono = (await sleepScienceService.getChronotype(
                userId
              )) as unknown as ChronotypeView | InsufficientView;
              if (isInsufficient(chrono)) {
                return (
                  chrono.message ??
                  'Not enough sleep history to determine chronotype yet.'
                );
              }
              return [
                '# Chronotype',
                '',
                `- Chronotype: ${chrono.chronotype}`,
                `- Average wake time: ${chrono.averageWakeTime}`,
                `- Average sleep time: ${chrono.averageSleepTime}`,
                `- Melatonin window: ${chrono.melatoninWindowStart} – ${chrono.melatoninWindowEnd}`,
                `- Based on ${chrono.basedOnDays} days (confidence ${chrono.confidence})`,
              ].join('\n');
            }
            case 'data_sufficiency': {
              const suf = (await sleepScienceService.checkDataSufficiency(
                userId
              )) as unknown as DataSufficiencyView;
              return [
                '# Sleep Data Sufficiency',
                '',
                `- Sufficient: ${suf.sufficient ? 'yes' : 'no'}`,
                `- Total days: ${suf.totalDays} (${suf.daysWithTimestamps} with timestamps)`,
                `- Workdays available: ${suf.workdaysAvailable}`,
                `- Freedays available: ${suf.freedaysAvailable}`,
                `- Projected confidence: ${suf.projectedConfidence}`,
                `- Recommendation: ${suf.recommendation}`,
              ].join('\n');
            }
            case 'recalculate_baseline': {
              const result = (await sleepScienceService.calculateBaseline(
                userId,
                args.window_days ?? 90,
                tz
              )) as unknown as BaselineView;
              if (!result.success) {
                return (
                  result.message ??
                  'Not enough sleep history to recalculate the baseline yet.'
                );
              }
              return [
                '✅ Baseline sleep need recalculated.',
                '',
                `- Ideal sleep need: ${result.sleepNeedIdeal} h`,
                `- Method: ${result.method} (confidence ${result.confidence})`,
                `- Based on ${result.basedOnDays} days`,
              ].join('\n');
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as { action?: string }).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Sleep Science Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
