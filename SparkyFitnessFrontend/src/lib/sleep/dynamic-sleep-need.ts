/**
 * Dynamic Sleep Need Algorithm (WHOOP-style)
 *
 * Modelo Dinâmico de Necessidade de Sono
 *
 * Fórmula: Necessidade_Hoje = Base + Carga + Dívida - Sonecas
 *
 * - Base: Valor fixo do MCTQ corrigido (sleepNeedIdeal)
 * - Carga: Adicional por esforço fisiológico (training load acima da média)
 * - Dívida: Soma ponderada dos últimos 14 dias (decay exponencial)
 * - Sonecas: Subtração direta do tempo de soneca do dia
 *
 * Referência: WHOOP Sleep Need Protocol
 */

import {
  type DailySleepNeedBreakdown,
  type SleepNeedConfig,
  type SleepVitalsForCalculation,
  DEFAULT_SLEEP_NEED_CONFIG,
} from './sleep-need-types';
import { calculateTST } from './mctq-calculation';

// === CONSTANTS ===

/** Máximo de adição por strain (em horas) - cap de 45 minutos */
const MAX_STRAIN_ADDITION_HOURS = 0.75;

/** Máximo de adição por dívida (em horas) - evita metas inatingíveis */
const MAX_DEBT_ADDITION_HOURS = 2.0;

// === TYPES ===

/**
 * Input para cálculo de necessidade dinâmica
 */
export interface DynamicNeedInput {
  /** Necessidade base calculada (MCTQ) */
  baselineNeed: number;

  /** Training Load do dia anterior (0-100+) */
  trainingLoadYesterday: number | null;

  /** Média móvel do Training Load (30 dias) */
  trainingLoadAverage: number | null;

  /** Histórico de sono dos últimos 14 dias (ordenado do mais recente para mais antigo) */
  sleepHistory: Array<{
    date: string;
    tst: number;          // Total Sleep Time em horas
    sleepNeed: number;    // Necessidade daquele dia
  }>;

  /** Minutos de soneca hoje */
  napMinutesToday: number;

  /** Recovery Score do dia anterior (0-100) */
  recoveryScoreYesterday: number | null;

  /** Configuração */
  config?: SleepNeedConfig;
}

/**
 * Resultado do cálculo de dívida de sono
 */
export interface SleepDebtResult {
  /** Dívida total em horas */
  totalDebt: number;
  /** Categoria da dívida */
  category: 'low' | 'moderate' | 'high' | 'critical';
  /** Noites para quitar (assumindo +1h por noite) */
  paybackNights: number;
  /** Breakdown diário */
  dailyBreakdown: Array<{
    date: string;
    tst: number;
    need: number;
    deviation: number;
    weight: number;
    weightedDebt: number;
  }>;
}

// === UTILITY FUNCTIONS ===

/**
 * Calcula o peso exponencial para um dado índice de dia
 * Day 0 = mais recente (ontem), Day 13 = 14 dias atrás
 */
function calculateDayWeight(dayIndex: number, lambda: number): number {
  return Math.exp(-lambda * dayIndex);
}

/**
 * Obtém a categoria de dívida baseada nas horas
 */
function getDebtCategory(debtHours: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (debtHours <= 2) return 'low';
  if (debtHours <= 5) return 'moderate';
  if (debtHours <= 8) return 'high';
  return 'critical';
}

// === MAIN CALCULATION FUNCTIONS ===

/**
 * Calcula a necessidade de sono dinâmica para hoje
 *
 * @param input - Dados de entrada para o cálculo
 * @returns Breakdown da necessidade diária
 */
