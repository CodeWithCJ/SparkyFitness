/**
 * Sleep Need Scientific Types
 *
 * Baseado no protocolo MCTQ (Munich Chronotype Questionnaire) de Roenneberg
 * e modelo dinâmico WHOOP.
 *
 * Referências:
 * - Roenneberg et al., 2019 - Chronotype and Social Jetlag: A (Self-) Critical Review
 * - Borbély, A. A. (1982) - A two process model of sleep regulation
 * - Rise Science / WHOOP - Sleep Need Calculation
 */

// === MÉTODOS DE CÁLCULO ===

/**
 * Métodos disponíveis para cálculo de necessidade de sono base
 */
export type SleepNeedMethod =
  | 'mctq_corrected'     // Método B: Roenneberg corrigido (SN_ideal = SD_F - (SD_F - SD_week) / 2)
  | 'rise_percentile'    // Método A: Percentil 90 dias livres
  | 'satiation_point'    // Ponto onde recovery estabiliza acima de 70%
  | 'manual'             // Definido manualmente pelo usuário
  | 'default';           // Fallback 8.25h

/**
 * Nível de confiança no cálculo
 */
export type CalculationConfidence = 'low' | 'medium' | 'high';

// === CLASSIFICAÇÃO DE DIAS ===

/**
 * Tipo de dia para cálculo MCTQ
 * - workday: Dias de trabalho (tipicamente Seg-Sex)
 * - freeday: Dias livres (tipicamente Sab-Dom)
 */
export type DayType = 'workday' | 'freeday';

/**
 * Classificação de um dia específico
 */
export interface DayClassification {
  /** Data no formato YYYY-MM-DD */
  date: string;
  /** Tipo do dia (trabalho ou livre) */
  dayType: DayType;
  /** Horário de despertar */
  wakeTime: Date | null;
  /** Horário de dormir */
  sleepTime: Date | null;
  /** Total Sleep Time em horas */
  tst: number | null;
  /** Status de validação dos dados */
  validationStatus: DataValidationStatus;
}

// === VALIDAÇÃO DE DADOS GARMIN ===

/**
 * Status de validação dos dados de sono Garmin
 * Referência: Garmin Health API Documentation
 */
export type GarminSleepValidation =
  | 'MANUAL'           // Excluir: dados inseridos manualmente
  | 'DEVICE'           // Condicional: modo sono ativado manualmente
  | 'AUTO_TENTATIVE'   // Excluir: processamento pendente
  | 'AUTO_FINAL'       // Incluir: detecção automática finalizada
  | 'ENHANCED_FINAL';  // Alta prioridade: VFC para estágios precisos

/**
 * Status de validação dos dados para cálculos
 */
export type DataValidationStatus = 'valid' | 'excluded' | 'conditional';

// === RESULTADO MCTQ ===

/**
 * Resultado do cálculo MCTQ (Munich Chronotype Questionnaire)
 * Baseado no protocolo de Roenneberg
 */
export interface MCTQResult {
  /** Média de sono em dias de trabalho (SD_W) em horas */
  sdWorkday: number;

  /** Média de sono em dias livres (SD_F) em horas */
  sdFreeday: number;

  /** Média semanal ponderada (SD_week = (5×SD_W + 2×SD_F) / 7) */
  sdWeek: number;

  /** Necessidade corrigida (SN_ideal) em horas */
  sleepNeedIdeal: number;

  /** Social Jetlag em horas (|MSF - MSW|) */
  socialJetlag: number;

  /** Mid-sleep em dias de trabalho (MSW) */
  midSleepWorkday: Date;

  /** Mid-sleep em dias livres (MSF) */
  midSleepFreeday: Date;

  /** Mid-sleep corrigido (MSF_sc) - sem oversleep de recuperação */
  midSleepCorrected: Date;

  /** Número de dias de trabalho usados no cálculo */
  workdaysCount: number;

  /** Número de dias livres usados no cálculo */
  freedaysCount: number;

