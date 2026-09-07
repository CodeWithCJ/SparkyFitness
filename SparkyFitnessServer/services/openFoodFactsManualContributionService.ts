import crypto from 'node:crypto';
import {
  OpenFoodFactsConfirmRequestSchema,
  OpenFoodFactsPreviewRequestSchema,
  type OpenFoodFactsPreviewRequest,
  type OpenFoodFactsPreviewResponse,
  type OpenFoodFactsConfirmResponse,
} from '@workspace/shared';
import pkg from '../package.json' with { type: 'json' };
import { ENCRYPTION_KEY } from '../security/encryption.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import externalProviderService from './externalProviderService.js';
import {
  getOwnedOpenFoodFactsProduct,
  createOpenFoodFactsAppUuid,
} from './openFoodFactsContributionService.js';
import {
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  OpenFoodFactsContributionError,
  prepareOpenFoodFactsProduct,
  submitPreparedOpenFoodFactsProduct,
  submitOpenFoodFactsPhoto,
  isOpenFoodFactsAuthenticationRejection,
  getOpenFoodFactsPublicProductState,
} from '../integrations/openfoodfacts/openFoodFactsContribution.js';
import { prepareOpenFoodFactsPhoto } from '../integrations/openfoodfacts/openFoodFactsPhoto.js';
import { withOpenFoodFactsProductReadPermit } from './openFoodFactsProductReadRateLimitService.js';

const PREVIEW_LIFETIME_MS = 10 * 60_000;

function assertOwner(ownerId: string, actorId: string): void {
  if (!ownerId || ownerId !== actorId) {
    throw new OpenFoodFactsContributionError(
      'Only the food owner can publish to Open Food Facts.',
      403
    );
  }
}

async function getContributionContext(
  ownerId: string,
  foodId: string,
  language: string
) {
  if (!(await globalSettingsRepository.isOpenFoodFactsContributionAllowed())) {
    throw new OpenFoodFactsContributionError(
      'Open Food Facts contributions are disabled by this server administrator.',
      403
    );
  }
  const product = await getOwnedOpenFoodFactsProduct(
    ownerId,
    ownerId,
    foodId,
    language
  );
  const provider =
    await externalProviderService.getAvailableOpenFoodFactsProvider(ownerId);
  if (!provider)
    throw new OpenFoodFactsContributionError(
      'Configure an active personal Open Food Facts account or ask the administrator for a server account.',
      400
    );
  return { product, provider };
}

async function prepareContribution(
  ownerId: string,
  foodId: string,
  input: OpenFoodFactsPreviewRequest
) {
  const photo = prepareOpenFoodFactsPhoto(input.imageBase64);
  const context = await getContributionContext(
    ownerId,
    foodId,
    input.productLanguage
  );
  const { provider, product } = context;
  const authentication = await resolveOpenFoodFactsProvider(
    ownerId,
    provider.id,
    provider.scope,
    true
  );
  if (authentication.configurationIdentity !== provider.configurationIdentity) {
    throw new OpenFoodFactsContributionError(
      'The contribution account changed. Request a new preview.',
      409
    );
  }
  if (!authentication.session)
    throw new OpenFoodFactsContributionError(
      'Open Food Facts login failed. Check the configured account.',
      401
    );
  const attribution = {
    appName: 'SparkyFitness',
    appVersion: pkg.version,
    appUuid: createOpenFoodFactsAppUuid(ownerId),
  };
  const prepared = await prepareOpenFoodFactsProduct({
    baseUrl: authentication.baseUrl,
    session: authentication.session,
    product,
    attribution,
    executeProductRead: (operation) =>
      withOpenFoodFactsProductReadPermit(operation, { maxWaitMs: 10_000 }),
  });
  if (prepared.existingProduct && prepared.revision === null) {
    throw new OpenFoodFactsContributionError(
      'Open Food Facts did not provide a product revision. A safe preview is not available.'
    );
  }
  return {
    ...context,
    ...prepared,
    attribution,
    photo,
    session: authentication.session,
    imageType: input.imageType,
  };
}

type PreparedContribution = Awaited<ReturnType<typeof prepareContribution>>;

function previewSignature(
  ownerId: string,
  foodId: string,
  expires: number,
  prepared: PreparedContribution
): string {
  return crypto
    .createHmac('sha256', ENCRYPTION_KEY)
    .update(
      JSON.stringify({
        purpose: 'openfoodfacts-single-food-preview-v1',
        ownerId,
        foodId,
        expires,
        provider: prepared.provider,
        baseUrl: prepared.baseUrl,
        fields: prepared.form.toString(),
        revision: prepared.revision,
        existingProduct: prepared.existingProduct,
        imageType: prepared.imageType,
        photo: crypto.createHash('sha256').update(prepared.photo).digest('hex'),
      })
    )
    .digest('hex');
}

function productUrl(prepared: PreparedContribution): string {
  return `${prepared.baseUrl}/product/${encodeURIComponent(prepared.product.barcode)}`;
}

