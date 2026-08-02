import React from 'react';
import { Alert, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SwipeableDeleteRow from '../../src/components/SwipeableDeleteRow';

type AlertButton = { text: string; style?: string; onPress?: () => void };

describe('SwipeableDeleteRow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirms before deleting from the swipe action', () => {
    const onConfirmDelete = jest.fn();
    let buttons: AlertButton[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => {
      buttons = b as AlertButton[];
    });

    const screen = render(
      <SwipeableDeleteRow title="Anatomy scan" onConfirmDelete={onConfirmDelete}>
        <Text>Anatomy scan</Text>
      </SwipeableDeleteRow>,
    );

    fireEvent.press(screen.getByText('Delete'));
    expect(alertSpy.mock.calls[0][0]).toBe('Delete Anatomy scan?');
    expect(onConfirmDelete).not.toHaveBeenCalled();

    buttons.find((b) => b.text === 'Delete')?.onPress?.();
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
  });

  it('cancelling the confirm dialog does not delete', () => {
    const onConfirmDelete = jest.fn();
    let buttons: AlertButton[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => {
      buttons = b as AlertButton[];
    });

    const screen = render(
      <SwipeableDeleteRow title="Row" onConfirmDelete={onConfirmDelete}>
        <Text>Row</Text>
      </SwipeableDeleteRow>,
    );

    fireEvent.press(screen.getByText('Delete'));
    buttons.find((b) => b.text === 'Cancel')?.onPress?.();

    expect(onConfirmDelete).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('long-press opens a Delete / Cancel menu that deletes directly', () => {
    const onConfirmDelete = jest.fn();
    let buttons: AlertButton[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => {
      buttons = b as AlertButton[];
    });

    const screen = render(
      <SwipeableDeleteRow title="Anatomy scan" onConfirmDelete={onConfirmDelete}>
        <Text>Anatomy scan</Text>
      </SwipeableDeleteRow>,
    );

    fireEvent(screen.getByText('Anatomy scan'), 'longPress');
    expect(alertSpy.mock.calls[0][0]).toBe('Anatomy scan');
    expect(buttons.map((b) => b.text)).toEqual(['Delete', 'Cancel']);

    buttons.find((b) => b.text === 'Delete')?.onPress?.();
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
  });
});
