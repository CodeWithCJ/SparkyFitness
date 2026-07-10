import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SwipeableIngredientRow from '../../src/components/SwipeableIngredientRow';

type AlertButton = { text: string; style?: string; onPress?: () => void };

const baseProps = {
  foodName: 'Chicken',
  quantityLabel: '100 g',
  caloriesLabel: '165 Cal',
  showBottomBorder: false,
  isLastIngredient: false,
  onConfirmDelete: jest.fn(),
  onPress: jest.fn(),
};

describe('SwipeableIngredientRow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('long-press opens an Arabic edit, delete, and cancel menu', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = render(<SwipeableIngredientRow {...baseProps} />);

    fireEvent(screen.getByText('Chicken'), 'longPress');

    expect(alertSpy).toHaveBeenCalled();
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Chicken');
    expect(message).toBeUndefined();
    const labels = (buttons as AlertButton[]).map((b) => b.text);
    expect(labels).toEqual(expect.arrayContaining(['تعديل', 'حذف', 'إلغاء']));

    alertSpy.mockRestore();
  });

  it('long-press Edit fires onPress and Delete fires onConfirmDelete', () => {
    const onPress = jest.fn();
    const onConfirmDelete = jest.fn();
    let buttons: AlertButton[] = [];
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, b) => {
        buttons = b as AlertButton[];
      });

    const screen = render(
      <SwipeableIngredientRow {...baseProps} onPress={onPress} onConfirmDelete={onConfirmDelete} />,
    );
    fireEvent(screen.getByText('Chicken'), 'longPress');

    buttons.find((b) => b.text === 'تعديل')?.onPress?.();
    buttons.find((b) => b.text === 'حذف')?.onPress?.();

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
  });

  it('warns when removing the last ingredient that another is needed to save', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = render(<SwipeableIngredientRow {...baseProps} isLastIngredient />);

    fireEvent(screen.getByText('Chicken'), 'longPress');

    expect(alertSpy.mock.calls[0][1]).toBe(
      'هذا آخر مكوّن. أضف مكوّنًا ثانيًا قبل الحفظ، أو احذف الوجبة كاملة.',
    );

    alertSpy.mockRestore();
  });
});
