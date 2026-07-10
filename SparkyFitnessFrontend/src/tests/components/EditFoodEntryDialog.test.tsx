import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditFoodEntryDialog from '@/pages/Diary/EditFoodEntryDialog';
import type { FoodEntry } from '@/types/food';
import type { MealTypeDefinition } from '@/types/diary';

const mockUpdateFoodEntry = jest.fn();
const mockCreateVariant = jest.fn();
let mockVariantsData: unknown[] = [];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, string | number>) => {
      const values = typeof options === 'object' ? options : {};
      const translations: Record<string, string> = {
        'foodEntryEditor.title': 'تعديل سجل الطعام',
        'foodEntryEditor.description': 'عدّل الكمية أو وحدة الحصة أو الوجبة.',
        'foodEntryEditor.latestVariantNotice':
          'بنحدّث هذا السجل باستخدام أحدث بيانات الحصة المتاحة للطعام.',
        'foodEntryEditor.loading': 'جارٍ تحميل بيانات الطعام…',
        'foodEntryEditor.quantity': 'الكمية',
        'foodEntryEditor.unit': 'الوحدة',
        'foodEntryEditor.meal': 'الوجبة',
        'foodEntryEditor.customUnit': 'وحدة مخصصة…',
        'foodEntryEditor.unitName': 'اسم الوحدة',
        'foodEntryEditor.unitNamePlaceholder': 'مثل: شريحة، حبة، مغرفة',
        'foodEntryEditor.conversionFactorPlaceholder': 'مثل: 1',
        'foodEntryEditor.cancel': 'إلغاء',
        'foodEntryEditor.save': 'حفظ التغييرات',
        'foodEntryEditor.saving': 'جارٍ الحفظ…',
        'foodEntryEditor.confidence.high': 'عالية',
        'foodEntryEditor.confidence.medium': 'متوسطة',
        'foodEntryEditor.confidence.low': 'منخفضة',
      };

      if (key === 'foodEntryEditor.manualConversionHelp') {
        return `ما قدرنا نحول تلقائيًا بين ${values['from']} و${values['to']}.`;
      }
      if (key === 'foodEntryEditor.aiEstimate') {
        return `تقدير آلي (ثقة ${values['confidence']})`;
      }
      if (key === 'foodEntryEditor.conversionEquation') {
        return `1 ${values['from']} = كم ${values['to']}؟`;
      }

      return translations[key] ?? (typeof options === 'string' ? options : key);
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'DEBUG',
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
    nutrientDisplayPreferences: [],
  }),
}));

jest.mock('@/utils/logging', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({
    data: [],
  }),
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  useFoodView: () => ({
    data: {
      id: 'food-1',
      name: 'Cornstarch',
      is_custom: true,
      default_variant: {
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
        calories: 10,
        protein: 1,
        carbs: 1,
        fat: 1,
      },
    },
    isLoading: false,
  }),
}));

jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  useFoodVariants: () => ({
    data: mockVariantsData,
    isLoading: false,
  }),
  useCreateFoodVariantMutation: () => ({
    isPending: false,
    mutateAsync: mockCreateVariant,
  }),
}));

jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useUpdateFoodEntryMutation: () => ({
    mutateAsync: mockUpdateFoodEntry,
  }),
}));

jest.mock('@/pages/Diary/NutrientsGrid', () => ({
  NutrientGrid: () => <div data-testid="nutrient-grid" />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<(value: string) => void>(() => {});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange ?? (() => {})}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const onValueChange = React.useContext(SelectContext);

      return (
        <button
          type="button"
          data-value={value}
          onClick={() => onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    SelectSeparator: () => <div data-testid="select-separator" />,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: () => <span />,
  };
});

jest.mock('lucide-react', () => {
  const actual = jest.requireActual('lucide-react');

  return {
    ...actual,
    Check: ({ className }: { className?: string }) => (
      <svg data-testid="check-icon" className={className} />
    ),
    Sparkles: ({
      className,
      ...props
    }: React.SVGProps<SVGSVGElement> & { className?: string }) => (
      <svg data-testid="sparkles-icon" className={className} {...props} />
    ),
  };
});

const mealTypes: MealTypeDefinition[] = [
  {
    id: 'meal-1',
    name: 'Breakfast',
    sort_order: 1,
    user_id: null,
  },
];

const entry: FoodEntry = {
  id: 'entry-1',
  food_id: 'food-1',
  meal_type: 'Breakfast',
  meal_type_id: 'meal-1',
  quantity: 1,
  unit: 'g',
  variant_id: 'default-variant',
  food_name: 'Cornstarch',
  entry_date: '2026-04-18',
};

describe('EditFoodEntryDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVariantsData = [];
  });

  it('shows the manual warning, hides preview, and disables save for unresolved incompatible units', async () => {
    render(
      <EditFoodEntryDialog
        entry={entry}
        open={true}
        onOpenChange={jest.fn()}
        availableMealTypes={mealTypes}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cornstarch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^tsp$/i }));

    await waitFor(() => {
      expect(screen.getByText(/ما قدرنا نحول تلقائيًا/)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('مثل: 1')).toBeInTheDocument();
    expect(screen.queryByTestId('nutrient-grid')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حفظ التغييرات' })
    ).toBeDisabled();
  });

  it('shows AI provenance on saved variants and hides compatible checks when an AI variant is selected', async () => {
    mockVariantsData = [
      {
        id: 'cup-ai',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 30,
        protein: 1,
        carbs: 1,
        fat: 1,
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
    ];

    render(
      <EditFoodEntryDialog
        entry={{ ...entry, variant_id: 'cup-ai', unit: 'cup' }}
        open={true}
        onOpenChange={jest.fn()}
        availableMealTypes={mealTypes}
      />
    );

    await waitFor(() => {
      expect(
        screen.getAllByLabelText(/تقدير آلي \(ثقة متوسطة\)/).length
      ).toBeGreaterThan(0);
    });

    const tbspButton = screen.getByRole('button', { name: /^tbsp$/i });
    expect(tbspButton.querySelector('svg.text-green-500')).toBeNull();
  });
});
