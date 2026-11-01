import type { BarcodeAlternativesResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';

const barcodeEndpoint = (barcode: string) =>
  `/api/v2/foods/barcode/${encodeURIComponent(barcode)}`;

export const fetchBarcodeAlternatives = (barcode: string) =>
  apiFetch<BarcodeAlternativesResponse>({
    endpoint: `${barcodeEndpoint(barcode)}/alternatives`,
    serviceName: 'Barcode Sources',
    operation: 'load barcode sources',
  });
