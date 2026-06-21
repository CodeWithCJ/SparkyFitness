export interface ExternalProvider {
  id: string;
  provider_name: string;
  provider_type: string;
  is_active: boolean;
  categories?: string[];
  supports_barcode?: boolean;
}
