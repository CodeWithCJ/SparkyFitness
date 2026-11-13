import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReportsControls from '@/pages/Reports/ReportsControls';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/components/ui/DateRangeWithPresets', () => ({
  DateRangePickerWithPresets: () => <div data-testid="date-range" />,
}));

const baseProps = {
  startDate: '2026-10-01',
  endDate: '2026-10-14',
  onStartDateChange: jest.fn(),
  onEndDateChange: jest.fn(),
  activeTab: 'charts',
  onTabChange: jest.fn(),
};

describe('ReportsControls', () => {
  it('hides the date range when showDateRange is false and lists the Compare tab last', () => {
    const { rerender } = render(
      <ReportsControls {...baseProps} showDateRange />
    );
    expect(screen.getByTestId('date-range')).toBeInTheDocument();
    const tabs = screen.getAllByRole('button');
    expect(tabs[tabs.length - 1]).toHaveTextContent('Compare');

    rerender(
      <ReportsControls
        {...baseProps}
        activeTab="compare"
        showDateRange={false}
      />
    );
    expect(screen.queryByTestId('date-range')).not.toBeInTheDocument();
  });
});