  /** Confiança no cálculo */
  confidence: CalculationConfidence;

  /** Período de dados utilizado */
  dataStartDate: string;
  dataEndDate: string;
}

// === DECOMPOSIÇÃO DINÂMICA (WHOOP-STYLE) ===

/**
 * Decomposição da necessidade de sono diária
 * Fórmula: Necessidade_Hoje = Base + Carga + Dívida - Sonecas
 */
export interface DailySleepNeedBreakdown {
  /** Data alvo no formato YYYY-MM-DD */
  date: string;

  /** Necessidade base (do MCTQ) em horas */
  baseline: number;

  /** Adicional por carga de treino em horas */
  strainAddition: number;

  /** Adicional por dívida acumulada em horas */
  debtAddition: number;

  /** Subtração por sonecas do dia em horas */
  napSubtraction: number;

  /** Total final (sum) em horas */
  totalNeed: number;

  /** Contexto adicional */
  context: {
    /** Training Load Score (0-100+) */
    trainingLoadScore: number | null;
    /** Dívida atual em horas */
    currentDebtHours: number;
    /** Minutos de soneca no dia */
    napMinutes: number;
    /** Recovery Score do dia anterior */
    recoveryScoreYesterday: number | null;
  };
}

// === HISTÓRICO DE CÁLCULOS ===

/**
 * Registro histórico de um cálculo de sleep need
 */
export interface SleepNeedCalculationRecord {
  /** ID do cálculo */
  calculationId: number;
  /** ID do atleta */
  athleteId: string;
  /** Data/hora do cálculo */
  calculatedAt: Date;
  /** Método utilizado */
  method: SleepNeedMethod;
  /** Necessidade calculada em horas */
  calculatedNeed: number;
  /** Confiança */
  confidence: CalculationConfidence;
  /** Número de dias utilizados */
  basedOnDays: number;
  /** Parâmetros MCTQ (se aplicável) */
  sdWorkday: number | null;
  sdFreeday: number | null;
  sdWeek: number | null;
  socialJetlagHours: number | null;
  /** Contagens */
  workdaysCount: number | null;
  freedaysCount: number | null;
  /** Período de dados */
  dataStartDate: string | null;
  dataEndDate: string | null;
}

// === CONFIGURAÇÃO DO SISTEMA ===

/**
 * Configuração para o sistema de Sleep Need
 */
export interface SleepNeedConfig {
  /** Janela de análise para MCTQ (dias) */
  mctqWindowDays: number;

  /** Mínimo de dias livres para cálculo confiável */
  minFreedaysForCalculation: number;

  /** Mínimo de dias de trabalho */
  minWorkdaysForCalculation: number;

  /** Limite mínimo biológico (horas) */
  minSleepNeed: number;

  /** Limite máximo biológico (horas) */
  maxSleepNeed: number;

  /** Fator de strain (minutos extras por ponto de carga acima da média) */
  strainFactor: number;

  /** Janela de dívida (dias) */
  debtWindowDays: number;

  /** Decay lambda para dívida */
  debtDecayLambda: number;

  /** Limite máximo de dívida contabilizada (horas) - evita metas inatingíveis */
  maxDebtHours: number;

  /** Variância máxima do wake time para considerar WorkDay (minutos) */
  workdayWakeVarianceThreshold: number;

  /** Variância mínima do wake time para considerar FreeDay (minutos) */
  freedayWakeVarianceThreshold: number;
}

/**
 * Configuração padrão do sistema de Sleep Need
 */
export const DEFAULT_SLEEP_NEED_CONFIG: SleepNeedConfig = {
  mctqWindowDays: 90,
  minFreedaysForCalculation: 8,
  minWorkdaysForCalculation: 20,
  minSleepNeed: 6.0,
  maxSleepNeed: 10.0,
  strainFactor: 3, // 3 minutos extras por ponto de carga acima da média
  debtWindowDays: 14,
  debtDecayLambda: 0.5,
  maxDebtHours: 2.0,
  workdayWakeVarianceThreshold: 20, // < 20 min variância = WorkDay
  freedayWakeVarianceThreshold: 45, // > 45 min variância = FreeDay
};

