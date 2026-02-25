import {
  getSupportedLanguages,
  getLanguageDisplayName,
} from '@/utils/languageUtils'; // Import language utilities
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, Settings as SettingsIcon } from 'lucide-react';
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

export const PreferenceSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    weightUnit,
    setWeightUnit,
    measurementUnit,
    setMeasurementUnit,
    distanceUnit,
    setDistanceUnit,
    energyUnit,
    setEnergyUnit, // Add energyUnit and setEnergyUnit
    dateFormat,
    setDateFormat,
    itemDisplayLimit,
    setItemDisplayLimit, // Add itemDisplayLimit and setItemDisplayLimit
    autoScaleOpenFoodFactsImports,
    setAutoScaleOpenFoodFactsImports, // Add auto-scale preference
    setLanguage,
    language,
    loggingLevel,
    saveAllPreferences,
  } = usePreferences();

  const [localLoggingLevel, setLocalLoggingLevel] = useState(loggingLevel);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setLocalLoggingLevel(loggingLevel);
  }, [loggingLevel]);

  const handlePreferencesUpdate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await saveAllPreferences({
        weightUnit,
        measurementUnit,
        distanceUnit,
        energyUnit,
        dateFormat,
        itemDisplayLimit,
        autoScaleOpenFoodFactsImports,
        language,
        loggingLevel: localLoggingLevel,
      });
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
    <AccordionItem value="user-preferences" className="border rounded-lg mb-4">
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.preferences.description',
          'Customize your app settings and display preferences'
        )}
      >
        <SettingsIcon className="h-5 w-5" />
        {t('settings.preferences.title', 'Preferences')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="date_format">
              {t('settings.preferences.dateFormat', 'Date Format')}
            </Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/dd/yyyy">
                  MM/dd/yyyy (12/25/2024)
                </SelectItem>
                <SelectItem value="dd/MM/yyyy">
                  dd/MM/yyyy (25/12/2024)
                </SelectItem>
                <SelectItem value="dd-MMM-yyyy">
                  dd-MMM-yyyy (25-Dec-2024)
                </SelectItem>
                <SelectItem value="yyyy-MM-dd">
                  yyyy-MM-dd (2024-12-25)
                </SelectItem>
                <SelectItem value="MMM dd, yyyy">
                  MMM dd, yyyy (Dec 25, 2024)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="weight_unit">
              {t('settings.preferences.weightUnit', 'Weight Unit')}
            </Label>
            <Select value={weightUnit} onValueChange={setWeightUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">
                  {t('settings.preferences.kilograms', 'Kilograms (kg)')}
                </SelectItem>
                <SelectItem value="lbs">
                  {t('settings.preferences.pounds', 'Pounds (lbs)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="measurement_unit">
              {t('settings.preferences.measurementUnit', 'Measurement Unit')}
            </Label>
            <Select value={measurementUnit} onValueChange={setMeasurementUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cm">
                  {t('settings.preferences.centimeters', 'Centimeters (cm)')}
                </SelectItem>
                <SelectItem value="inches">
                  {t('settings.preferences.inches', 'Inches (in)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="distance_unit">
              {t('settings.preferences.distanceUnit', 'Distance Unit')}
            </Label>
            <Select value={distanceUnit} onValueChange={setDistanceUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="km">
                  {t('settings.preferences.kilometers', 'Kilometers (km)')}
                </SelectItem>
                <SelectItem value="miles">
                  {t('settings.preferences.miles', 'Miles (miles)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="energy_unit">
              {t('settings.preferences.energyUnit', 'Energy Unit')}
            </Label>
            <Select
              value={energyUnit}
              onValueChange={(value) => setEnergyUnit(value as 'kcal' | 'kJ')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kcal">
                  {t('settings.preferences.calories', 'Calories (kcal)')}
                </SelectItem>
                <SelectItem value="kJ">
                  {t('settings.preferences.joules', 'Joules (kJ)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="logging_level">
              {t('settings.preferences.loggingLevel', 'Minimum Logging Level')}
            </Label>
            <Select
              value={localLoggingLevel}
              onValueChange={(value) =>
                setLocalLoggingLevel(
                  value as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBUG">
                  {t('settings.preferences.debug', 'DEBUG (Most Detailed)')}
                </SelectItem>
                <SelectItem value="INFO">
                  {t('settings.preferences.info', 'INFO')}
                </SelectItem>
                <SelectItem value="WARN">
                  {t('settings.preferences.warn', 'WARN')}
                </SelectItem>
                <SelectItem value="ERROR">
                  {t('settings.preferences.error', 'ERROR')}
                </SelectItem>
                <SelectItem value="SILENT">
                  {t('settings.preferences.silent', 'SILENT (No Logs)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="item_display_limit">
              {t(
                'settings.preferences.itemDisplayLimit',
                'Search/Recent/Top Limit'
              )}
            </Label>
            <Select
              value={String(itemDisplayLimit)}
              onValueChange={(value) => setItemDisplayLimit(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">
                  {t('settings.preferences.items', {
                    count: 5,
                    defaultValue: '{{count}} items',
                  })}
                </SelectItem>
                <SelectItem value="10">
                  {t('settings.preferences.items', {
                    count: 10,
                    defaultValue: '{{count}} items',
                  })}
                </SelectItem>
                <SelectItem value="15">
                  {t('settings.preferences.items', {
                    count: 15,
                    defaultValue: '{{count}} items',
                  })}
                </SelectItem>
                <SelectItem value="20">
                  {t('settings.preferences.items', {
                    count: 20,
                    defaultValue: '{{count}} items',
                  })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="language">
              {t('settings.preferences.language', 'Language')}
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSupportedLanguages().map((langCode) => (
                  <SelectItem key={langCode} value={langCode}>
                    {getLanguageDisplayName(langCode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between col-span-2 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="auto-scale-openfoodfacts">
                {t(
                  'settings.preferences.autoScaleOpenFoodFacts',
                  'Auto-scale OpenFoodFacts Imports'
                )}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  'settings.preferences.autoScaleOpenFoodFactsHint',
                  "When enabled, nutrition values from OpenFoodFacts will be automatically scaled from per-100g to the product's serving size."
                )}
              </p>
            </div>
            <Switch
              id="auto-scale-openfoodfacts"
              checked={autoScaleOpenFoodFactsImports}
              onCheckedChange={setAutoScaleOpenFoodFactsImports}
            />
          </div>
        </div>
        <Button onClick={handlePreferencesUpdate} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading
            ? t('settings.profileInformation.saving', 'Saving...')
            : t('settings.preferences.savePreferences', 'Save Preferences')}
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
};
