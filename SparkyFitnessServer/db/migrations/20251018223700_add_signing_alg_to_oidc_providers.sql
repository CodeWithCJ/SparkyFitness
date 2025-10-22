-- Migration to add signing algorithm and timeout fields to the oidc_providers table

ALTER TABLE oidc_providers
ADD COLUMN signing_algorithm VARCHAR(50) DEFAULT 'RS256',
ADD COLUMN profile_signing_algorithm VARCHAR(50),
ADD COLUMN timeout INTEGER DEFAULT 3500;