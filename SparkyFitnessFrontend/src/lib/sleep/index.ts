/**
 * Sleep Science Library
 *
 * Pure mathematical functions for sleep analysis:
 * - Two-Process Model (Borbély) for circadian rhythm
 * - MCTQ (Roenneberg) for chronotype detection
 * - RISE/WHOOP-style sleep debt calculation
 * - Dynamic sleep need with strain/debt decomposition
 */

// Types and constants
export * from './circadian-types';
export * from './sleep-need-types';

// Core algorithms
export * from './chronotype';
export * from './circadian-math';
export * from './day-classification';
export * from './energy-curve';
export * from './mctq-calculation';
export * from './sleep-need-calculation';

// Sleep debt (has getDebtCategoryLabel)
export * from './sleep-debt';

// Dynamic sleep need — re-export selectively to avoid conflict with sleep-debt's getDebtCategoryLabel
export {
    calculateDynamicSleepNeed, calculateNeedForDate, calculateSleepDebtDetailed, formatSleepNeed, generateNeedHistory, getDebtCategoryColor,
    getNeedBreakdownExplanation,
    type DynamicNeedInput,
    type SleepDebtResult
} from './dynamic-sleep-need';

// Theme
export * from './whoop-colors';
