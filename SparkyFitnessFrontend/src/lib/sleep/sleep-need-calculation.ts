/**
 * Sleep Need Calculation - RISE-style methodology
 *
 * Calcula a necessidade de sono usando:
 * 1. TODO o histórico disponível (sem limite de tempo)
 * 2. Apenas noites "recuperadas" (após 3+ dias de bom sono)
 * 3. Média móvel ponderada com decay exponencial (prioriza dados recentes)
 *
 * Baseado na metodologia do app RISE e pesquisa científica.
 */

export interface SleepNeedCalculationResult {
  /** Necessidade calculada em horas (média ponderada) */
  sleepNeedHours: number;
  /** Necessidade formatada (ex: "7h 40min") */
  sleepNeedFormatted: string;
  /** Confiança do cálculo */
  confidence: 'high' | 'medium' | 'low';
  /** Total de noites "recuperadas" usadas no cálculo */
  recoveredNightsCount: number;
  /** Soma dos pesos (indica quanto os dados recentes contribuem) */
  totalWeight: number;
  /** Média dos últimos 90 dias (para comparação) */
  recent90DaysAvg: number | null;
  /** Média do último ano */
  lastYearAvg: number | null;
  /** Média histórica (mais de 1 ano) */
  historicalAvg: number | null;
  /** Data do primeiro registro usado */
  dataStartDate: string;
  /** Data do último registro usado */
  dataEndDate: string;
  /** Lambda usado no decay exponencial */
  decayLambda: number;
}

export interface SleepNeedCalculationConfig {
  /**
   * Lambda para decay exponencial.
   * Maior = dados antigos perdem peso mais rápido
   * 0.002 = half-life de ~347 dias (~1 ano)
   * 0.001 = half-life de ~693 dias (~2 anos)
   */
  decayLambda: number;
  /** Mínimo de horas para considerar "bom sono" nos 3 dias anteriores */
  goodSleepThreshold: number;
  /** Mínimo de noites recuperadas para confiança alta */
  highConfidenceMinNights: number;
  /** Mínimo de noites recuperadas para confiança média */
  mediumConfidenceMinNights: number;
  /** TST mínimo para filtrar outliers */
  minTstHours: number;
  /** TST máximo para filtrar outliers */
  maxTstHours: number;
}

export const DEFAULT_SLEEP_NEED_CALC_CONFIG: SleepNeedCalculationConfig = {
  decayLambda: 0.002,         // Half-life ~1 ano
  goodSleepThreshold: 7.0,    // 7h = bom sono
  highConfidenceMinNights: 100,
  mediumConfidenceMinNights: 30,
  minTstHours: 4.0,
  maxTstHours: 12.0,
};

/**
 * SQL query para calcular necessidade de sono com média móvel ponderada
 *
 * @param athleteId - UUID do atleta
 * @param config - Configuração do cálculo
 * @returns SQL query string
 */
export function buildSleepNeedQuery(athleteId: string, config: SleepNeedCalculationConfig = DEFAULT_SLEEP_NEED_CALC_CONFIG): string {
  return `
    WITH sleep_data AS (
      SELECT
        data,
        (deep_sleep_minutes + rem_sleep_minutes + light_sleep_minutes) / 60.0 as tst,
        (CURRENT_DATE - data) as days_ago,
        LAG((deep_sleep_minutes + rem_sleep_minutes + light_sleep_minutes) / 60.0, 1) OVER (ORDER BY data) as tst_d1,
        LAG((deep_sleep_minutes + rem_sleep_minutes + light_sleep_minutes) / 60.0, 2) OVER (ORDER BY data) as tst_d2,
        LAG((deep_sleep_minutes + rem_sleep_minutes + light_sleep_minutes) / 60.0, 3) OVER (ORDER BY data) as tst_d3
      FROM daily_vitals
      WHERE athlete_id = '${athleteId}'
        AND deep_sleep_minutes IS NOT NULL
    ),
    recovered_nights AS (
      SELECT
        data,
        tst,
        days_ago,
        EXP(-${config.decayLambda} * days_ago) as weight
      FROM sleep_data
      WHERE tst_d1 >= ${config.goodSleepThreshold}
        AND tst_d2 >= ${config.goodSleepThreshold}
        AND tst_d3 >= ${config.goodSleepThreshold}
        AND tst >= ${config.minTstHours}
        AND tst <= ${config.maxTstHours}
    )
    SELECT
      COUNT(*) as recovered_nights_count,
      ROUND((SUM(tst * weight) / NULLIF(SUM(weight), 0))::numeric, 2) as weighted_avg,
      ROUND(SUM(weight)::numeric, 2) as total_weight,
      ROUND(AVG(tst) FILTER (WHERE days_ago <= 90)::numeric, 2) as recent_90d_avg,
      ROUND(AVG(tst) FILTER (WHERE days_ago <= 365)::numeric, 2) as last_year_avg,
      ROUND(AVG(tst) FILTER (WHERE days_ago > 365)::numeric, 2) as historical_avg,
      MIN(data) as data_start,
      MAX(data) as data_end
    FROM recovered_nights
  `;
}

/**
 * Formata horas decimais para string legível (ABNT NBR 5892:2019)
 * Formato: 7h40min (sem espaço)
 */
export function formatSleepHours(hours: number): string {
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

/**
 * Determina a confiança baseada no número de noites
 */
export function calculateConfidence(
  recoveredNightsCount: number,
  config: SleepNeedCalculationConfig = DEFAULT_SLEEP_NEED_CALC_CONFIG
): 'high' | 'medium' | 'low' {
  if (recoveredNightsCount >= config.highConfidenceMinNights) return 'high';
  if (recoveredNightsCount >= config.mediumConfidenceMinNights) return 'medium';
  return 'low';
}

/**
 * Processa o resultado da query de necessidade de sono
 */
export function processSleepNeedQueryResult(
  row: {
    recovered_nights_count: string;
    weighted_avg: string | null;
    total_weight: string | null;
    recent_90d_avg: string | null;
    last_year_avg: string | null;
    historical_avg: string | null;
    data_start: string | null;
    data_end: string | null;
  },
  config: SleepNeedCalculationConfig = DEFAULT_SLEEP_NEED_CALC_CONFIG
): SleepNeedCalculationResult | null {
  const recoveredNightsCount = parseInt(row.recovered_nights_count) || 0;

  if (recoveredNightsCount === 0 || !row.weighted_avg) {
    return null;
  }

  const sleepNeedHours = parseFloat(row.weighted_avg);

  return {
    sleepNeedHours,
    sleepNeedFormatted: formatSleepHours(sleepNeedHours),
    confidence: calculateConfidence(recoveredNightsCount, config),
    recoveredNightsCount,
    totalWeight: parseFloat(row.total_weight || '0'),
    recent90DaysAvg: row.recent_90d_avg ? parseFloat(row.recent_90d_avg) : null,
    lastYearAvg: row.last_year_avg ? parseFloat(row.last_year_avg) : null,
    historicalAvg: row.historical_avg ? parseFloat(row.historical_avg) : null,
    dataStartDate: row.data_start || '',
    dataEndDate: row.data_end || '',
    decayLambda: config.decayLambda,
  };
}
