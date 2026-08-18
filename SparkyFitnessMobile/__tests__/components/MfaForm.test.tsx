import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MfaForm from '../../src/components/MfaForm';

describe('MfaForm localization-safe behavior', () => {
  const props = {
    mfaFactors: { mfaTotpEnabled: true, mfaEmailEnabled: true },
    mfaMethod: 'totp' as const,
    onMfaMethodChange: jest.fn(),
    mfaCode: '',
    onMfaCodeChange: jest.fn(),
    emailOtpSent: false,
    error: '',
    loading: false,
    onVerify: jest.fn(),
    onSendEmailOtp: jest.fn(),
    onBack: jest.fn(),
    textMuted: '#888',
  };

  it('renders both MFA methods and filters verification input to six digits', () => {
    const view = render(<MfaForm {...props} />);
    expect(view.getByText('Authenticator App')).toBeTruthy();
    expect(view.getByText('Email Code')).toBeTruthy();
    expect(view.getByText('Enter the code from your authenticator app.')).toBeTruthy();
    fireEvent.changeText(view.getByPlaceholderText('000000'), '12a34567');
    expect(props.onMfaCodeChange).toHaveBeenCalledWith('123456');
  });

  it('supports requesting an email code, resend, verify and back actions', () => {
    const view = render(<MfaForm {...props} mfaMethod="email" />);
    fireEvent.press(view.getByText('Send Code'));
    expect(props.onSendEmailOtp).toHaveBeenCalled();
    view.rerender(<MfaForm {...props} mfaMethod="email" emailOtpSent />);
    expect(view.getByText('Resend Code')).toBeTruthy();
    fireEvent.press(view.getByText('Resend Code'));
    fireEvent.press(view.getByText('Back'));
    expect(props.onSendEmailOtp).toHaveBeenCalledTimes(2);
    expect(props.onBack).toHaveBeenCalled();
  });
});
