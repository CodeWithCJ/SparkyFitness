import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { AiEstimateData } from '@/hooks/Foods/useUnitConversion';
import { useAiUnitConversion } from '@/hooks/Foods/useAiUnitConversion';
import { error as logError } from '@/utils/logging';
import { OVERALL_CONFIDENCE_LABELS } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

interface AiEstimateSectionProps {
  food: { id: string; name: string; brand?: string | null };
  /** The unit the user picked in the dropdown (the new, incompatible unit). */
  fromUnit: string;
  /**
   * Quantity sent to AI. In the food editor this is the row's serving_size
   * (so AI estimates "2 cups -> ?g" instead of "1 cup -> ?g"); the diary
   * picker passes `1` since the unit defines a single serving there.
   * Defaults to 1 for callers that haven't been migrated.
   */
  fromAmount?: number;
  /** The base unit being converted away from (the food's existing serving). */
  toUnit: string;
  /** Existing variants on the food, for prompt anchoring. */
  knownVariants: { amount: number; unit: string }[];
  /**
   * `'confirm'` (default): show the AI result inline with "Use this" / "Edit"
   * buttons so the user explicitly commits the estimate. Used by the diary
   * picker, where the estimate fills a manual factor that the user then
   * submits via the parent's "Add to Meal" button.
   *
   * `'auto-apply'`: call `onAccept` as soon as the estimate succeeds - no
   * result panel, no buttons. Used by the food-editor row, where the form
   * holds the populated nutrition and the user commits with Save Food. If
   * they manually edit a nutrition field afterward, the form drops the AI
   * tag - that replaces the "Edit" affordance on this surface.
   */
  mode?: 'confirm' | 'auto-apply';
  /** Caller commits the estimate to its state on accept. */
  onAccept: (data: AiEstimateData) => void;
  /**
   * Only consulted in `'confirm'` mode. Called when the user wants to keep
   * the populated factor but drop the AI provenance tag.
   */
  onEdit?: () => void;
}

type SectionState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; data: AiEstimateData }
  | { kind: 'error'; message: string };

const CONFIDENCE_DOT: Record<AiEstimateData['confidence'], string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

export function AiEstimateSection({
  food,
  fromUnit,
  fromAmount = 1,
  toUnit,
  knownVariants,
  mode = 'confirm',
  onAccept,
  onEdit,
}: AiEstimateSectionProps) {
  const { loggingLevel } = usePreferences();
  const { t } = useTranslation();
  const requestAiUnitConversion = useAiUnitConversion();
  const [state, setState] = useState<SectionState>({ kind: 'idle' });

  // In auto-apply mode, onAccept may unmount this row by changing the parent's
  // variant.source - pin the callback so an in-flight request resolves safely.
  const onAcceptRef = useRef(onAccept);
  useEffect(() => {
    onAcceptRef.current = onAccept;
  }, [onAccept]);

  const runEstimate = async () => {
    setState({ kind: 'loading' });
    try {
      const result = await requestAiUnitConversion({
        foodId: food.id,
        foodName: food.name,
        brand: food.brand ?? undefined,
        fromUnit,
        fromAmount,
        toUnit,
        knownVariants,
      });
      const data: AiEstimateData = {
        estimatedAmount: result.estimatedAmount,
        confidence: result.confidence,
      };
      if (mode === 'auto-apply') {
        onAcceptRef.current(data);
        setState({ kind: 'idle' });
      } else {
        setState({ kind: 'result', data });
      }
    } catch (err) {
      logError(
        loggingLevel,
        `AiEstimateSection: estimate failed for ${food.name} (${fromAmount} ${fromUnit} -> ${toUnit})`,
        err
      );
      setState({
        kind: 'error',
        message: t(
          'aiEstimate.failed',
          'Could not estimate this conversion. Try again.'
        ),
      });
    }
  };

  if (state.kind === 'idle') {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={runEstimate}
          className="w-full"
        >
          <Sparkles className="h-4 w-4" />
          {t('aiEstimate.convertWithAi', 'Estimate conversion with AI')}
        </Button>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>
          {t('aiEstimate.estimating', {
            fromAmount,
            fromUnit: getLocalizedUnitLabel(fromUnit, t),
            toUnit: getLocalizedUnitLabel(toUnit, t),
            defaultValue:
              'Estimating {{fromAmount}} {{fromUnit}} in {{toUnit}}…',
          })}
        </span>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
        <p className="text-sm text-destructive">{state.message}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runEstimate}
          >
            {t('aiEstimate.tryAgain', 'Try again')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setState({ kind: 'idle' })}
          >
            {t('aiEstimate.dismiss', 'Dismiss')}
          </Button>
        </div>
      </div>
    );
  }

  // Result - only reachable in 'confirm' mode (auto-apply jumps idle -> loading -> idle).
  const { data } = state;
  const isLow = data.confidence === 'low';
  const confidence = t(`aiEstimate.confidence.${data.confidence}`, {
    defaultValue: OVERALL_CONFIDENCE_LABELS[data.confidence],
  });
  const localizedToUnit = getLocalizedUnitLabel(toUnit, t);
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${CONFIDENCE_DOT[data.confidence]}`}
          aria-hidden
        />
        <span className="text-sm font-medium">
          {t('aiEstimate.result', {
            amount: data.estimatedAmount,
            unit: localizedToUnit,
            defaultValue: 'Estimate: about {{amount}} {{unit}}',
          })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('aiEstimate.confidenceEstimate', {
            confidence,
            defaultValue: '{{confidence}} confidence estimate',
          })}
        </span>
      </div>
      {isLow && (
        <p className="text-xs text-destructive">
          {t(
            'aiEstimate.lowConfidenceWarning',
            'This is a rough estimate. Verify it when accuracy matters.'
          )}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => onAccept(data)}
        >
          {t('aiEstimate.useEstimate', 'Use estimate')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onEdit?.();
            setState({ kind: 'idle' });
          }}
        >
          {t('aiEstimate.editEstimate', 'Edit manually')}
        </Button>
      </div>
    </div>
  );
}
