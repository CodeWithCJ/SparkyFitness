import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import Switch from '../../../src/components/ui/Switch';

const opacityOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style)?.opacity;

describe('Switch', () => {
  describe('on Android, where the app colours ignore the enabled state', () => {
    let osSpy: jest.ReplaceProperty<typeof Platform.OS>;
    beforeEach(() => {
      osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    });
    afterEach(() => osSpy.restore());

    it('dims a disabled switch, so it does not look usable', () => {
      render(<Switch value disabled testID="switch" />);
      expect(opacityOf('switch')).toBe(0.5);
    });

    it('dims one disabled through its accessibility state too', () => {
      render(
        <Switch value accessibilityState={{ disabled: true }} testID="switch" />
      );
      expect(opacityOf('switch')).toBe(0.5);
    });

    it('follows `disabled` over the accessibility state, as React Native does', () => {
      render(
        <Switch
          value
          disabled={false}
          accessibilityState={{ disabled: true }}
          testID="switch"
        />
      );
      expect(opacityOf('switch')).toBeUndefined();
    });

    it('leaves an enabled switch as it is, keeping the style it was given', () => {
      render(
        <Switch
          value
          disabled={false}
          style={{ marginTop: 4 }}
          testID="switch"
        />
      );
      expect(opacityOf('switch')).toBeUndefined();
      expect(
        StyleSheet.flatten(screen.getByTestId('switch').props.style)?.marginTop
      ).toBe(4);
    });

    it('keeps the style it was given when disabled', () => {
      render(
        <Switch value disabled style={{ marginTop: 4 }} testID="switch" />
      );
      const style = StyleSheet.flatten(
        screen.getByTestId('switch').props.style
      );
      expect(style).toMatchObject({ marginTop: 4, opacity: 0.5 });
    });
  });

  describe('on iOS', () => {
    let osSpy: jest.ReplaceProperty<typeof Platform.OS>;
    beforeEach(() => {
      osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    });
    afterEach(() => osSpy.restore());

    it('leaves a disabled switch to iOS, which dims it itself', () => {
      render(<Switch value disabled testID="switch" />);
      expect(opacityOf('switch')).toBeUndefined();
    });
  });
});
