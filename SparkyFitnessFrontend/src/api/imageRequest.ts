/**
 * Shared transport rules for endpoints that accept images.
 *
 * Every image-carrying endpoint follows the same contract: an ordered `images`
 * array where `__new__<n>` placeholders reserve the position of the n-th
 * uploaded file, and the files themselves under the same field name. Keeping
 * that in one place stops the rule from drifting between the food, meal, and
 * diary flows.
 */

/**
 * Builds a multipart body carrying an image order plus the files it references.
 * Anything omitted from `images` is deleted server-side.
 */
export function buildImageFormData(
  images: string[],
  newFiles: File[]
): FormData {
  const formData = new FormData();
  formData.append('images', JSON.stringify(images));
  newFiles.forEach((file) => formData.append('images', file));
  return formData;
}

/**
 * Chooses the transport for a payload that may carry files.
 *
 * With no files the payload goes as plain JSON. With files it must be
 * multipart, so the JSON payload rides along in a single field (named per
 * endpoint, e.g. `foodData`) alongside the binary parts.
 */
export function buildPayloadRequest(
  payload: Record<string, unknown>,
  wrapperField: string,
  imageFiles?: File[]
): { body: Record<string, unknown> } | { body: FormData; isFormData: true } {
  if (!imageFiles || imageFiles.length === 0) {
    return { body: payload };
  }
  const formData = new FormData();
  formData.append(wrapperField, JSON.stringify(payload));
  imageFiles.forEach((file) => formData.append('images', file));
  return { body: formData, isFormData: true };
}
