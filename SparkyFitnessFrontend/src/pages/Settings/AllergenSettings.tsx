import type React from 'react';
import { useState } from 'react';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Trash2, RefreshCw } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { useSyncAllergens } from '@/hooks/useSyncAllergens';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  useAllergenPreferences,
  useAddAllergenPreferenceMutation,
  useRemoveAllergenPreferenceMutation,
} from '@/hooks/useAllergenPreferences';
import { useTranslation } from 'react-i18next';

const COMMON_ALLERGENS = [
  'gluten',
  'wheat',
  'milk',
  'eggs',
  'peanuts',
  'tree nuts',
  'soy',
  'fish',
  'shellfish',
  'crustaceans',
  'sesame',
  'celery',
  'mustard',
  'lupin',
  'sulphites',
];

const AllergenSettings: React.FC = () => {
  const { t } = useTranslation();
  const [newAllergen, setNewAllergen] = useState('');
  const { toast } = useToast();
  const { handleSyncAllergens, syncingAllergens } = useSyncAllergens();

  const { data: preferences } = useAllergenPreferences();
  const { mutateAsync: addAllergen } = useAddAllergenPreferenceMutation();
  const { mutate: removeAllergen } = useRemoveAllergenPreferenceMutation();

  const existingNames = new Set(
    preferences?.map((p) => p.allergen_name.toLowerCase()) ?? []
  );

  const handleAdd = async (name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    if (existingNames.has(trimmed)) {
      toast({
        title: t('settings.allergens.alreadyAdded', 'Already added'),
        description: t('settings.allergens.alreadyAddedDescription', {
          name: trimmed,
          defaultValue: `${trimmed} is already in your list.`,
        }),
      });
      return;
    }
    try {
      await addAllergen(trimmed);
      setNewAllergen('');
    } catch {
      // error surfaced via global query error handler
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd(newAllergen);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {t('settings.allergens.title', 'Allergen Preferences')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.allergens.description',
          'Add the allergens you want to be warned about. When a food contains one of these, a warning badge will appear on food cards and search results.'
        )}
      </p>

      <div className="p-4 border rounded-md shadow-sm space-y-4">
        <h3 className="text-xl font-semibold">
          {t('settings.allergens.common', 'Common Allergens')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {COMMON_ALLERGENS.map((allergen) => {
            const already = existingNames.has(allergen);
            return (
              <Badge
                key={allergen}
                variant={already ? 'default' : 'outline'}
                className={`cursor-pointer capitalize select-none ${already ? 'opacity-50 pointer-events-none' : 'hover:bg-accent'}`}
                onClick={() => !already && handleAdd(allergen)}
              >
                {t(`settings.allergens.names.${allergen}`, allergen)}
              </Badge>
            );
          })}
        </div>

        <div className="pt-2">
          <Label htmlFor="customAllergen">
            {t('settings.allergens.custom', 'Custom allergen')}
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="customAllergen"
              value={newAllergen}
              onChange={(e) => setNewAllergen(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t(
                'settings.allergens.customPlaceholder',
                'e.g., lupin, molluscs…'
              )}
              className="max-w-xs"
            />
            <Button
              onClick={() => handleAdd(newAllergen)}
              disabled={!newAllergen.trim()}
            >
              {t('common.add', 'Add')}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 border rounded-md shadow-sm space-y-2">
        <h3 className="text-xl font-semibold">
          {t('settings.allergens.syncTitle', 'Sync from OpenFoodFacts')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.allergens.syncDescription',
            'Fetch allergen data for your saved OpenFoodFacts foods. Only needs to be done once.'
          )}
        </p>
        <Button
          variant="outline"
          onClick={handleSyncAllergens}
          disabled={syncingAllergens}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${syncingAllergens ? 'animate-spin' : ''}`}
          />
          {syncingAllergens
            ? t('settings.allergens.syncing', 'Syncing…')
            : t('settings.allergens.sync', 'Sync Allergens')}
        </Button>
      </div>

      <div className="p-4 border rounded-md shadow-sm">
        <h3 className="text-xl font-semibold mb-4">
          {t('settings.allergens.tracked', 'Your Tracked Allergens')}
        </h3>
        {!preferences || preferences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.allergens.empty',
              'No allergens tracked yet. Add some above to get warnings on food cards.'
            )}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('settings.allergens.allergen', 'Allergen')}
                </TableHead>
                <TableHead className="text-right">
                  {t('common.actions', 'Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preferences.map((pref) => (
                <TableRow key={pref.id}>
                  <TableCell className="capitalize">
                    {t(
                      `settings.allergens.names.${pref.allergen_name}`,
                      pref.allergen_name
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                      onClick={() => removeAllergen(pref.id)}
                      title={t('settings.allergens.remove', 'Remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default AllergenSettings;
