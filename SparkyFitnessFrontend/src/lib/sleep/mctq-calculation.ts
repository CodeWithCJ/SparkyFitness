/**
 * MCTQ Calculation Algorithm
 *
 * Cálculo MCTQ Corrigido (Munich Chronotype Questionnaire - Roenneberg Protocol)
 *
 * Fórmulas principais:
 * - SD_week = (5 × SD_W + 2 × SD_F) / 7
 * - SN_ideal = SD_F - (SD_F - SD_week) / 2
 * - Social Jetlag = |MSF - MSW|
 * - MSF_sc = MSF - (SD_F - SD_week) / 2 (Mid-sleep corrigido)
 *
 * Referência: Roenneberg et al., 2019 (MCTQ)
 */

import {
  type DayType,
  type MCTQResult,
  type SleepNeedConfig,
  type SleepVitalsForCalculation,
  type CalculationConfidence,
  DEFAULT_SLEEP_NEED_CONFIG,
} from './sleep-need-types';
import { classifyDaysAutomatically } from './day-classification';

// === UTILITY FUNCTIONS ===

/**
 * Calcula a média de um array de números
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calcula a mediana de um array de Dates (retorna a mediana)
 */
function medianDate(dates: Date[]): Date {
  if (dates.length === 0) {
    return new Date();
  }

  // Converter para timestamps e ordenar
  const sorted = dates.map((d) => d.getTime()).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    // Média dos dois valores centrais
    return new Date((sorted[mid - 1] + sorted[mid]) / 2);
  }

  return new Date(sorted[mid]);
}

/**
 * Calcula a diferença em horas entre duas Dates (considerando apenas o horário)
 */
function getHoursDifference(date1: Date, date2: Date): number {
  const hours1 = date1.getHours() + date1.getMinutes() / 60;
  const hours2 = date2.getHours() + date2.getMinutes() / 60;

  // Lidar com cruzamento de meia-noite
  let diff = hours1 - hours2;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;

  return diff;
}

/**
 * Calcula o Total Sleep Time (TST) de uma entrada de vitais
 */
export function calculateTST(entry: SleepVitalsForCalculation): number | null {
  // Tentar calcular a partir de estágios de sono
  if (
    entry.deepSleepMinutes !== undefined &&
    entry.remSleepMinutes !== undefined &&
    entry.lightSleepMinutes !== undefined
  ) {
    const totalMinutes =
      (entry.deepSleepMinutes || 0) +
      (entry.remSleepMinutes || 0) +
      (entry.lightSleepMinutes || 0);

    if (totalMinutes > 0) {
      return totalMinutes / 60; // Converter para horas
    }
  }

  // Fallback para duração de sono se disponível
  if (entry.sleepDurationHours !== undefined && entry.sleepDurationHours > 0) {
    return entry.sleepDurationHours;
  }

  return null;
}

/**
 * Calcula o mid-sleep (ponto médio do sono)
 */
function calculateMidSleep(entry: SleepVitalsForCalculation): Date | null {
  if (!entry.sleepStartTimestampGMT || !entry.sleepEndTimestampGMT) {
    return null;
  }

  const start = entry.sleepStartTimestampGMT * 1000;
  const end = entry.sleepEndTimestampGMT * 1000;
  const midpoint = start + (end - start) / 2;

  return new Date(midpoint);
}

/**
 * Filtra entradas de sono com qualidade válida
 */
function filterValidSleepEntries(
  history: SleepVitalsForCalculation[],
  config: SleepNeedConfig
): SleepVitalsForCalculation[] {
  return history.filter((entry) => {
    const tst = calculateTST(entry);

    // Deve ter dados de sono
    if (tst === null) return false;

    // Duração plausível (entre 3h e 14h)
    if (tst < 3 || tst > 14) return false;

    // Deve ter timestamps
    if (!entry.sleepStartTimestampGMT || !entry.sleepEndTimestampGMT) return false;

    // Timestamps coerentes
    if (entry.sleepEndTimestampGMT < entry.sleepStartTimestampGMT) return false;

    // Verificar campo de validação Garmin se disponível
    if (entry.validation) {
      const validStatuses = ['AUTO_FINAL', 'ENHANCED_FINAL'];
      if (!validStatuses.includes(entry.validation)) {
        // Permitir 'DEVICE' condicionalmente
        if (entry.validation !== 'DEVICE') return false;
      }
    }

    return true;
  });
}