export async function previewOpenFoodFactsContribution(
  ownerId: string,
  actorId: string,
  foodId: string,
  input: unknown
): Promise<OpenFoodFactsPreviewResponse> {
  assertOwner(ownerId, actorId);
  const parsed = OpenFoodFactsPreviewRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new OpenFoodFactsContributionError(
      'Choose a product language and a JPEG packaging or nutrition-label photo.',
      400
    );
  const prepared = await prepareContribution(ownerId, foodId, parsed.data);
  const expires = Date.now() + PREVIEW_LIFETIME_MS;
  return {
    previewToken: `${expires}.${previewSignature(ownerId, foodId, expires, prepared)}`,
    expiresAt: new Date(expires).toISOString(),
    productUrl: productUrl(prepared),
    providerScope: prepared.provider.scope,
    fields: Object.fromEntries(prepared.form),
    imageBase64: prepared.photo.toString('base64'),
    imageType: prepared.imageType,
    existingProduct: prepared.existingProduct,
  };
}

export async function confirmOpenFoodFactsContribution(
  ownerId: string,
  actorId: string,
  foodId: string,
  input: unknown
): Promise<OpenFoodFactsConfirmResponse> {
  assertOwner(ownerId, actorId);
  const parsed = OpenFoodFactsConfirmRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new OpenFoodFactsContributionError(
      'Confirm the exact preview and your photo rights before publishing.',
      400
    );
  const { previewToken, ...options } = parsed.data;
  const [timestamp, signature] = previewToken.split('.');
  const expires = Number(timestamp);
  const stale = () =>
    new OpenFoodFactsContributionError(
      'The preview expired or the product, photo or account changed. Request a new preview before publishing.',
      409
    );
  if (
    !/^\d+\.[a-f0-9]{64}$/.test(previewToken) ||
    expires <= Date.now() ||
    expires > Date.now() + PREVIEW_LIFETIME_MS
  )
    throw stale();
  const prepared = await prepareContribution(ownerId, foodId, options);
  const expected = previewSignature(ownerId, foodId, expires, prepared);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    )
  )
    throw stale();

  // A preview is not an authorization to upload a different revision or use a
  // different account. Re-read the owner, server gate and provider immediately
  // before each public write; never reinterpret a changed record as consent.
  const beforeWrite = async () => {
    if (expires <= Date.now()) throw stale();
    const current = await getContributionContext(
      ownerId,
      foodId,
      options.productLanguage
    );
    if (
      JSON.stringify(current) !==
      JSON.stringify({ product: prepared.product, provider: prepared.provider })
    )
      throw stale();
  };
  // Evidence first: a failed photo upload must not leave unsupported numbers.
  // No unattended retries: an ambiguous result requires inspecting OFF again.
  const invalidateRejectedSession = (error: unknown) => {
    if (isOpenFoodFactsAuthenticationRejection(error)) {
      invalidateOpenFoodFactsSession(
        ownerId,
        prepared.provider.id,
        prepared.provider.scope
      );
    }
  };
  try {
    await submitOpenFoodFactsPhoto({
      baseUrl: prepared.baseUrl,
      session: prepared.session,
      barcode: prepared.product.barcode,
      language: prepared.product.language,
      photo: prepared.photo,
      imageType: options.imageType,
      attribution: prepared.attribution,
      beforeWrite,
    });
  } catch (error) {
    invalidateRejectedSession(error);
    throw error;
  }
  const result = {
    productUrl: productUrl(prepared),
    providerScope: prepared.provider.scope,
  };
  try {
    // Uploading a photo can itself change the public revision. Compare the
    // structured fields, not that revision, before sending the confirmed data.
    // OFF has no atomic conditional write, but edits during the photo request
    // must not be overwritten using a stale nutrition basis or public record.
    const currentPublic = await getOpenFoodFactsPublicProductState({
      baseUrl: prepared.baseUrl,
      session: prepared.session,
      barcode: prepared.product.barcode,
      language: prepared.product.language,
      executeProductRead: (operation) =>
        withOpenFoodFactsProductReadPermit(operation, { maxWaitMs: 10_000 }),
    });
    if (
      currentPublic.fields !== prepared.publicFields ||
      (prepared.existingProduct &&
        currentPublic.basis !== prepared.nutritionBasis)
    )
      throw stale();
    await submitPreparedOpenFoodFactsProduct({
      baseUrl: prepared.baseUrl,
      session: prepared.session,
      form: prepared.form,
      beforeWrite,
    });
    return {
      ...result,
      status: 'success',
      message: 'Open Food Facts confirmed the photo and product data.',
    };
  } catch (error) {
    invalidateRejectedSession(error);
    return {
      ...result,
      status: 'partial',
      message:
        'The photo was uploaded, but the product data could not be confirmed. Check the Open Food Facts product before requesting another preview.',
    };
  }
}
