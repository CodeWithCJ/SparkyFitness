import { tool } from 'ai';
import { log } from '../../config/logging.js';
import externalProviderService from '../../services/externalProviderService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatList } from './formatting.js';
import {
  INTEGRATION_ACTIONS,
  integrationsSchema,
  integrationsInput,
  type IntegrationsInput,
} from './schemas/integrations.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...INTEGRATION_ACTIONS];

interface ProviderView {
  id: string;
  provider_name: string;
  provider_type: string;
  is_active?: boolean;
  visibility?: string;
  has_token?: boolean;
  sync_frequency?: string | null;
  availability_error?: string | null;
}

interface ProviderTypeView {
  id: string;
  display_name: string;
  description?: string | null;
  categories?: string[] | null;
  supports_barcode?: boolean;
}

function formatProvider(p: ProviderView): string {
  const parts: string[] = [
    `**${p.provider_name}** (${p.provider_type}) — ${p.is_active ? 'active' : 'inactive'}`,
  ];
  if (p.visibility) {
    parts.push(`, ${p.visibility}`);
  }
  if (p.has_token === true) {
    parts.push(', token stored');
  }
  if (p.sync_frequency !== null && p.sync_frequency !== undefined) {
    parts.push(` — sync: ${p.sync_frequency}`);
  }
  let line = parts.join('');
  if (p.availability_error !== null && p.availability_error !== undefined) {
    line += `\n  ⚠ ${p.availability_error}`;
  }
  line += `\n  ID: ${p.id}`;
  return line;
}

function formatProviderType(t: ProviderTypeView): string {
  let line = `**${t.display_name}** (${t.id})`;
  if (t.description !== null && t.description !== undefined) {
    line += ` — ${t.description}`;
  }
  if (
    t.categories !== null &&
    t.categories !== undefined &&
    t.categories.length > 0
  ) {
    line += ` — categories: ${t.categories.join(', ')}`;
  }
  if (t.supports_barcode === true) {
    line += ' — supports barcode';
  }
  return line;
}

export function buildIntegrationsTools(userId: string, tz: string) {
  return {
    sparky_get_integrations: tool({
      description:
        'Read connected external integrations and available integration types. Actions: list_providers (connected external data providers for this user with status, visibility, and sync info — no credentials exposed), list_provider_types (catalog of available integration types). Read-only; does not manage credentials.',
      inputSchema: integrationsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'list_providers'
        );

        const parsed = integrationsSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: IntegrationsInput = parsed.data;

        try {
          switch (args.action) {
            case 'list_providers': {
              const providers =
                (await externalProviderService.getExternalDataProviders(
                  userId
                )) as unknown as ProviderView[];
              return formatList(
                providers,
                'Connected Integrations',
                formatProvider
              );
            }
            case 'list_provider_types': {
              const types =
                (await externalProviderService.getExternalProviderTypes()) as unknown as ProviderTypeView[];
              return formatList(
                types,
                'Available Integration Types',
                formatProviderType
              );
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as { action?: string }).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Integrations Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
