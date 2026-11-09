import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BarcodeImageInput } from '@/components/FoodSearch/BarcodeImageInput';
import { decodeBarcodeFromImage } from '@/lib/scannerEngines/decodeBarcodeImage';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'ERROR' }),
}));
jest.mock('@/lib/scannerEngines/decodeBarcodeImage', () => ({
  decodeBarcodeFromImage: jest.fn(),
}));

const decode = jest.mocked(decodeBarcodeFromImage);
const png = () => new File(['png'], 'barcode.png', { type: 'image/png' });

function pasteFiles(files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files } });
  document.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  decode.mockReset();
});

it('looks up the barcode found in an uploaded image', async () => {
  decode.mockResolvedValue({ status: 'found', code: '0123456789012' });
  const onBarcodeDetected = jest.fn();
  render(<BarcodeImageInput onBarcodeDetected={onBarcodeDetected} />);

  const image = png();
  fireEvent.change(screen.getByTestId('image-source-file-input'), {
    target: { files: [image] },
  });

  await waitFor(() =>
    expect(onBarcodeDetected).toHaveBeenCalledWith('0123456789012')
  );
  expect(decode).toHaveBeenCalledWith(image);
});

it('reads a pasted image and takes the paste from the page', async () => {
  decode.mockResolvedValue({ status: 'found', code: '96385074' });
  const onBarcodeDetected = jest.fn();
  render(<BarcodeImageInput onBarcodeDetected={onBarcodeDetected} />);

  const event = pasteFiles([png()]);

  expect(event.defaultPrevented).toBe(true);
  await waitFor(() =>
    expect(onBarcodeDetected).toHaveBeenCalledWith('96385074')
  );
});

it('leaves a paste without an image to the focused field', () => {
  render(<BarcodeImageInput onBarcodeDetected={jest.fn()} />);

  const event = pasteFiles([
    new File(['text'], 'notes.txt', { type: 'text/plain' }),
  ]);

  expect(event.defaultPrevented).toBe(false);
  expect(decode).not.toHaveBeenCalled();
});

it('reads a dropped image', async () => {
  decode.mockResolvedValue({ status: 'found', code: '0123456789012' });
  const onBarcodeDetected = jest.fn();
  render(<BarcodeImageInput onBarcodeDetected={onBarcodeDetected} />);

  fireEvent.drop(screen.getByTestId('image-source-drop-zone'), {
    dataTransfer: { files: [png()], types: ['Files'] },
  });

  await waitFor(() =>
    expect(onBarcodeDetected).toHaveBeenCalledWith('0123456789012')
  );
});

it('says so when the image has no barcode', async () => {
  decode.mockResolvedValue({ status: 'not_found' });
  const onBarcodeDetected = jest.fn();
  render(<BarcodeImageInput onBarcodeDetected={onBarcodeDetected} />);

  pasteFiles([png()]);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No barcode found in this image'
  );
  expect(onBarcodeDetected).not.toHaveBeenCalled();
});

it('says so when the image cannot be opened', async () => {
  decode.mockResolvedValue({ status: 'unreadable' });
  render(<BarcodeImageInput onBarcodeDetected={jest.fn()} />);

  pasteFiles([png()]);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This image could not be opened'
  );
});

it('stops listening for pastes once removed', () => {
  const { unmount } = render(
    <BarcodeImageInput onBarcodeDetected={jest.fn()} />
  );
  unmount();

  const event = pasteFiles([png()]);

  expect(event.defaultPrevented).toBe(false);
  expect(decode).not.toHaveBeenCalled();
});
