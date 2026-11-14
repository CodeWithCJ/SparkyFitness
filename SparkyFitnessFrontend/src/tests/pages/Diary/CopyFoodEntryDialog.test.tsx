import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { format } from 'date-fns';
import CopyFoodEntryDialog from '@/pages/Diary/CopyFoodEntryDialog';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    loggingLevel: 'ERROR',
    formatDateInUserTimezone: (date: Date, fmt: string) => format(date, fmt),
  }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({
    data: [
      { id: 'b', name: 'breakfast', default_time: '00:00' },
      { id: 'l', name: 'lunch', default_time: null },
    ],
  }),
}));

const renderDialog = (foodName?: string) => {
  const onCopy = jest.fn();
  render(
    <CopyFoodEntryDialog
      isOpen
      onClose={jest.fn()}
      onCopy={onCopy}
      sourceMealType="lunch"
      foodName={foodName}
    />
  );
  return onCopy;
};

describe('CopyFoodEntryDialog', () => {
  it('offers Now only when copying a single food', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Now' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tomorrow' })
    ).toBeInTheDocument();
  });

  it('copies a food to now in the meal for the current time', () => {
    const onCopy = renderDialog('Coffee');
    fireEvent.click(screen.getByRole('button', { name: 'Now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopy).toHaveBeenCalledWith(
      format(new Date(), 'yyyy-MM-dd'),
      'breakfast',
      'now'
    );
  });

  it('copies to tomorrow and keeps the meal type', () => {
    const onCopy = renderDialog('Coffee');
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(onCopy).toHaveBeenCalledWith(
      format(tomorrow, 'yyyy-MM-dd'),
      'lunch',
      'tomorrow'
    );
  });
});