// === MAIN CALCULATION FUNCTION ===

/**
 * Calcula os parâmetros MCTQ baseado no histórico de sono
 *
 * @param history - Array de dados de sono diários
 * @param dayClassification - Map de classificação de dias (opcional, será calculado se não fornecido)
 * @param config - Configuração do sistema (opcional)
 * @returns Resultado MCTQ ou null se dados insuficientes
 */
export function calculateMCTQ(
  history: SleepVitalsForCalculation[],
  dayClassification?: Map<number, DayType>,
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): MCTQResult | null {
  // 0. Filtrar entradas válidas
  const validHistory = filterValidSleepEntries(history, config);

  // 1. Calcular ou usar classificação de dias fornecida
  const classification = dayClassification || classifyDaysAutomatically(validHistory, config);

  // 2. Separar dados por tipo de dia
  const workdayData: { tst: number; midSleep: Date }[] = [];
  const freedayData: { tst: number; midSleep: Date }[] = [];

  for (const entry of validHistory) {
    const tst = calculateTST(entry);
    if (tst === null) continue;

    // Obter dia da semana
    const date = new Date(entry.date + 'T12:00:00');
    const dayOfWeek = date.getDay();
    const dayType = classification.get(dayOfWeek) || 'workday';

    // Calcular mid-sleep
    const midSleep = calculateMidSleep(entry);
    if (!midSleep) continue;

    if (dayType === 'workday') {
      workdayData.push({ tst, midSleep });
    } else {
      freedayData.push({ tst, midSleep });
    }
  }

  // 3. Verificar dados mínimos
  if (
    workdayData.length < config.minWorkdaysForCalculation ||
    freedayData.length < config.minFreedaysForCalculation
  ) {
    return null; // Dados insuficientes
  }

  // 4. Calcular médias
  const SD_W = mean(workdayData.map((d) => d.tst));
  const SD_F = mean(freedayData.map((d) => d.tst));

  // 5. Calcular média semanal ponderada
  const SD_week = (5 * SD_W + 2 * SD_F) / 7;

  // 6. Calcular necessidade corrigida (fórmula MCTQ)
  let SN_ideal: number;
  if (SD_F > SD_W) {
    // Usuário dorme mais nos fins de semana (típico)
    // Corrigir: metade do excesso é recuperação de dívida
    SN_ideal = SD_F - (SD_F - SD_week) / 2;
  } else {
    // Caso atípico: usa média semanal
    SN_ideal = SD_week;
  }

  // 7. Aplicar limites biológicos
  SN_ideal = Math.max(config.minSleepNeed, Math.min(config.maxSleepNeed, SN_ideal));

  // 8. Calcular mid-sleep e Social Jetlag
  const MSW = medianDate(workdayData.map((d) => d.midSleep));
  const MSF = medianDate(freedayData.map((d) => d.midSleep));
  const socialJetlag = Math.abs(getHoursDifference(MSF, MSW));

  // 9. Calcular MSF corrigido (sem oversleep de recuperação)
  let MSF_sc = new Date(MSF);
  if (SD_F > SD_W) {
    const overSleepHours = (SD_F - SD_W) / 2;
    MSF_sc = new Date(MSF.getTime() - overSleepHours * 60 * 60 * 1000);
  }

  // 10. Determinar confiança
  let confidence: CalculationConfidence;
  if (workdayData.length >= 40 && freedayData.length >= 16) {
    confidence = 'high';
  } else if (workdayData.length >= 20 && freedayData.length >= 8) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // 11. Determinar período de dados
  const dates = validHistory.map((h) => h.date).sort();
  const dataStartDate = dates[0] || '';
  const dataEndDate = dates[dates.length - 1] || '';

  return {
    sdWorkday: Math.round(SD_W * 100) / 100,
    sdFreeday: Math.round(SD_F * 100) / 100,
    sdWeek: Math.round(SD_week * 100) / 100,
    sleepNeedIdeal: Math.round(SN_ideal * 100) / 100,
    socialJetlag: Math.round(socialJetlag * 100) / 100,
    midSleepWorkday: MSW,
    midSleepFreeday: MSF,
    midSleepCorrected: MSF_sc,
    workdaysCount: workdayData.length,
    freedaysCount: freedayData.length,
    confidence,
    dataStartDate,
    dataEndDate,
  };
}

