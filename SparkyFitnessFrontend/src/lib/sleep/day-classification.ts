/**
 * Day Classification Algorithm
 *
 * Classifica dias como WorkDay ou FreeDay usando análise de variância
 * do horário de despertar, baseado no protocolo MCTQ.
 *
 * Algoritmo:
 * 1. Calcular variância do wake time para cada dia da semana (últimos 90 dias)
 * 2. Dias com baixa variância (<20min) e horário cedo = WorkDay
 * 3. Dias com alta variância (>45min) e horário tardio = FreeDay
 * 4. Fallback: Sáb/Dom = FreeDay, Seg-Sex = WorkDay
 *
 * Referência: MCTQ Protocol (Roenneberg)
 */

import {
  type DayType,
  type DayOfWeekStats,
  type SleepNeedConfig,
  type SleepVitalsForCalculation,
  DEFAULT_SLEEP_NEED_CONFIG,
} from './sleep-need-types';

// === CONSTANTS ===

/** Nomes dos dias da semana em português */
export const DAY_NAMES_PT = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/** Nomes abreviados dos dias */
export const DAY_NAMES_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Mínimo de amostras por dia da semana para análise */
const MIN_SAMPLES_PER_DAY = 3;

// === UTILITY FUNCTIONS ===

/**
 * Calcula a média de um array de números
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calcula o desvio padrão de um array de números
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Extrai a hora decimal do timestamp de despertar
 */
function getWakeHourFromTimestamp(timestampGMT: number): number {
  const date = new Date(timestampGMT * 1000);
  return date.getHours() + date.getMinutes() / 60;
}

/**
 * Obtém o dia da semana de uma data string (YYYY-MM-DD)
 */
function getDayOfWeek(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00');
  return date.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
}

// === MAIN CLASSIFICATION FUNCTION ===

/**
 * Classifica automaticamente os dias da semana como WorkDay ou FreeDay
 * baseado na variância do horário de despertar.
 *
 * @param history - Array de dados de sono diários
 * @param config - Configuração do sistema (opcional)
 * @returns Map de dia da semana (0-6) para tipo de dia
 */
export function classifyDaysAutomatically(
  history: SleepVitalsForCalculation[],
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): Map<number, DayType> {
  // 1. Agrupar wake times por dia da semana
  const byDayOfWeek = new Map<number, number[]>();

  for (const entry of history) {
    if (!entry.sleepEndTimestampGMT) continue;

    const dayOfWeek = getDayOfWeek(entry.date);
    const wakeHour = getWakeHourFromTimestamp(entry.sleepEndTimestampGMT);

    if (!byDayOfWeek.has(dayOfWeek)) {
      byDayOfWeek.set(dayOfWeek, []);
    }
    byDayOfWeek.get(dayOfWeek)!.push(wakeHour);
  }

  // 2. Calcular estatísticas por dia
  const stats: DayOfWeekStats[] = [];

  for (const [dayOfWeek, wakeHours] of byDayOfWeek) {
    if (wakeHours.length < MIN_SAMPLES_PER_DAY) continue;

    const meanWake = mean(wakeHours);
    const stdDev = standardDeviation(wakeHours);
    const varianceMinutes = stdDev * 60; // Converter para minutos

    stats.push({
      dayOfWeek,
      meanWakeHour: meanWake,
      varianceMinutes,
      sampleCount: wakeHours.length,
      inferredDayType: 'workday', // Será definido abaixo
    });
  }

  // 3. Calcular média global do wake time para comparação
  const allWakeHours = stats.map((s) => s.meanWakeHour);
  const globalMeanWake = mean(allWakeHours);

  // 4. Classificar cada dia baseado em variância e horário
  const classification = new Map<number, DayType>();

  for (const stat of stats) {
    let dayType: DayType;

    if (
      stat.varianceMinutes < config.workdayWakeVarianceThreshold &&
      stat.meanWakeHour < globalMeanWake
    ) {
      // Baixa variância + horário cedo = WorkDay
      dayType = 'workday';
    } else if (
      stat.varianceMinutes > config.freedayWakeVarianceThreshold &&
      stat.meanWakeHour > globalMeanWake
    ) {
      // Alta variância + horário tardio = FreeDay
      dayType = 'freeday';
    } else {
      // Caso ambíguo: usar fallback tradicional
      dayType = stat.dayOfWeek === 0 || stat.dayOfWeek === 6 ? 'freeday' : 'workday';
    }

    stat.inferredDayType = dayType;
    classification.set(stat.dayOfWeek, dayType);
  }

  // 5. Preencher dias faltantes com fallback tradicional
  for (let d = 0; d < 7; d++) {
    if (!classification.has(d)) {
      classification.set(d, d === 0 || d === 6 ? 'freeday' : 'workday');
    }
  }

  return classification;
}

