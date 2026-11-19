import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodImportFromCSV from '@/pages/Foods/FoodImportFromCSV';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    dateFormat: 'yyyy-MM-dd',
  }),
}));

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const REQUIRED =
  'name,brand,is_custom,shared_with_public,serving_size,serving_unit,calories,protein,carbs,fat,saturated_fat,polyunsaturated_fat,monounsaturated_fat,trans_fat,cholesterol,sodium,potassium,dietary_fiber,sugars,vitamin_a,vitamin_c,calcium,iron,is_default';
const REQUIRED_VALUES =
  'Cola,Fizz,true,false,100,ml,42,0,10.6,0,0,0,0,0,0,10,0,0,10.6,0,0,0,0,true';

async function importCsv(csv: string) {
  const onSave = jest.fn().mockResolvedValue(undefined);
  render(<FoodImportFromCSV onSave={onSave} onDirtyChange={jest.fn()} />);
  fireEvent.change(
    screen.getByPlaceholderText('Or paste CSV content here...'),
    {
      target: { value: csv },
    }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Parse Text' }));
  fireEvent.click(await screen.findByRole('button', { name: /Import 1/ }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0][0];
}

describe('FoodImportFromCSV health score columns', () => {
  it('parses added_sugars and fruit_veg_legume_percent when present', async () => {
    const row = await importCsv(
      `${REQUIRED},added_sugars,fruit_veg_legume_percent\n${REQUIRED_VALUES},10.6,0`
    );
    expect(row).toMatchObject({
      added_sugars: 10.6,
      fruit_veg_legume_percent: 0,
    });
  });

  it('turns a blank cell into null, not 0', async () => {
    const row = await importCsv(
      `${REQUIRED},added_sugars,fruit_veg_legume_percent\n${REQUIRED_VALUES},,`
    );
    expect(row.added_sugars).toBeNull();
    expect(row.fruit_veg_legume_percent).toBeNull();
  });

  it('keeps a valid nutri_score_category', async () => {
    const row = await importCsv(
      `${REQUIRED},nutri_score_category\n${REQUIRED_VALUES},beverage`
    );
    expect(row.nutri_score_category).toBe('beverage');
  });

  it('nulls an unknown nutri_score_category', async () => {
    const row = await importCsv(
      `${REQUIRED},nutri_score_category\n${REQUIRED_VALUES},cheese`
    );
    expect(row.nutri_score_category).toBeNull();
  });

  it('accepts a file without the columns and leaves them off the row', async () => {
    const row = await importCsv(`${REQUIRED}\n${REQUIRED_VALUES}`);
    expect(row.added_sugars ?? null).toBeNull();
    expect(row.fruit_veg_legume_percent ?? null).toBeNull();
    expect(row.sugars).toBe(10.6);
  });
});
