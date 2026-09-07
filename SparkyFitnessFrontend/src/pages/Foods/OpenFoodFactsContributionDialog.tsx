import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  OpenFoodFactsConfirmResponse,
  OpenFoodFactsPreviewRequest,
  OpenFoodFactsPreviewResponse,
} from '@workspace/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useOpenFoodFactsContribution,
  useOpenFoodFactsContributionAvailability,
} from '@/hooks/Foods/useOpenFoodFactsContribution';
import type { Food } from '@/types/food';
import {
  isOpenFoodFactsContributionCandidate,
  prepareOpenFoodFactsImage,
} from '@/utils/openFoodFactsContribution';

interface OpenFoodFactsContributionDialogProps {
  open: boolean;
  food: Food;
  onOpenChange: (open: boolean) => void;
}

export default function OpenFoodFactsContributionDialog({
  open,
  food,
  onOpenChange,
}: OpenFoodFactsContributionDialogProps) {
  const { available, isOwner, settings, userId } =
    useOpenFoodFactsContributionAvailability();

  return (
    <ContributionDialog
      key={`${food.id}:${userId}:${isOwner}`}
      open={open}
      food={food}
      onOpenChange={onOpenChange}
      available={available}
      eligible={isOwner && isOpenFoodFactsContributionCandidate(food, userId)}
      initialLanguage={settings?.productLanguage ?? ''}
    />
  );
}

