import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import {
  Settings as SettingsIcon,
  ListChecks,
  Users,
  Tag,
  Cloud,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import FamilyAccessManager from './FamilyAccessManager';
import AIServiceSettings from './AIServiceSettings';
import CustomCategoryManager from './CustomCategoryManager';
import MealTypeManager from './MealTypeManager';
import ExternalProviderSettings from './ExternalProviderSettings';
import NutrientDisplaySettings from './NutrientDisplaySettings';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'; // Import Accordion components
import CalculationSettings from './CalculationSettings';
import TooltipWarning from '@/components/TooltipWarning';
import CustomNutrientsSettings from '@/pages/Settings/CustomNutrientsSettings';
import { DeveloperResources } from './DevloperResources';
import { AccountSecurity } from './AccountSecurity';
import { ApiSettings } from './ApiSettings';
import { WaterTrackingSettings } from './WaterTrackingSettings';
import { PreferenceSettings } from './PreferenceSettings';
import { ProfileInformation } from './ProfileInformation';

export interface PasswordFormState {
  current_password: string;
  new_password: string;
  confirm_password: string;
}
const Settings = () => {
  const { t } = useTranslation();

  const location = useLocation(); // Hook to get current location

  const queryParams = new URLSearchParams(location.search);
  const defaultExpanded =
    queryParams.get('section') === 'integrations'
      ? ['food-and-exercise-data-providers']
      : [];

  return (
    <div className="space-y-6 w-full">
      {/* Removed redundant Settings heading */}
      <Accordion
        type="multiple"
        className="w-full"
        defaultValue={defaultExpanded}
      >
        {/* Profile Information */}
        <ProfileInformation />

        <PreferenceSettings />

        <WaterTrackingSettings />

        <AccordionItem
          value="custom-nutrients"
          className="border rounded-lg mb-4"
        >
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description="Manage your custom nutrient definitions"
          >
            <ListChecks className="h-5 w-5" />
            Custom Nutrients
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <CustomNutrientsSettings />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="nutrient-display"
          className="border rounded-lg mb-4"
        >
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.nutrientDisplay.description',
              'Choose which nutrients to display in food and meal views'
            )}
          >
            <ListChecks className="h-5 w-5" />
            {t('settings.nutrientDisplay.title', 'Nutrient Display')}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <NutrientDisplaySettings />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="calculation-settings"
          className="border rounded-lg mb-4"
        >
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.calculationSettings.description',
              'Manage BMR and Body Fat calculation preferences'
            )}
          >
            <SettingsIcon className="h-5 w-5" />
            {t('settings.calculationSettings.title', 'Calculation Settings')}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-4">
            <CalculationSettings />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="family-access" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.familyAccess.description',
              'Manage access to your data for family members'
            )}
          >
            <Users className="h-5 w-5" />
            {t('settings.familyAccess.title', 'Family Access')}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <FamilyAccessManager />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="custom-categories"
          className="border rounded-lg mb-4"
        >
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.customCategories.description',
              'Create and manage custom measurement categories'
            )}
          >
            <Tag className="h-5 w-5" />
            {t('settings.customCategories.title', 'Custom Categories')}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <CustomCategoryManager />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="custom-meals" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.customMeals.description',
              'Create and manage custom meals types'
            )}
          >
            <UtensilsCrossed className="h-5 w-5" />
            {t('settings.customMeals.title', 'Custom Meals')}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <MealTypeManager />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="food-and-exercise-data-providers"
          className="border rounded-lg mb-4"
        >
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.foodExerciseDataProviders.description',
              'Configure external food and exercise data sources and synchronize data with Garmin Connect'
            )}
          >
            <Cloud className="h-5 w-5" />
            {t(
              'settings.foodExerciseDataProviders.title',
              'Food & Exercise Data Providers'
            )}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0 space-y-4">
            <TooltipWarning
              warningMsg={t(
                'settings.foodExerciseDataProviders.invalidKeyLengthWarning',
                'If you encounter an "Invalid key length" error, ensure your encryption key in the server\'s env variables are 64 hex.'
              )}
            />
            <ExternalProviderSettings />
            <Separator />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ai-service" className="border rounded-lg mb-4">
          <AccordionTrigger
            className="flex items-center gap-2 p-4 hover:no-underline"
            description={t(
              'settings.aiService.description',
              'Manage settings for AI-powered features'
            )}
          >
            <Sparkles className="h-5 w-5" />
            {t('settings.aiService.title', 'AI Service')}
          </AccordionTrigger>
          <AccordionContent className="p-4 pt-0">
            <TooltipWarning
              warningMsg={t(
                'settings.aiService.invalidKeyLengthWarning',
                'If you encounter an "Invalid key length" error, ensure your encryption key in the server\'s env variables are 64 hex.'
              )}
            />
            <AIServiceSettings />
          </AccordionContent>
        </AccordionItem>

        <ApiSettings />

        <DeveloperResources />

        <AccountSecurity />
      </Accordion>
    </div>
  );
};

export default Settings;