/**
 * Calcula apenas a necessidade de sono ideal usando método MCTQ simplificado
 * (útil quando não precisamos de todos os parâmetros)
 *
 * @param history - Array de dados de sono diários
 * @param config - Configuração do sistema
 * @returns Necessidade de sono em horas ou null se dados insuficientes
 */
export function calculateSleepNeedIdealSimple(
  history: SleepVitalsForCalculation[],
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): number | null {
  const mctq = calculateMCTQ(history, undefined, config);
  return mctq?.sleepNeedIdeal || null;
}

/**
 * Verifica se há dados suficientes para cálculo MCTQ confiável
 *
 * @param history - Array de dados de sono diários
 * @param config - Configuração do sistema
 * @returns Objeto com status e detalhes
 */
export function hasSufficientDataForMCTQ(
  history: SleepVitalsForCalculation[],
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): {
  sufficient: boolean;
  workdaysAvailable: number;
  freedaysAvailable: number;
  workdaysNeeded: number;
  freedaysNeeded: number;
  projectedConfidence: CalculationConfidence;
  recommendation: string;
} {
  const validHistory = filterValidSleepEntries(history, config);
  const classification = classifyDaysAutomatically(validHistory, config);

  let workdays = 0;
  let freedays = 0;

  for (const entry of validHistory) {
    const date = new Date(entry.date + 'T12:00:00');
    const dayOfWeek = date.getDay();
    const dayType = classification.get(dayOfWeek) || 'workday';

    if (dayType === 'workday') {
      workdays++;
    } else {
      freedays++;
    }
  }

  const sufficient =
    workdays >= config.minWorkdaysForCalculation &&
    freedays >= config.minFreedaysForCalculation;

  let projectedConfidence: CalculationConfidence;
  if (workdays >= 40 && freedays >= 16) {
    projectedConfidence = 'high';
  } else if (workdays >= 20 && freedays >= 8) {
    projectedConfidence = 'medium';
  } else {
    projectedConfidence = 'low';
  }

  let recommendation: string;
  if (sufficient) {
    if (projectedConfidence === 'high') {
      recommendation = 'Excelente! Dados suficientes para cálculo de alta confiança.';
    } else if (projectedConfidence === 'medium') {
      recommendation = 'Bom! Dados suficientes para cálculo de confiança média.';
    } else {
      recommendation = 'Dados mínimos disponíveis. Continue usando o app para melhorar a precisão.';
    }
  } else {
    const workdaysMissing = Math.max(0, config.minWorkdaysForCalculation - workdays);
    const freedaysMissing = Math.max(0, config.minFreedaysForCalculation - freedays);

    if (workdaysMissing > 0 && freedaysMissing > 0) {
      recommendation = `Mais ${workdaysMissing} dias de trabalho e ${freedaysMissing} dias livres necessários.`;
    } else if (workdaysMissing > 0) {
      recommendation = `Mais ${workdaysMissing} dias de trabalho necessários para o cálculo.`;
    } else {
      recommendation = `Mais ${freedaysMissing} dias livres necessários para o cálculo.`;
    }
  }

  return {
    sufficient,
    workdaysAvailable: workdays,
    freedaysAvailable: freedays,
    workdaysNeeded: config.minWorkdaysForCalculation,
    freedaysNeeded: config.minFreedaysForCalculation,
    projectedConfidence,
    recommendation,
  };
}

/**
 * Formata o mid-sleep para exibição (HH:MM)
 */
export function formatMidSleep(midSleep: Date): string {
  const hours = midSleep.getHours().toString().padStart(2, '0');
  const minutes = midSleep.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formata horas decimais para exibição (ABNT NBR 5892:2019)
 * Formato: 7h40min (sem espaço)
 */
export function formatHoursDecimal(hours: number): string {
  if (hours === null || hours === undefined || isNaN(hours)) {
    return '—';
  }

  const h = Math.floor(Math.abs(hours));
  const m = Math.round((Math.abs(hours) - h) * 60);

  let finalH = h;
  let finalM = m;
  if (finalM >= 60) {
    finalM = 0;
    finalH += 1;
  }

  const prefix = hours < 0 ? '-' : '';

  if (finalH === 0) return `${prefix}${finalM}min`;
  if (finalM === 0) return `${prefix}${finalH}h`;
  return `${prefix}${finalH}h${finalM}min`;
}