// === ESTATÍSTICAS POR DIA DA SEMANA ===

/**
 * Estatísticas de wake time por dia da semana
 * Usado para classificação automática de dias
 */
export interface DayOfWeekStats {
  /** Dia da semana (0=Dom, 1=Seg, ..., 6=Sab) */
  dayOfWeek: number;
  /** Média do horário de despertar (hora decimal) */
  meanWakeHour: number;
  /** Desvio padrão em minutos */
  varianceMinutes: number;
  /** Número de amostras */
  sampleCount: number;
  /** Classificação inferida */
  inferredDayType: DayType;
}

// === INSIGHT DE SOCIAL JETLAG ===

/**
 * Categoria de Social Jetlag
 */
export type SocialJetlagCategory = 'low' | 'moderate' | 'high' | 'severe';

/**
 * Insight sobre Social Jetlag
 */
export interface SocialJetlagInsight {
  /** Horas de jetlag */
  hours: number;
  /** Categoria */
  category: SocialJetlagCategory;
  /** Descrição localizada */
  description: string;
  /** Recomendação */
  recommendation: string;
}

/**
 * Obter categoria de Social Jetlag baseado nas horas
 */
export function getSocialJetlagCategory(hours: number): SocialJetlagCategory {
  if (hours < 1) return 'low';
  if (hours < 2) return 'moderate';
  if (hours < 3) return 'high';
  return 'severe';
}

/**
 * Obter insight sobre Social Jetlag
 */
export function getSocialJetlagInsight(hours: number): SocialJetlagInsight {
  const category = getSocialJetlagCategory(hours);

  const insights: Record<SocialJetlagCategory, { description: string; recommendation: string }> = {
    low: {
      description: 'Social Jetlag baixo - seus horários estão bem alinhados',
      recommendation: 'Continue mantendo horários consistentes de sono',
    },
    moderate: {
      description: 'Social Jetlag moderado - há diferença entre semana e fim de semana',
      recommendation: 'Tente acordar mais cedo nos fins de semana para reduzir o desalinhamento',
    },
    high: {
      description: 'Social Jetlag alto - diferença significativa nos horários',
      recommendation: 'Considere ajustar gradualmente seus horários para reduzir a diferença',
    },
    severe: {
      description: 'Social Jetlag severo - pode impactar saúde e bem-estar',
      recommendation: 'Priorize regularizar seus horários de sono. Consulte um especialista se necessário',
    },
  };

  return {
    hours: Math.round(hours * 10) / 10,
    category,
    ...insights[category],
  };
}

// === THRESHOLDS DE SOCIAL JETLAG ===

export const SOCIAL_JETLAG_THRESHOLDS = {
  low: { min: 0, max: 1 },
  moderate: { min: 1, max: 2 },
  high: { min: 2, max: 3 },
  severe: { min: 3, max: Infinity },
} as const;

// === MINIMAL VITALS TYPE (compatível com DailyVitalsMinimal existente) ===

/**
 * Dados mínimos de vitais diários necessários para cálculos de Sleep Need
 * Extensão do DailyVitalsMinimal existente
 */
export interface SleepVitalsForCalculation {
  date: string;
  sleepDurationHours?: number;
  sleepStartTimestampGMT?: number;
  sleepEndTimestampGMT?: number;
  deepSleepMinutes?: number;
  remSleepMinutes?: number;
  lightSleepMinutes?: number;
  awakeMinutes?: number;
  sleepScore?: number;
  recoveryScore?: number;
  /** Campo opcional de validação Garmin */
  validation?: GarminSleepValidation;
  /** Sono não mensurável (em segundos) */
  unmeasurableSleepSeconds?: number;
}
