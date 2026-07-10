import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) =>
      ({
        'foodSearchDialog.title': 'البحث عن صنف غذائي',
        'foodSearchDialog.description':
          'ابحث في مكتبتك أو المصادر الخارجية وأضف الصنف اللي تبيه.',
      })[key] ?? fallback,
  }),
}));

jest.mock('@/components/FoodSearch/FoodSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="food-search" />,
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

describe('FoodSearchDialog', () => {
  it('uses the Arabic defaults when no context copy is provided', () => {
    render(
      <FoodSearchDialog
        open={true}
        onOpenChange={jest.fn()}
        onFoodSelect={jest.fn()}
      />
    );

    expect(screen.getByText('البحث عن صنف غذائي')).toBeInTheDocument();
    expect(
      screen.getByText(
        'ابحث في مكتبتك أو المصادر الخارجية وأضف الصنف اللي تبيه.'
      )
    ).toBeInTheDocument();
  });

  it('preserves context-specific Arabic copy from the parent flow', () => {
    render(
      <FoodSearchDialog
        open={true}
        onOpenChange={jest.fn()}
        onFoodSelect={jest.fn()}
        title="إضافة مكوّن للوجبة"
        description="اختر صنفًا أو وجبة محفوظة."
      />
    );

    expect(screen.getByText('إضافة مكوّن للوجبة')).toBeInTheDocument();
    expect(screen.getByText('اختر صنفًا أو وجبة محفوظة.')).toBeInTheDocument();
  });
});
