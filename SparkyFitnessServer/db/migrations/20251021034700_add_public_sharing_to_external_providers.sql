ALTER TABLE public.external_data_providers
ADD COLUMN shared_with_public BOOLEAN NOT NULL DEFAULT FALSE;