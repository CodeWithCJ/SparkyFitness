-- The external_data_providers table was created without a primary key on id.
-- Add one so we can create foreign key references to it.
ALTER TABLE public.external_data_providers
  ADD CONSTRAINT external_data_providers_pkey PRIMARY KEY (id);

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS default_barcode_provider_id UUID;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT fk_default_barcode_provider
    FOREIGN KEY (default_barcode_provider_id)
    REFERENCES external_data_providers(id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE public.user_preferences
  VALIDATE CONSTRAINT fk_default_barcode_provider;
