import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SymptomLogForm from '@/pages/Symptoms/SymptomLogForm';
import { simulatePageTranslation } from '../../utils/simulatePageTranslation';
import { buildHooksMock, resetSymptomHooks } from './symptomTestKit';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

jest.mock('@/hooks/useSymptoms', () =>
  jest.requireActual('./symptomTestKit').buildHooksMock()
);

void buildHooksMock;

const TODAY = '2026-09-29';

beforeEach(() => {
  resetSymptomHooks();
});

describe('SymptomLogForm: browser page translation', () => {
  it('keeps working when typing into Notes after the page was translated', () => {
    const { container } = render(
      <SymptomLogForm
        selectedDate={TODAY}
        today={TODAY}
        meds={[]}
        initialSymptomName="headache"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Notes/ }));

    simulatePageTranslation(container);

    // The first keystroke re-renders two bare text nodes the translator has
    // already replaced: the "optional" summary next to the section title and
    // the selected symptom name that Radix Select portals into its trigger.
    // Both used to throw "Failed to execute 'removeChild' on 'Node'".
    expect(() =>
      fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), {
        target: { value: 'G' },
      })
    ).not.toThrow();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('G');
  });
});