/**
 * Gera estatísticas detalhadas por dia da semana
 *
 * @param history - Array de dados de sono diários
 * @param config - Configuração do sistema (opcional)
 * @returns Array de estatísticas com classificação
 */
export function getDayOfWeekStats(
  history: SleepVitalsForCalculation[],
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): DayOfWeekStats[] {
  const classification = classifyDaysAutomatically(history, config);

  // Agrupar por dia da semana
  const byDayOfWeek = new Map<number, number[]>();

  for (const entry of history) {
    if (!entry.sleepEndTimestampGMT) continue;

    const dayOfWeek = getDayOfWeek(entry.date);
    const wakeHour = getWakeHourFromTimestamp(entry.sleepEndTimestampGMT);

    if (!byDayOfWeek.has(dayOfWeek)) {
      byDayOfWeek.set(dayOfWeek, []);
    }
    byDayOfWeek.get(dayOfWeek)!.push(wakeHour);
  }

  // Gerar estatísticas para todos os 7 dias
  const stats: DayOfWeekStats[] = [];

  for (let d = 0; d < 7; d++) {
    const wakeHours = byDayOfWeek.get(d) || [];
    const meanWake = wakeHours.length > 0 ? mean(wakeHours) : 0;
    const stdDev = wakeHours.length > 1 ? standardDeviation(wakeHours) : 0;

    stats.push({
      dayOfWeek: d,
      meanWakeHour: Math.round(meanWake * 100) / 100,
      varianceMinutes: Math.round(stdDev * 60 * 100) / 100,
      sampleCount: wakeHours.length,
      inferredDayType: classification.get(d) || (d === 0 || d === 6 ? 'freeday' : 'workday'),
    });
  }

  return stats;
}

/**
 * Classifica uma data específica como WorkDay ou FreeDay
 *
 * @param dateStr - Data no formato YYYY-MM-DD
 * @param classification - Map de classificação pré-calculado
 * @returns Tipo do dia
 */
export function classifySpecificDate(
  dateStr: string,
  classification: Map<number, DayType>
): DayType {
  const dayOfWeek = getDayOfWeek(dateStr);
  return classification.get(dayOfWeek) || (dayOfWeek === 0 || dayOfWeek === 6 ? 'freeday' : 'workday');
}

/**
 * Verifica se há dados suficientes para classificação automática confiável
 *
 * @param history - Array de dados de sono diários
 * @returns Objeto com status e detalhes
 */
export function hasEnoughDataForClassification(history: SleepVitalsForCalculation[]): {
  sufficient: boolean;
  totalDays: number;
  daysWithWakeData: number;
  uniqueDaysOfWeek: number;
  recommendation: string;
} {
  const withWakeData = history.filter((h) => h.sleepEndTimestampGMT);
  const daysOfWeek = new Set(withWakeData.map((h) => getDayOfWeek(h.date)));

  const sufficient = withWakeData.length >= 21 && daysOfWeek.size >= 6;

  let recommendation: string;
  if (sufficient) {
    recommendation = 'Dados suficientes para classificação automática de dias.';
  } else if (withWakeData.length < 21) {
    recommendation = `Mais ${21 - withWakeData.length} dias de dados necessários para classificação confiável.`;
  } else {
    recommendation = `Dados de mais dias da semana necessários (${daysOfWeek.size}/7 disponíveis).`;
  }

  return {
    sufficient,
    totalDays: history.length,
    daysWithWakeData: withWakeData.length,
    uniqueDaysOfWeek: daysOfWeek.size,
    recommendation,
  };
}

/**
 * Formata hora decimal para string legível (HH:MM)
 */
export function formatDecimalHour(decimalHour: number): string {
  const hours = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Retorna label do tipo de dia em português
 */
export function getDayTypeLabel(dayType: DayType): string {
  return dayType === 'workday' ? 'Dia de Trabalho' : 'Dia Livre';
}

/**
 * Retorna label curto do tipo de dia
 */
export function getDayTypeLabelShort(dayType: DayType): string {
  return dayType === 'workday' ? 'Trabalho' : 'Livre';
}