function ContributionDialog({
  open,
  food,
  onOpenChange,
  available,
  eligible,
  initialLanguage,
}: OpenFoodFactsContributionDialogProps & {
  available: boolean;
  eligible: boolean;
  initialLanguage: string;
}) {
  const { t } = useTranslation();
  const [publishing, setPublishing] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!publishing) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(
              'openFoodFactsContribution.title',
              'Contribute to Open Food Facts'
            )}
          </DialogTitle>
          <DialogDescription>{food.name}</DialogDescription>
        </DialogHeader>
        {(!available || !eligible) && (
          <p>
            {t(
              'openFoodFactsContribution.unavailable',
              'Contributions require your own custom food, an enabled server setting and an available Open Food Facts account.'
            )}
          </p>
        )}
        {open && eligible && (
          <ContributionContent
            food={food}
            available={available}
            initialLanguage={initialLanguage}
            onClose={() => onOpenChange(false)}
            onPublishingChange={setPublishing}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContributionContent({
  food,
  available,
  initialLanguage,
  onClose,
  onPublishingChange,
}: {
  food: Food;
  available: boolean;
  initialLanguage: string;
  onClose: () => void;
  onPublishingChange: (publishing: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { preview: previewMutation, contribute } = useOpenFoodFactsContribution(
    food.id
  );
  const [languageDraft, setProductLanguage] = useState<string | null>(null);
  const productLanguage = languageDraft ?? initialLanguage;
  const [imageType, setImageType] =
    useState<OpenFoodFactsPreviewRequest['imageType']>('nutrition');
  const [imageBase64, setImageBase64] = useState('');
  const [fileName, setFileName] = useState('');
  const [converting, setConverting] = useState(false);
  const [preview, setPreview] = useState<OpenFoodFactsPreviewResponse | null>(
    null
  );
  const [dataConsent, setDataConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OpenFoodFactsConfirmResponse | null>(
    null
  );
  const version = useRef(0);
  const writeInFlight = useRef(false);
  const busy = converting || previewMutation.isPending || contribute.isPending;
  const languageValid = /^[a-z]{2}$/.test(productLanguage);

  useEffect(() => {
    if (!preview) return;
    const timeout = window.setTimeout(
      () => {
        setPreview(null);
        setDataConsent(false);
        setImageConsent(false);
      },
      Math.max(0, Date.parse(preview.expiresAt) - Date.now())
    );
    return () => window.clearTimeout(timeout);
  }, [preview]);

  const resetPreview = () => {
    version.current += 1;
    setPreview(null);
    setDataConsent(false);
    setImageConsent(false);
    setError('');
  };

  const selectPhoto = async (file: File | undefined) => {
    resetPreview();
    setImageBase64('');
    setFileName('');
    if (!file) return;
    const selectionVersion = version.current;
    setConverting(true);
    try {
      const prepared = await prepareOpenFoodFactsImage(file);
      if (version.current === selectionVersion) {
        setImageBase64(prepared);
        setFileName(file.name);
      }
    } catch {
      if (version.current === selectionVersion) {
        setError(
          t(
            'openFoodFactsContribution.imageError',
            'Choose a clear JPEG, PNG or WebP photo under 20 MB, at least 640 pixels on its longest side and 160 on its shortest side, with at most 40 megapixels.'
          )
        );
      }
    } finally {
      if (version.current === selectionVersion) setConverting(false);
    }
  };

  const requestPreview = async () => {
    if (!available || !languageValid || !imageBase64 || busy) return;
    setProductLanguage(productLanguage);
    resetPreview();
    const requestVersion = version.current;
    try {
      const response = await previewMutation.mutateAsync({
        productLanguage,
        imageType,
        imageBase64,
      });
      if (version.current === requestVersion) setPreview(response);
    } catch (err) {
      if (version.current === requestVersion) {
        setError(
          err instanceof Error
            ? err.message
            : t(
                'openFoodFactsContribution.previewError',
                'The preview could not be prepared.'
              )
        );
      }
    }
  };

  const publish = async () => {
    if (
      !available ||
      !preview ||
      !dataConsent ||
      !imageConsent ||
      busy ||
      writeInFlight.current
    )
      return;
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      resetPreview();
      setError(
        t(
          'openFoodFactsContribution.expired',
          'This preview expired. Request and review a new preview.'
        )
      );
      return;
    }
    writeInFlight.current = true;
    onPublishingChange(true);
    setError('');
    try {
      const response = await contribute.mutateAsync({
        productLanguage,
        imageType: preview.imageType,
        imageBase64: preview.imageBase64,
        previewToken: preview.previewToken,
        confirm: true,
        confirmImageRights: true,
      });
      setResult(response);
      setPreview(null);
    } catch (err) {
      resetPreview();
      setError(
        err instanceof Error
          ? err.message
          : t(
              'openFoodFactsContribution.publishError',
              'Publication could not be confirmed. Check the product before preparing a new contribution.'
            )
      );
    } finally {
      writeInFlight.current = false;
      onPublishingChange(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Alert
          role={result.status === 'partial' ? 'alert' : 'status'}
          variant={result.status === 'partial' ? 'destructive' : 'default'}
        >
          <AlertTitle>
            {result.status === 'partial'
              ? t(
                  'openFoodFactsContribution.partialTitle',
                  'Photo published; product data unconfirmed'
                )
              : t(
                  'openFoodFactsContribution.successTitle',
                  'Contribution published'
                )}
          </AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
        <a
          className="block break-all underline"
          href={result.productUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {result.productUrl}
        </a>
        <Button type="button" onClick={onClose}>
          {t('common.close', 'Close')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {t(
          'openFoodFactsContribution.introduction',
          'Your food is saved locally. Choose a photo you took of this product, then review exactly what will be published. Preparing or cancelling a preview does not change Open Food Facts.'
        )}
      </p>
      <div className="space-y-2">
        <Label htmlFor={`${id}-photo`}>
          {t('openFoodFactsContribution.photoLabel', 'Your own product photo')}
        </Label>
        <Input
          id={`${id}-photo`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => void selectPhoto(event.target.files?.[0])}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            'openFoodFactsContribution.photoHelp',
            'Use a clear photo of the front, nutrition label or packaging. Location and other image metadata are removed before publication.'
          )}
        </p>
        {fileName && <p className="text-sm break-all">{fileName}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-type`}>
            {t('openFoodFactsContribution.imageTypeLabel', 'Photo content')}
          </Label>
          <select
            id={`${id}-type`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={imageType}
            disabled={busy}
            onChange={(event) => {
              resetPreview();
              setImageType(
                event.target.value as OpenFoodFactsPreviewRequest['imageType']
              );
            }}
          >
            <option value="nutrition">
              {t('openFoodFactsContribution.nutritionPhoto', 'Nutrition label')}
            </option>
            <option value="front">
              {t('openFoodFactsContribution.frontPhoto', 'Front of product')}
            </option>
            <option value="packaging">
              {t('openFoodFactsContribution.packagingPhoto', 'Packaging')}
            </option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-language`}>
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.productLanguageLabel',
              'Product data language'
            )}
          </Label>
          <Input
            id={`${id}-language`}
            value={productLanguage}
            maxLength={2}
            autoComplete="off"
            disabled={busy}
            aria-invalid={!languageValid}
            aria-describedby={`${id}-language-help`}
            onChange={(event) => {
              resetPreview();
              setProductLanguage(
                event.target.value
                  .replace(/[^a-z]/gi, '')
                  .slice(0, 2)
                  .toLowerCase()
              );
            }}
          />
          <p
            id={`${id}-language-help`}
            className="text-xs text-muted-foreground"
          >
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.productLanguageHelp',
              'Use the two-letter language code printed on the product packaging, for example en or de.'
            )}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {preview && (
        <section className="space-y-4 rounded-md border p-4">
          <h3 className="font-semibold">
            {t(
              'openFoodFactsContribution.previewTitle',
              'Review this exact contribution'
            )}
          </h3>
          <p className="text-sm">
            {preview.existingProduct
              ? t(
                  'openFoodFactsContribution.existingProduct',
                  'This contribution updates an existing public product. Review its current information before confirming.'
                )
              : t(
                  'openFoodFactsContribution.newProduct',
                  'This contribution creates a public product.'
                )}
          </p>
          <a
            className="block break-all underline"
            href={preview.productUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {preview.productUrl}
          </a>
          <p className="text-sm font-medium">
            {preview.providerScope === 'personal'
              ? t(
                  'openFoodFactsContribution.personalAccount',
                  'Your personal Open Food Facts account'
                )
              : t(
                  'openFoodFactsContribution.globalAccount',
                  'The shared server Open Food Facts account'
                )}
          </p>
          <img
            src={`data:image/jpeg;base64,${preview.imageBase64}`}
            alt={t('openFoodFactsContribution.imageAlt', 'Photo to publish')}
            className="max-h-72 w-full rounded-md object-contain"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {t(
                  'openFoodFactsContribution.fieldsCaption',
                  'Every field that will be published'
                )}
              </caption>
              <thead>
                <tr>
                  <th className="p-2 text-left">
                    {t('openFoodFactsContribution.field', 'Field')}
                  </th>
                  <th className="p-2 text-left">
                    {t('openFoodFactsContribution.value', 'Exact value')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.fields).map(([field, value]) => (
                  <tr key={field} className="border-t">
                    <td className="p-2 align-top font-mono break-all">
                      {field}
                    </td>
                    <td className="p-2 whitespace-pre-wrap break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id={`${id}-data-consent`}
              checked={dataConsent}
              disabled={busy}
              onCheckedChange={(checked) => setDataConsent(checked === true)}
            />
            <Label htmlFor={`${id}-data-consent`} className="leading-relaxed">
              {t(
                'openFoodFactsContribution.dataConsent',
                'I entered these data from the physical packaging, checked the exact values above, and agree to publish them under the ODbL and Database Contents License.'
              )}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id={`${id}-image-consent`}
              checked={imageConsent}
              disabled={busy}
              onCheckedChange={(checked) => setImageConsent(checked === true)}
            />
            <Label htmlFor={`${id}-image-consent`} className="leading-relaxed">
              {t(
                'openFoodFactsContribution.imageConsent',
                'I took this photo, own the rights to share it, and agree to publish it under CC BY-SA.'
              )}
            </Label>
          </div>
          <a
            className="block text-sm underline"
            href="https://world.openfoodfacts.org/terms-of-use"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.contributorTerms',
              'Contributor terms'
            )}
          </a>
          <Button
            type="button"
            disabled={!available || busy || !dataConsent || !imageConsent}
            onClick={() => void publish()}
          >
            {contribute.isPending
              ? t('openFoodFactsContribution.publishing', 'Publishing…')
              : t(
                  'openFoodFactsContribution.publish',
                  'Publish this contribution'
                )}
          </Button>
        </section>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={contribute.isPending}
        >
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          variant={preview ? 'outline' : 'default'}
          disabled={!available || busy || !languageValid || !imageBase64}
          onClick={() => void requestPreview()}
        >
          {previewMutation.isPending
            ? t('openFoodFactsContribution.preparing', 'Preparing preview…')
            : t('openFoodFactsContribution.preview', 'Preview contribution')}
        </Button>
      </div>
    </div>
  );
}