export function calculateDynamicSleepNeed(input: DynamicNeedInput): DailySleepNeedBreakdown {
  const config = input.config || DEFAULT_SLEEP_NEED_CONFIG;
  const { baselineNeed } = input;

  // === 1. STRAIN ADDITION ===
  let strainAddition = 0;
  if (input.trainingLoadYesterday !== null && input.trainingLoadAverage !== null) {
    const loadDelta = input.trainingLoadYesterday - input.trainingLoadAverage;
    if (loadDelta > 0) {
      // Cada ponto acima da média = strainFactor minutos extras
      strainAddition = (loadDelta * config.strainFactor) / 60; // Converter para horas
      // Cap no máximo permitido
      strainAddition = Math.min(strainAddition, MAX_STRAIN_ADDITION_HOURS);
    }
  }

  // === 2. DEBT ADDITION ===
  let debtAddition = 0;
  if (input.sleepHistory.length > 0) {
    // Calcular dívida com decay exponencial
    let weightedDebt = 0;

    for (let i = 0; i < Math.min(input.sleepHistory.length, config.debtWindowDays); i++) {
      const entry = input.sleepHistory[i];
      const deficit = entry.sleepNeed - entry.tst;
      const weight = calculateDayWeight(i, config.debtDecayLambda);

      if (deficit > 0) {
        weightedDebt += deficit * weight;
      }
    }

    // Aplicar limite máximo de dívida
    debtAddition = Math.min(weightedDebt, config.maxDebtHours);
  }

  // === 3. NAP SUBTRACTION ===
  const napSubtraction = input.napMinutesToday / 60; // Converter para horas

  // === 4. TOTAL ===
  const totalNeed = Math.max(
    config.minSleepNeed,
    baselineNeed + strainAddition + debtAddition - napSubtraction
  );

  // === 5. BUILD RESULT ===
  return {
    date: new Date().toISOString().split('T')[0],
    baseline: baselineNeed,
    strainAddition: Math.round(strainAddition * 100) / 100,
    debtAddition: Math.round(debtAddition * 100) / 100,
    napSubtraction: Math.round(napSubtraction * 100) / 100,
    totalNeed: Math.round(totalNeed * 100) / 100,
    context: {
      trainingLoadScore: input.trainingLoadYesterday,
      currentDebtHours: Math.round(debtAddition * 100) / 100,
      napMinutes: input.napMinutesToday,
      recoveryScoreYesterday: input.recoveryScoreYesterday,
    },
  };
}

/**
 * Calcula a dívida de sono com breakdown detalhado
 *
 * @param history - Histórico de vitais de sono (ordenado do mais recente)
 * @param sleepNeed - Necessidade base de sono
 * @param config - Configuração do sistema
 * @returns Resultado detalhado da dívida
 */
export function calculateSleepDebtDetailed(
  history: SleepVitalsForCalculation[],
  sleepNeed: number,
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): SleepDebtResult {
  const dailyBreakdown: SleepDebtResult['dailyBreakdown'] = [];
  let weightedDebtSum = 0;

  // Processar últimos 14 dias
  for (let i = 0; i < Math.min(history.length, config.debtWindowDays); i++) {
    const entry = history[i];
    const tst = calculateTST(entry);

    // Se não houver dados, imputar com necessidade (neutro)
    const actualTST = tst !== null ? tst : sleepNeed;
    const deviation = sleepNeed - actualTST;
    const weight = calculateDayWeight(i, config.debtDecayLambda);
    const weightedDebt = Math.max(0, deviation * weight);

    weightedDebtSum += deviation > 0 ? weightedDebt : 0;

    dailyBreakdown.push({
      date: entry.date,
      tst: Math.round(actualTST * 10) / 10,
      need: sleepNeed,
      deviation: Math.round(deviation * 10) / 10,
      weight: Math.round(weight * 100) / 100,
      weightedDebt: Math.round(weightedDebt * 100) / 100,
    });
  }

  // Clampar a dívida total
  const totalDebt = Math.max(0, Math.round(weightedDebtSum * 10) / 10);
  const category = getDebtCategory(totalDebt);
  const paybackNights = Math.ceil(totalDebt); // Assumindo +1h por noite

  return {
    totalDebt,
    category,
    paybackNights,
    dailyBreakdown,
  };
}

/**
 * Calcula a necessidade de sono para uma data específica
 * considerando histórico anterior
 *
 * @param targetDate - Data alvo (YYYY-MM-DD)
 * @param history - Histórico completo de vitais
 * @param baselineNeed - Necessidade base MCTQ
 * @param trainingData - Dados de treino (opcional)
 * @param config - Configuração do sistema
 * @returns Necessidade de sono para a data
 */
