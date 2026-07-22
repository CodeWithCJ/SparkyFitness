import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Settings as SettingsIcon,
  ListChecks,
  Users,
  Tag,
  Cloud,
  Sparkles,
  UtensilsCrossed,
  ShieldAlert,
  Target,
  User,
  Database,
  Heart,
} from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import FamilyAccessManager from './FamilyAccessManager';
import AIServiceSettings from './AIServiceSettings';
import CustomCategoryManager from './CustomCategoryManager';
import MealTypeManager from './MealTypeManager';
import ExternalProviderSettings from './ExternalProviderSettings';
import NutrientDisplaySettings from './NutrientDisplaySettings';
import NutrientGoalDirectionSettings from './NutrientGoalDirectionSettings';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'; // Import Accordion components
import CalculationSettings from './CalculationSettings';
import TooltipWarning from '@/components/TooltipWarning';
import CustomNutrientsSettings from '@/pages/Settings/CustomNutrientsSettings';
import AllergenSettings from '@/pages/Settings/AllergenSettings';
import { DeveloperResources } from './DevloperResources';
import { AccountSecurity } from './AccountSecurity';
import { ApiSettings } from './ApiSettings';
import { WaterTrackingSettings } from './WaterTrackingSettings';
import CycleSettings from './CycleSettings';
import { PreferenceSettings } from './PreferenceSettings';
import { ProfileInformation } from './ProfileInformation';
import { DataManagementSettings } from './DataManagementSettings';
import { DataImportSettings } from './DataImportSettings';

export interface PasswordFormState {
  current_password: string;
  new_password: string;
  confirm_password: string;
}
const SECTION_TO_TAB_MAP: Record<string, string> = {
  'profile-information': 'profile-account',
  'user-preferences': 'profile-account',
  'account-security': 'profile-account',
  'family-access': 'profile-account',
  'data-management': 'profile-account',
  'allergen-preferences': 'nutrition-diet',
  'custom-nutrients': 'nutrition-diet',
  'nutrient-display': 'nutrition-diet',
  'nutrient-goal-direction': 'nutrition-diet',
  'custom-meals': 'nutrition-diet',
  'calculation-settings': 'nutrition-diet',
  'water-tracking': 'nutrition-diet',
  'cycle-settings': 'wellness',
  'custom-categories': 'wellness',
  'food-and-exercise-data-providers': 'developer-integrations',
  'ai-service': 'developer-integrations',
  'api-settings': 'developer-integrations',
  'developer-resources': 'developer-integrations',
  integrations: 'developer-integrations',
};

