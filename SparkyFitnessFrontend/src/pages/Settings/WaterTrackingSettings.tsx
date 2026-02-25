import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, Droplet } from 'lucide-react';
import WaterContainerManager from './WaterContainerManager';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'; // Import Accordion components
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export const WaterTrackingSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { water_display_unit, saveAllPreferences, setWaterDisplayUnit } =
    usePreferences();
  const [localWaterUnit, setLocalWaterUnit] = useState(water_display_unit);

  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setLocalWaterUnit(water_display_unit);
  }, [water_display_unit]);

  const handlePreferencesUpdate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await saveAllPreferences({
        water_display_unit: localWaterUnit,
      }); // Pass the new logging level directly
      setWaterDisplayUnit(localWaterUnit);

      toast({
        title: t('settings.preferences.successTitle', 'Erfolg'),
        description: t(
          'settings.preferences.successDescription',
          'Preferences saved.'
        ),
      });
    } catch (error: unknown) {
      console.error('Error updating preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccordionItem value="water-tracking" className="border rounded-lg mb-4">
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.waterTracking.description',
          'Configure your water intake tracking settings'
        )}
      >
        <Droplet className="h-5 w-5" />
        {t('settings.waterTracking.title', 'Water Tracking')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="water_display_unit">
            {t('settings.waterTracking.waterDisplayUnit', 'Water Display Unit')}
          </Label>
          <Select
            value={localWaterUnit}
            onValueChange={(unit: 'ml' | 'oz' | 'liter') =>
              setLocalWaterUnit(unit)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ml">
                {t('settings.waterTracking.milliliters', 'Milliliters (ml)')}
              </SelectItem>
              <SelectItem value="oz">
                {t('settings.waterTracking.fluidOunces', 'Fluid Ounces (oz)')}
              </SelectItem>
              <SelectItem value="liter">
                {t('settings.waterTracking.liters', 'Liters')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handlePreferencesUpdate} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading
            ? t('settings.profileInformation.saving', 'Saving...')
            : t(
                'settings.waterTracking.saveWaterDisplayUnit',
                'Save Water Display Unit'
              )}
        </Button>
        <Separator />
        <WaterContainerManager />
      </AccordionContent>
    </AccordionItem>
  );
};
