import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NutritionLabelImageInput } from '@/components/FoodSearch/NutritionLabelImageInput';
import { HttpApiError } from '@/api/api';
import { scanNutritionLabel } from '@/api/Foods/foodService';
import { prepareLabelImage } from '@/utils/nutritionLabelScan';
import {
  nutritionLabelScanResultSchema,
  type NutritionLabelScanResult,
} from '@workspace/shared';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Foods/foodService', () => ({
  scanNutritionLabel: jest.fn(),
}));
jest.mock('@/utils/nutritionLabelScan', () => ({
  ...jest.requireActual('@/utils/nutritionLabelScan'),
  prepareLabelImage: jest.fn(),
}));

const scan = jest.mocked(scanNutritionLabel);
const prepare = jest.mocked(prepareLabelImage);
const png = () => new File(['png'], 'label.png', { type: 'image/png' });

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

function pasteImage() {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [png()] } });
  document.dispatchEvent(event);
}

beforeEach(() => {
  scan.mockReset();
  prepare.mockReset();
  prepare.mockResolvedValue({ image: 'abc', mime_type: 'image/jpeg' });
});

it('opens the food form with the values read from an uploaded label', async () => {
  scan.mockResolvedValue(
    nutritionLabelScanResultSchema.parse({
      name: 'Oat Bar',
      serving_size: 40,
      serving_unit: 'g',
      calories: 180,
    })
  );
  const onLabelScanned = jest.fn();
  renderWithClient(
    <NutritionLabelImageInput onLabelScanned={onLabelScanned} />
  );

  fireEvent.change(screen.getByTestId('image-source-file-input'), {
    target: { files: [png()] },
  });

  await waitFor(() => expect(onLabelScanned).toHaveBeenCalledTimes(1));
  expect(scan).toHaveBeenCalledWith({ image: 'abc', mime_type: 'image/jpeg' });
  expect(onLabelScanned.mock.calls[0][0]).toMatchObject({
    id: '',
    name: 'Oat Bar',
    variants: [{ serving_size: 40, serving_unit: 'g', calories: 180 }],
  });
});

it('shows that the label is being read', async () => {
  scan.mockReturnValue(new Promise(() => {}));
  renderWithClient(<NutritionLabelImageInput onLabelScanned={jest.fn()} />);

  pasteImage();

  expect(
    await screen.findByRole('button', { name: /Reading label/ })
  ).toBeDisabled();
});

it.each([
  ['no_ai_configured', 'Add one in Settings → AI Service'],
  ['api_key_missing', 'cannot be used to read labels: Server said no'],
  ['unsupported_media', 'Try a JPEG or PNG photo'],
  ['parse_error', 'No nutrition facts could be read'],
  ['timeout', 'did not answer'],
  [undefined, 'The label could not be read'],
])('explains a %s failure', async (code, message) => {
  scan.mockRejectedValue(new HttpApiError('Server said no', 422, code));
  const onLabelScanned = jest.fn();
  renderWithClient(
    <NutritionLabelImageInput onLabelScanned={onLabelScanned} />
  );

  pasteImage();

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(onLabelScanned).not.toHaveBeenCalled();
});

it('drops a result that arrives after the input is closed', async () => {
  let finish: (value: NutritionLabelScanResult) => void = () => {};
  scan.mockReturnValue(
    new Promise<NutritionLabelScanResult>((resolve) => {
      finish = resolve;
    })
  );
  const onLabelScanned = jest.fn();
  const { unmount } = renderWithClient(
    <NutritionLabelImageInput onLabelScanned={onLabelScanned} />
  );

  pasteImage();
  await waitFor(() => expect(scan).toHaveBeenCalled());
  unmount();
  finish(nutritionLabelScanResultSchema.parse({ calories: 100 }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(onLabelScanned).not.toHaveBeenCalled();
});