export function calculateNeedForDate(
  targetDate: string,
  history: SleepVitalsForCalculation[],
  baselineNeed: number,
  trainingData?: {
    loadOnDate: number | null;
    averageLoad: number | null;
  },
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): number {
  // Filtrar histórico para dados anteriores à data alvo
  const relevantHistory = history
    .filter((h) => h.date < targetDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, config.debtWindowDays);

  // Calcular dívida
  let debtAddition = 0;
  for (let i = 0; i < relevantHistory.length; i++) {
    const entry = relevantHistory[i];
    const tst = calculateTST(entry);
    const actualTST = tst !== null ? tst : baselineNeed;
    const deficit = baselineNeed - actualTST;

    if (deficit > 0) {
      const weight = calculateDayWeight(i, config.debtDecayLambda);
      debtAddition += deficit * weight;
    }
  }

  debtAddition = Math.min(debtAddition, config.maxDebtHours);

  // Calcular strain
  let strainAddition = 0;
  if (trainingData && trainingData.loadOnDate !== null && trainingData.averageLoad !== null) {
    const loadDelta = trainingData.loadOnDate - trainingData.averageLoad;
    if (loadDelta > 0) {
      strainAddition = Math.min((loadDelta * config.strainFactor) / 60, MAX_STRAIN_ADDITION_HOURS);
    }
  }

  return Math.max(
    config.minSleepNeed,
    baselineNeed + strainAddition + debtAddition
  );
}

/**
 * Gera histórico de necessidade de sono para um período
 *
 * @param startDate - Data inicial (YYYY-MM-DD)
 * @param endDate - Data final (YYYY-MM-DD)
 * @param history - Histórico completo de vitais
 * @param baselineNeed - Necessidade base MCTQ
 * @param config - Configuração do sistema
 * @returns Array de { date, need }
 */
export function generateNeedHistory(
  startDate: string,
  endDate: string,
  history: SleepVitalsForCalculation[],
  baselineNeed: number,
  config: SleepNeedConfig = DEFAULT_SLEEP_NEED_CONFIG
): Array<{ date: string; need: number }> {
  const result: Array<{ date: string; need: number }> = [];

  // Gerar range de datas
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const need = calculateNeedForDate(dateStr, history, baselineNeed, undefined, config);

    result.push({
      date: dateStr,
      need: Math.round(need * 100) / 100,
    });
  }

  return result;
}

// === FORMATTING HELPERS ===

/**
 * Formata duração de sono para exibição (ABNT NBR 5892:2019)
 *
 * Formato: 7h40min (sem espaço entre elementos)
 */
export function formatSleepNeed(hours: number): string {
  if (hours === null || hours === undefined || isNaN(hours)) {
    return '—';
  }

  const h = Math.floor(Math.abs(hours));
  const m = Math.round((Math.abs(hours) - h) * 60);

  // Ajustar se minutos arredondaram para 60
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
 * Retorna label da categoria de dívida em português
 */
export function getDebtCategoryLabel(category: SleepDebtResult['category']): string {
  const labels = {
    low: 'Baixa',
    moderate: 'Moderada',
    high: 'Alta',
    critical: 'Crítica',
  };
  return labels[category];
}

/**
 * Retorna cor da categoria de dívida (Tailwind classes)
 */
export function getDebtCategoryColor(category: SleepDebtResult['category']): {
  bg: string;
  text: string;
  border: string;
} {
  const colors = {
    low: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
    moderate: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  };
  return colors[category];
}

/**
 * Retorna descrição explicativa do breakdown de necessidade
 */
export function getNeedBreakdownExplanation(breakdown: DailySleepNeedBreakdown): string {
  const parts: string[] = [];

  parts.push(`Sua necessidade base de sono é ${formatSleepNeed(breakdown.baseline)}.`);

  if (breakdown.strainAddition > 0) {
    parts.push(
      `Como você treinou mais intensamente ontem, adicionamos ${Math.round(breakdown.strainAddition * 60)} minutos.`
    );
  }

  if (breakdown.debtAddition > 0) {
    parts.push(
      `Você tem ${formatSleepNeed(breakdown.debtAddition)} de dívida acumulada a recuperar.`
    );
  }

  if (breakdown.napSubtraction > 0) {
    parts.push(
      `As sonecas de hoje subtraem ${Math.round(breakdown.napSubtraction * 60)} minutos da sua necessidade.`
    );
  }

  return parts.join(' ');
}
