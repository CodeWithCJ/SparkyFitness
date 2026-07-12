import React from 'react';
import { render } from '@testing-library/react-native';
import FormInput from '../../src/components/FormInput';
import { scheduleAndroidImeShowRetry } from '../../src/utils/keyboardFocus';

jest.mock('../../src/utils/keyboardFocus', () => ({
  scheduleAndroidImeShowRetry: jest.fn(),
}));

const mockedScheduleRetry = scheduleAndroidImeShowRetry as jest.Mock;

describe('FormInput', () => {
  beforeEach(() => {
    mockedScheduleRetry.mockClear();
  });

  it('backs autoFocus up with the Android IME retry', () => {
    render(<FormInput autoFocus />);

    expect(mockedScheduleRetry).toHaveBeenCalledTimes(1);
  });

  it('schedules no retry without autoFocus', () => {
    render(<FormInput />);

    expect(mockedScheduleRetry).not.toHaveBeenCalled();
  });

  it('exposes the inner TextInput through the forwarded ref', () => {
    const ref = React.createRef<React.ComponentRef<typeof FormInput>>();

    render(<FormInput ref={ref} testID="form-input" />);

    expect(ref.current).not.toBeNull();
  });
});
