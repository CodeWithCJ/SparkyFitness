/**
 * Body-fat formulas now live in `@workspace/shared` so the web check-in and the
 * mobile measurements screen estimate identically. This module stays as the web
 * import path (`@/services/bodyCompositionService`) so existing callers and the
 * `BodyFatAlgorithm` preference type are untouched.
 */
export {
  BodyFatAlgorithm,
  calculateBodyFatBmi,
  calculateBodyFatNavy,
} from '@workspace/shared';
