import { useTranslation } from 'react-i18next';
import {
  BARCODE_FALLBACK_PROVIDER_ID,
  barcodeNutritionPreview,
  type BarcodeCandidate,
  type BarcodeLookupResponse,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBarcodeSearchResult } from '@/hooks/Foods/useBarcodeSearchResult';

interface BarcodeSearchResultProps {
  barcode: string;
  accountId: string;
  profileId: string;
  response: BarcodeLookupResponse;
  onUseFood: (candidate: BarcodeCandidate) => void;
}

function sameCandidate(a: BarcodeCandidate, b: BarcodeCandidate): boolean {
  return (
    a.providerId === b.providerId &&
    a.food?.provider_external_id === b.food?.provider_external_id &&
    a.food?.id === b.food?.id
  );
}

const displayNumber = (value: number | null) =>
  value === null ? '—' : Number(value.toFixed(1)).toLocaleString();

function SourceSummary({ candidate }: { candidate: BarcodeCandidate }) {
  const { t } = useTranslation();
  const food = candidate.food;
  const preview = food ? barcodeNutritionPreview(food) : null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{candidate.providerName}</span>
        {candidate.providerId === BARCODE_FALLBACK_PROVIDER_ID && (
          <Badge variant="outline">
            {t('barcodeLookup.fallback', 'Fallback')}
          </Badge>
        )}
      </div>
      {food && preview ? (
        <>
          <p className="font-medium">{food.name}</p>
          {food.brand && (
            <p className="text-sm text-muted-foreground">{food.brand}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t('barcodeLookup.basis', 'Per {{quantity}} {{unit}}', {
              quantity: displayNumber(preview.servingSize),
              unit: preview.servingUnit,
            })}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{displayNumber(preview.calories)} kcal</span>
            <span>
              {t('barcodeLookup.protein', 'Protein: {{value}} g', {
                value: displayNumber(preview.protein),
              })}
            </span>
            <span>
              {t('barcodeLookup.carbs', 'Carbs: {{value}} g', {
                value: displayNumber(preview.carbs),
              })}
            </span>
            <span>
              {t('barcodeLookup.fat', 'Fat: {{value}} g', {
                value: displayNumber(preview.fat),
              })}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {candidate.status === 'error'
            ? t(
                'barcodeLookup.sourceFailed',
                'This source could not be reached.'
              )
            : t(
                'barcodeLookup.sourceNotFound',
                'No product found in this source.'
              )}
        </p>
      )}
    </>
  );
}

export function BarcodeSearchResult({
  barcode,
  accountId,
  profileId,
  response,
  onUseFood,
}: BarcodeSearchResultProps) {
  const { t } = useTranslation();
  const {
    original,
    selected,
    setSelected,
    expanded,
    setExpanded,
    alternatives,
  } = useBarcodeSearchResult(barcode, accountId, profileId, response);
  const candidates = alternatives.data?.results ?? [];
  const withOriginal =
    original &&
    !candidates.some((candidate) => sameCandidate(candidate, original))
      ? [original, ...candidates]
      : candidates;
  const otherResults = withOriginal.filter(
    (candidate) => !selected || !sameCandidate(candidate, selected)
  );

  return (
    <section
      className="space-y-3"
      aria-label={t('barcodeLookup.title', 'Barcode results')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t('enhancedFoodSearch.scannedProduct', 'Scanned product')}
        </h3>
        <span className="text-xs text-muted-foreground">{barcode}</span>
      </div>
      {selected ? (
        <div className="space-y-2 rounded-lg border p-4">
          <SourceSummary candidate={selected} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => onUseFood(selected)}>
              {selected.source === 'local'
                ? t('barcodeLookup.useFood', 'Use food')
                : t('enhancedFoodSearch.editAndAdd', 'Edit & Add')}
            </Button>
          </div>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            'barcodeLookup.notFound',
            'No product found. Check other sources or add a food manually.'
          )}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {t('barcodeLookup.otherSources', 'Other sources')}
      </Button>
      {expanded && (
        <div className="space-y-2">
          {alternatives.isPending && (
            <p role="status" className="text-sm">
              {t('barcodeLookup.loading', 'Checking other sources…')}
            </p>
          )}
          {alternatives.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {t(
                  'barcodeLookup.alternativesFailed',
                  'Could not load other sources.'
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void alternatives.refetch()}
              >
                {t('barcodeLookup.retry', 'Retry')}
              </Button>
            </div>
          )}
          {alternatives.isSuccess && otherResults.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t(
                'barcodeLookup.noAlternatives',
                'No other sources are available.'
              )}
            </p>
          )}
          {otherResults.map((candidate) => (
            <article
              aria-label={candidate.providerName}
              key={`${candidate.providerId}-${candidate.food?.provider_external_id ?? candidate.status}`}
              className="space-y-2 rounded-lg border p-3"
            >
              <SourceSummary candidate={candidate} />
              {candidate.status === 'found' && candidate.food && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(candidate)}
                >
                  {t('barcodeLookup.useSource', 'Use this source')}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
