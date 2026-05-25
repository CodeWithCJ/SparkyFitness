/**
 * Single source of truth for confidence-tier labels and color tones used
 * across all AI-estimate UIs (food-photo flow, unit-conversion picker badge,
 * variant-card provenance badge).
 *
 * Wording mirrors the mobile food-photo flow — picked for end-user clarity
 * over technical precision. The "overall" labels read naturally appended to
 * "AI · X estimate" (e.g. "AI · Fair estimate").
 */

import type { AiConfidence } from "./unitConversion.ts";

export type ConfidenceTone = "success" | "warning" | "error";

export const OVERALL_CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  high: "Good",
  medium: "Fair",
  low: "Rough",
};

export const ITEM_CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  high: "Likely",
  medium: "Possible",
  low: "Uncertain",
};

export const CONFIDENCE_TONES: Record<AiConfidence, ConfidenceTone> = {
  high: "success",
  medium: "warning",
  low: "error",
};
