import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { getExternalDataProviders } from '@/services/externalProviderService';
import { useSyncAll } from '@/hooks/Integrations/useSyncAll';
import { cn } from '@/lib/utils';
import { MANUAL_SYNC_PROVIDERS } from '@/constants/integrationConstants';

const GlobalSyncButton: React.FC = () => {
  const { t } = useTranslation();
  const [isSyncing, setIsSyncing] = useState(false);
  const { syncAll } = useSyncAll();

  const { data: providers } = useQuery({
    queryKey: ['externalProviders'],
    queryFn: getExternalDataProviders,
    // Only fetch if authenticated (handled by top level App usually)
  });

  const handleSync = async () => {
    if (isSyncing || !providers) return;

    setIsSyncing(true);
    try {
      // Cast to the type expected by useSyncAll
      await syncAll(providers);
    } finally {
      setIsSyncing(false);
    }
  };

  const hasManualSyncProviders = providers?.some((p) =>
    (MANUAL_SYNC_PROVIDERS as readonly string[]).includes(
      p.provider_type
    ) && p.is_active
  );

  if (!hasManualSyncProviders) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSync}
            disabled={isSyncing}
            className="h-9 w-9"
          >
            <RefreshCw
              className={cn(
                'h-5 w-5 transition-all text-muted-foreground hover:text-foreground',
                isSyncing && 'animate-spin'
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isSyncing
              ? t('sync.syncingAll', 'Syncing all providers...')
              : t('sync.syncAll', 'Sync all active providers')}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GlobalSyncButton;
