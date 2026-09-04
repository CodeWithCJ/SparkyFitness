/**
 * Whoop Color System - Cores Oficiais (Máxima Precisão)
 *
 * Baseado nas especificações exatas do aplicativo Whoop:
 * - Background Gradient: #283339 (topo) -> #101518 (base)
 * - Recovery Status: #16EC06 (Verde), #FFDE00 (Amarelo), #FF0026 (Vermelho)
 * - Métricas: #0093E7 (Strain), #7BA1BB (Sleep), #67AEE6 (Recovery)
 * - CTA: #00F19F (Teal)
 */

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
