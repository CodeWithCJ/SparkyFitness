/**
 * Whoop Color System - Cores Oficiais (Máxima Precisão)
 *
 * Baseado nas especificações exatas do aplicativo Whoop:
 * - Background Gradient: #283339 (topo) -> #101518 (base)
 * - Recovery Status: #16EC06 (Verde), #FFDE00 (Amarelo), #FF0026 (Vermelho)
 * - Métricas: #0093E7 (Strain), #7BA1BB (Sleep), #67AEE6 (Recovery)
 * - CTA: #00F19F (Teal)
 */

export const WHOOP_COLORS = {
  // === BACKGROUND (Gradiente Vertical) ===
  background: {
    start: '#283339', // Topo do gradiente
    end: '#101518', // Base do gradiente
    gradient: 'linear-gradient(to bottom, #283339, #101518)',
    // Aliases para compatibilidade com código existente
    primary: '#101518', // Mesmo que 'end'
    secondary: '#283339', // Mesmo que 'start' (tom mais claro para cards)
    tertiary: '#1A1A1A', // Tom intermediário para cards elevados
  },

  // === TEXT ===
  // Sistema Whoop oficial usa apenas DUAS cores de texto:
  // - primary (#FFFFFF): Texto principal, ícones ativos, números
  // - secondary (#7BA1BB): Labels, subtítulos, ícones inativos
  // NOTA: text.secondary é intencionalmente a mesma cor que metrics.sleep!
  // O Whoop reutiliza esse azul dessaturado como cor "muted" para eficiência de paleta.
  text: {
    primary: '#FFFFFF', // Texto principal, ícones ativos
    secondary: '#7BA1BB', // Texto secundário, ícones inativos (= metrics.sleep)
  },

  // === BRAND / CTA ===
  brand: {
    cta: '#00F19F', // Botões de ação, destaques, abas ativas
  },

  // === RECOVERY STATUS (Sistema de Semáforo) ===
  recovery: {
    high: {
      bg: '#16EC06', // Verde (67-100%)
      text: '#FFFFFF',
      glow: 'rgba(22, 236, 6, 0.3)',
      range: [67, 100],
    },
    medium: {
      bg: '#FFDE00', // Amarelo (34-66%)
      text: '#000000', // Texto preto para contraste
      glow: 'rgba(255, 222, 0, 0.3)',
      range: [34, 66],
    },
    low: {
      bg: '#FF0026', // Vermelho (0-33%)
      text: '#FFFFFF',
      glow: 'rgba(255, 0, 38, 0.3)',
      range: [0, 33],
    },
    // Aliases para compatibilidade com código existente
    green: {
      bg: '#16EC06',
      text: '#FFFFFF',
      glow: 'rgba(22, 236, 6, 0.3)',
    },
    yellow: {
      bg: '#FFDE00',
      text: '#FFFFFF',
      glow: 'rgba(255, 222, 0, 0.3)',
    },
    red: {
      bg: '#FF0026',
      text: '#FFFFFF',
      glow: 'rgba(255, 0, 38, 0.3)',
    },
  },

  // === METRICS (Pilares Whoop) ===
  metrics: {
    strain: '#0093E7', // Azul vibrante - Atividades
    sleep: '#7BA1BB', // Azul-acinzentado - Sono
    recoveryGeneral: '#67AEE6', // Azul claro - Gráficos de recuperação
    hrv: '#67AEE6', // Mesma cor de recoveryGeneral
    rhr: '#FF0026', // Vermelho (recovery low)
    weight: '#00F19F', // Teal (CTA)
  },

  // === SLEEP STAGES (Breakdown de Sono) ===
  // Paleta oficial Whoop para estágios de sono:
  // - Light: Cor base do pilar Sono (#7BA1BB)
  // - REM: Cor de dados gerais de recuperação (#67AEE6)
  // - Deep: Tom mais escuro da cor base do Sono (#5A778A)
  // - Awake: Cor de atenção/médio do sistema de semáforo (#FFDE00)
  sleep: {
    deep: '#5A778A', // Tom mais escuro de data-sleep (Sono Profundo)
    rem: '#67AEE6', // data-recovery-general (Sono REM)
    light: '#7BA1BB', // data-sleep oficial (Sono Leve)
    awake: '#FFDE00', // data-recovery-medium (Acordado - atenção)
  },

  // === CIRCADIAN / ENERGY SCHEDULE ===
  // Cores para o modelo circadiano e agenda de energia
  circadian: {
    melatonin: '#9B59B6', // Roxo para janela de melatonina
    energyPeak: '#00F19F', // Teal para pico de energia
    energyDip: '#FFDE00', // Amarelo para mergulho de energia
    processS: '#FF6B6B', // Vermelho suave para pressão homeostática
    processC: '#4ECDC4', // Teal claro para ritmo circadiano
    windDown: '#8E44AD', // Roxo escuro para fase de wind-down
    rising: '#67AEE6', // Azul para energia subindo
  },

  // === ENERGY ZONES ===
  energyZones: {
    peak: {
      bg: '#00F19F',
      text: '#FFFFFF',
      glow: 'rgba(0, 241, 159, 0.3)',
    },
    rising: {
      bg: '#67AEE6',
      text: '#FFFFFF',
      glow: 'rgba(103, 174, 230, 0.3)',
    },
    dip: {
      bg: '#FFDE00',
      text: '#000000',
      glow: 'rgba(255, 222, 0, 0.3)',
    },
    windDown: {
      bg: '#9B59B6',
      text: '#FFFFFF',
      glow: 'rgba(155, 89, 182, 0.3)',
    },
    sleep: {
      bg: '#5A778A',
      text: '#FFFFFF',
      glow: 'rgba(90, 119, 138, 0.3)',
    },
  },

  // === BORDERS ===
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    default: 'rgba(255, 255, 255, 0.1)',
    strong: 'rgba(255, 255, 255, 0.2)',
  },
};

