import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MedicationReports from '@/pages/Reports/MedicationReports';

jest.mock('react-i18next', () => ({
  Trans: ({
    defaults,
    components,
  }: {
    defaults: string;
    components?: Record<string, React.ReactElement>;
  }) => {
    const match = defaults.match(/^<strong>(.*?)<\/strong>(.*)$/s);
    if (!match || !components?.['strong']) return defaults;
    return (
      <>
        {React.cloneElement(components['strong'], {}, match[1])}
        {match[2]}
      </>
    );
  },
  useTranslation: () => ({
    t: (
      key: string,
      defaultValueOrOptions?: string | Record<string, unknown>
    ) => {
      if (typeof defaultValueOrOptions === 'string') {
        return defaultValueOrOptions;
      }

      const defaultValue = defaultValueOrOptions?.['defaultValue'];
      if (typeof defaultValue !== 'string') return key;

      return defaultValue.replace(/{{(\w+)}}/g, (_match, name: string) =>
        String(defaultValueOrOptions?.[name] ?? `{{${name}}}`)
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (date: string | Date) => String(date),
    weightUnit: 'lbs',
    convertWeight: (value: number) => value,
    timezone: 'UTC',
    dateFormat: 'yyyy-MM-dd',
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: null }),
}));

jest.mock('@/hooks/useMedicationDisplayPreferences', () => ({
  useMedicationDisplayPreferences: () => ({ data: [] }),
  useUpsertMedicationDisplayPreferenceMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/pages/Reports/MedicationLogTable', () => () => null);

jest.mock('recharts', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Nothing = () => null;
  return {
    ResponsiveContainer: Container,
    LineChart: Container,
    BarChart: Container,
    Line: Nothing,
    Bar: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
    CartesianGrid: Nothing,
    Tooltip: Nothing,
    Legend: Nothing,
  };
});

describe('MedicationReports localization', () => {
  it('interpolates the selected weight unit in the weight trend title', () => {
    render(
      <MedicationReports
        startDate="2026-08-01"
        endDate="2026-08-01"
        nutritionData={[]}
        tabularData={[]}
        exerciseEntries={[]}
        measurementData={[]}
        customCategories={[]}
        customMeasurementsData={[]}
        sleepAnalyticsData={[]}
        medications={[]}
        medicationEntries={[]}
        symptomEntries={[]}
        injections={[]}
        titrationSteps={[]}
      />
    );

    expect(
      screen.getByText('Weight Trend vs. Target Weight (lbs)')
    ).toBeInTheDocument();
    expect(screen.queryByText(/{{unit}}/)).not.toBeInTheDocument();
  });

  it('preserves emphasized recommendation labels after localization', () => {
    render(
      <MedicationReports
        startDate="2026-08-01"
        endDate="2026-08-01"
        nutritionData={[
          { date: '2026-08-01', water: 1000 },
          { date: '2026-08-02', water: 2000 },
          { date: '2026-08-03', water: 3000 },
          { date: '2026-08-04', water: 4000 },
          { date: '2026-08-05', water: 5000 },
        ]}
        tabularData={[]}
        exerciseEntries={[]}
        measurementData={[]}
        customCategories={[]}
        customMeasurementsData={[]}
        sleepAnalyticsData={[]}
        medications={[]}
        medicationEntries={[]}
        symptomEntries={[
          {
            id: 'symptom-1',
            entry_date: '2026-08-01',
            symptom_name_snapshot: 'constipation',
            severity: 3,
          },
          {
            id: 'symptom-2',
            entry_date: '2026-08-02',
            symptom_name_snapshot: 'constipation',
            severity: 2,
          },
          {
            id: 'symptom-3',
            entry_date: '2026-08-03',
            symptom_name_snapshot: 'constipation',
            severity: 3,
          },
          {
            id: 'symptom-4',
            entry_date: '2026-08-04',
            symptom_name_snapshot: 'constipation',
            severity: 2,
          },
          {
            id: 'symptom-5',
            entry_date: '2026-08-05',
            symptom_name_snapshot: 'constipation',
            severity: 1,
          },
        ]}
        injections={[]}
        titrationSteps={[]}
      />
    );

    expect(screen.getByText('Strong Hydration Benefit:').tagName).toBe(
      'STRONG'
    );
  });
});
