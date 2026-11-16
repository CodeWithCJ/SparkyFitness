import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BarcodeScannerDialog } from '@/components/FoodSearch/BarcodeScannerDialog';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/utils/chunkRecovery', () => ({
  lazyWithChunkRecovery: () =>
    function CameraScanner() {
      return <div>camera scanner</div>;
    },
}));
jest.mock('@/components/FoodSearch/BarcodeImageInput', () => ({
  BarcodeImageInput: () => <div>barcode image input</div>,
}));
jest.mock('@/components/FoodSearch/NutritionLabelImageInput', () => ({
  NutritionLabelImageInput: () => <div>label image input</div>,
}));

const baseProps = {
  isOpen: true,
  onOpenChange: jest.fn(),
  onBarcodeDetected: jest.fn(),
  hideProvider: true,
};

it('reads only barcodes when the caller takes no label', () => {
  render(<BarcodeScannerDialog {...baseProps} />);

  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.getByText('barcode image input')).toBeInTheDocument();
  expect(screen.getByText('camera scanner')).toBeInTheDocument();
  expect(screen.queryByText('label image input')).not.toBeInTheDocument();
});

it('switches between barcode and nutrition label', () => {
  render(<BarcodeScannerDialog {...baseProps} onLabelScanned={jest.fn()} />);

  expect(screen.getByRole('tab', { name: 'Barcode' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  expect(screen.getByText('camera scanner')).toBeInTheDocument();

  // Radix tabs switch on mouse down, not click.
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Nutrition label' }), {
    button: 0,
  });

  expect(
    screen.getByRole('heading', { name: 'Scan Nutrition Label' })
  ).toBeInTheDocument();
  expect(screen.getByText('label image input')).toBeInTheDocument();
  // The camera and the barcode paste target are gone, so a pasted image
  // goes to the label reader only.
  expect(screen.queryByText('camera scanner')).not.toBeInTheDocument();
  expect(screen.queryByText('barcode image input')).not.toBeInTheDocument();
});