/**
 * Retorna a cor de recovery baseada no score
 */
export function getRecoveryColor(score: number): {
  bg: string;
  text: string;
  glow: string;
  category: 'red' | 'yellow' | 'green';
  label: string;
} {
  if (score >= 67) {
    return {
      ...WHOOP_COLORS.recovery.green,
      category: 'green',
      label: 'Green Recovery',
    };
  }

  if (score >= 34) {
    return {
      ...WHOOP_COLORS.recovery.yellow,
      category: 'yellow',
      label: 'Yellow Recovery',
    };
  }

  return {
    ...WHOOP_COLORS.recovery.red,
    category: 'red',
    label: 'Red Recovery',
  };
}

/**
 * Retorna insights contextuais baseados no score
 */
export function getRecoveryInsight(score: number, baseline: number): string {
  const diff = ((score - baseline) / baseline) * 100;

  if (score >= 67) {
    if (diff > 10) {
      return `Seu corpo está se recuperando excepcionalmente bem. ${Math.round(diff)}% acima da sua média.`;
    }
    return 'Sua recuperação está ótima hoje. Seu corpo está pronto para treinar intenso.';
  }

  if (score >= 34) {
    return 'Sua recuperação está adequada. Considere atividades moderadas hoje.';
  }

  return 'Sua recuperação está baixa. Priorize descanso e sono para permitir que seu corpo se recupere.';
}

/**
 * Returns a human-readable recovery label
 */
export function getRecoveryLabel(score: number): string {
  if (score >= 67) return 'Green';
  if (score >= 34) return 'Yellow';
  return 'Red';
}

/**
 * CSS custom properties for the WHOOP theme.
 * Applied to document.documentElement.style when WHOOP theme is active.
 * Maps to Tailwind/shadcn CSS variables used throughout the app.
 */
export const whoopCSSVariables: Record<string, string> = {
  // Background
  '--background': '195 26% 8%', // #101518
  '--foreground': '0 0% 100%', // #FFFFFF
  // Card
  '--card': '195 15% 18%', // #283339
  '--card-foreground': '0 0% 100%',
  // Popover
  '--popover': '195 15% 18%',
  '--popover-foreground': '0 0% 100%',
  // Primary (CTA teal)
  '--primary': '159 100% 47%', // #00F19F
  '--primary-foreground': '195 26% 8%',
  // Secondary
  '--secondary': '200 22% 61%', // #7BA1BB
  '--secondary-foreground': '0 0% 100%',
  // Muted
  '--muted': '195 15% 18%',
  '--muted-foreground': '200 22% 61%', // #7BA1BB
  // Accent
  '--accent': '195 20% 15%',
  '--accent-foreground': '0 0% 100%',
  // Destructive
  '--destructive': '349 100% 50%', // #FF0026
  '--destructive-foreground': '0 0% 100%',
  // Border
  '--border': '0 0% 100% / 0.1',
  '--input': '0 0% 100% / 0.1',
  '--ring': '159 100% 47%', // #00F19F
  // Radius (keep app default)
  '--radius': '0.5rem',
};