const Settings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const section = queryParams.get('section');
  const tab = queryParams.get('tab');
  const defaultExpanded: string[] = [];

  if (section) {
    if (section === 'integrations') {
      defaultExpanded.push('food-and-exercise-data-providers');
    } else {
      defaultExpanded.push(section);
    }
  }

  const activeTab = (() => {
    if (section && SECTION_TO_TAB_MAP[section]) {
      return SECTION_TO_TAB_MAP[section];
    }
    if (tab) {
      return tab;
    }
    return 'profile-account';
  })();

  const handleTabChange = (value: string) => {
    navigate(`/settings?tab=${value}`);
  };

  return (
    <div className="space-y-6 w-full">
      <Tabs value={activeTab} className="w-full">
        {/* Navigation Pills */}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-6">
          {[
            {
              id: 'profile-account',
              label: t('settings.tabs.profileAccount', 'Profile & Account'),
              icon: User,
            },
            {
              id: 'nutrition-diet',
              label: t('settings.tabs.nutritionDiet', 'Nutrition & Diet'),
              icon: UtensilsCrossed,
            },
            {
              id: 'wellness',
              label: t('settings.tabs.wellness', 'Wellness'),
              icon: Heart,
            },
            {
              id: 'developer-integrations',
              label: t(
                'settings.tabs.developerIntegrations',
                'Developer & Integrations'
              ),
              icon: SettingsIcon,
            },
          ].map((type) => {
            const Icon = type.icon;
            const isActive = activeTab === type.id;
            return (
              <Button
                key={type.id}
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleTabChange(type.id)}
                className={`rounded-full px-4 h-9 gap-2 transition-all ${
                  isActive
                    ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 font-normal'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs">{type.label}</span>
              </Button>
            );
          })}
        </div>

        <TabsContent value="profile-account" className="mt-0">
          <Accordion
            type="multiple"
            className="w-full"
            defaultValue={defaultExpanded}
          >
            <AccordionItem
              value="profile-information"
              className="border rounded-lg mb-4"
            >
              <ProfileInformation />
            </AccordionItem>
            <AccordionItem
              value="user-preferences"
              className="border rounded-lg mb-4"
            >
              <PreferenceSettings />
            </AccordionItem>
            <AccordionItem
              value="family-access"
              className="border rounded-lg mb-4"
            >
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
              value="data-management"
              className="border rounded-lg mb-4"
            >
              <AccordionTrigger
                className="flex items-center gap-2 p-4 hover:no-underline"
                description={t(
                  'settings.dataManagement.subtitle',
                  'Import, export, or manage your data'
                )}
              >
                <Database className="h-5 w-5" />
                {t('settings.dataManagement.sectionTitle', 'Data Management')}
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-0 space-y-6">
                <DataImportSettings />
                <DataManagementSettings />
              </AccordionContent>
            </AccordionItem>
            <AccountSecurity />
          </Accordion>
        </TabsContent>

        <TabsContent value="nutrition-diet" className="mt-0">
          <Accordion
            type="multiple"
            className="w-full"
            defaultValue={defaultExpanded}
          >
            <AccordionItem
              value="allergen-preferences"
              className="border rounded-lg mb-4"
            >
              <AccordionTrigger
                className="flex items-center gap-2 p-4 hover:no-underline"
                description={t(
                  'settings.allergenPreferences.description',
                  'Track allergens you want to be warned about in foods'
                )}
              >
                <ShieldAlert className="h-5 w-5" />
                {t(
                  'settings.allergenPreferences.title',
                  'Allergen Preferences'
                )}
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-0">
                <AllergenSettings />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="custom-nutrients"
              className="border rounded-lg mb-4"
            >
              <AccordionTrigger
                className="flex items-center gap-2 p-4 hover:no-underline"
                description={t(
                  'settings.customNutrients.subtitle',
                  'Manage your custom nutrient definitions'
                )}
              >
                <ListChecks className="h-5 w-5" />
                {t('settings.customNutrients.title', 'Custom Nutrients')}
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
              value="nutrient-goal-direction"
              className="border rounded-lg mb-4"
            >
              <AccordionTrigger
                className="flex items-center gap-2 p-4 hover:no-underline"
                description={t(
                  'settings.nutrientGoalDirection.description',
                  'Choose whether each nutrient goal is a minimum to reach, a maximum to stay under, or a target range to hit'
                )}
              >
                <Target className="h-5 w-5" />
                {t(
                  'settings.nutrientGoalDirection.title',
                  'Nutrient Goal Direction'
                )}
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-0">
                <NutrientGoalDirectionSettings />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="custom-meals"
              className="border rounded-lg mb-4"
            >
              <AccordionTrigger
                className="flex items-center gap-2 p-4 hover:no-underline"
                description={t(
                  'settings.customMeals.subtitle',
                  'Create and manage custom meal types'
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
              value="calculation-settings"
              className="border rounded-lg mb-4"
            >
              <AccordionTrigger
                className="flex items-center gap-2 p-4 hover:no-underline"
                description={t(
                  'settings.calculationSettings.description',
                  'Manage BMR formulas, body fat algorithms, daily energy adjustments, goal deficit modes, and safety floors.'
                )}
              >
                <SettingsIcon className="h-5 w-5" />
                {t(
                  'settings.calculationSettings.title',
                  'Calculation Settings'
                )}
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-0 space-y-4">
                <CalculationSettings />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="water-tracking"
              className="border rounded-lg mb-4"
            >
              <WaterTrackingSettings />
            </AccordionItem>
          </Accordion>
        </TabsContent>

        <TabsContent value="wellness" className="mt-0">
          <Accordion
            type="multiple"
            className="w-full"
            defaultValue={defaultExpanded}
          >
            <AccordionItem
              value="cycle-settings"
              className="border rounded-lg mb-4"
            >
              <CycleSettings />
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
          </Accordion>
        </TabsContent>

        <TabsContent value="developer-integrations" className="mt-0">
          <Accordion
            type="multiple"
            className="w-full"
            defaultValue={defaultExpanded}
          >
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
            <AccordionItem
              value="ai-service"
              className="border rounded-lg mb-4"
            >
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
          </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
